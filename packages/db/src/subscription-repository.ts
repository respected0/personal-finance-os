import { createHash, randomUUID } from "node:crypto";
import type { LedgerSql } from "./ledger-repository.js";
import {
  applyUserScope,
  withUserScope,
  type UserScopedSql,
} from "./user-scope.js";

export interface SubscriptionCycleRecord {
  readonly id: string;
  readonly period: string;
  readonly renewalDate: string;
  readonly chargeTransactionId: string | null;
  readonly chargeTotal: string;
  readonly cashbackTotal: string;
  readonly actualNet: string;
}

export interface SubscriptionRecord {
  readonly id: string;
  readonly name: string;
  readonly billingDay: number;
  readonly paymentAccountId: string;
  readonly expectedGross: string;
  readonly cashbackRate: string;
  readonly cashbackCap: string;
  readonly expectedCashback: string;
  readonly expectedNet: string;
  readonly active: boolean;
  readonly rowVersion: number;
  readonly cycles: readonly SubscriptionCycleRecord[];
}

export interface SubscriptionCycleContext {
  readonly cycleId: string;
  readonly subscriptionId: string;
  readonly paymentAccountId: string;
  readonly paymentAccountKind: "bank" | "cash" | "card";
  readonly currency: string;
  readonly chargeTransactionId: string | null;
  readonly chargeTotal: string;
  readonly cashbackTotal: string;
  readonly actualNet: string;
}

export class SubscriptionNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("The subscription or cycle was not found.");
    this.name = "SubscriptionNotFoundError";
  }
}

async function appendSubscriptionEvidence(
  tx: UserScopedSql,
  input: {
    readonly userId: string;
    readonly entityId: string;
    readonly requestId: string;
    readonly after: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await tx`
    select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(${input.userId}, 0)
    )
  `;
  const previousRows = await tx<{ readonly event_hash: string }[]>`
    select encode(event_hash, 'hex') as event_hash
      from app_private.audit_events
     where user_id = ${input.userId}::uuid
     order by occurred_at desc, id desc
     limit 1
  `;
  const previousHash = previousRows[0]?.event_hash ?? "";
  const eventHash = createHash("sha256")
    .update(`${previousHash}|${input.requestId}|${JSON.stringify(input.after)}`)
    .digest("hex");
  const afterJson = JSON.parse(JSON.stringify(input.after));
  await tx`
    insert into app_private.audit_events (
      id, user_id, entity_type, entity_id, action, before_json, after_json,
      actor_session_id, request_id, prev_hash, event_hash
    ) values (
      ${randomUUID()}::uuid, ${input.userId}::uuid, 'subscription',
      ${input.entityId}::uuid, 'created', null, ${tx.json(afterJson)}, null,
      ${input.requestId},
      case when ${previousHash} = '' then null else decode(${previousHash}, 'hex') end,
      decode(${eventHash}, 'hex')
    )
  `;
  await tx`
    insert into app_private.outbox_events (
      id, user_id, aggregate_type, aggregate_id, event_type,
      event_version, schema_version, payload
    ) values (
      ${randomUUID()}::uuid, ${input.userId}::uuid, 'subscription',
      ${input.entityId}::uuid, 'subscription.created', 1, 1,
      ${tx.json(afterJson)}
    )
  `;
}

export async function createSubscription(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly name: string;
    readonly billingDay: number;
    readonly paymentAccountId: string;
    readonly expectedGross: string;
    readonly cashbackRate: string;
    readonly cashbackCap: string;
    readonly requestId: string;
  },
): Promise<SubscriptionRecord> {
  const subscriptionId = randomUUID();
  const cycleId = randomUUID();
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const accountRows = await tx`
      select id
        from app_private.financial_accounts
       where user_id = ${input.userId}::uuid
         and id = ${input.paymentAccountId}::uuid
         and account_type in ('bank', 'cash', 'credit_card')
         and status = 'active'
       for share
    `;
    if (!accountRows[0]) throw new SubscriptionNotFoundError();
    await tx`
      insert into app_private.subscriptions (
        id, user_id, name, billing_day, payment_account_id,
        expected_gross, cashback_rate, cashback_cap
      ) values (
        ${subscriptionId}::uuid, ${input.userId}::uuid, ${input.name.trim()},
        ${input.billingDay}, ${input.paymentAccountId}::uuid,
        ${input.expectedGross}::numeric, ${input.cashbackRate}::numeric,
        ${input.cashbackCap}::numeric
      )
    `;
    await tx`
      insert into app_private.subscription_cycles (
        id, user_id, subscription_id, period
      ) values (
        ${cycleId}::uuid, ${input.userId}::uuid, ${subscriptionId}::uuid,
        date_trunc('month', timezone('Europe/Istanbul', now()))::date
      )
    `;
    await appendSubscriptionEvidence(tx, {
      userId: input.userId,
      entityId: subscriptionId,
      requestId: input.requestId,
      after: {
        active: true,
        billing_day: input.billingDay,
        payment_account_id: input.paymentAccountId,
        subscription_id: subscriptionId,
      },
    });
  });
  const created = (await listSubscriptions(sql, input.userId)).find(
    ({ id }) => id === subscriptionId,
  );
  if (!created) throw new Error("Subscription insert returned no row.");
  return created;
}

interface SubscriptionRow {
  readonly id: string;
  readonly name: string;
  readonly billing_day: number;
  readonly payment_account_id: string;
  readonly expected_gross: string;
  readonly cashback_rate: string;
  readonly cashback_cap: string;
  readonly expected_cashback: string;
  readonly expected_net: string;
  readonly active: boolean;
  readonly row_version: number;
}

interface CycleRow {
  readonly id: string;
  readonly subscription_id: string;
  readonly period: string;
  readonly renewal_date: string;
  readonly charge_transaction_id: string | null;
  readonly charge_total: string;
  readonly cashback_total: string;
  readonly actual_net: string;
}

export async function listSubscriptions(
  sql: LedgerSql,
  userId: string,
): Promise<readonly SubscriptionRecord[]> {
  return withUserScope(sql, userId, async (tx) => {
    const subscriptions = await tx<SubscriptionRow[]>`
      select id::text, name, billing_day, payment_account_id::text,
             expected_gross::text, cashback_rate::text, cashback_cap::text,
             least(
               round(expected_gross * cashback_rate, 4),
               cashback_cap
             )::numeric(19,4)::text as expected_cashback,
             (expected_gross - least(
               round(expected_gross * cashback_rate, 4),
               cashback_cap
             ))::numeric(19,4)::text as expected_net,
             active, row_version
        from app_private.subscriptions
       where user_id = ${userId}::uuid and active
       order by billing_day, name, id
    `;
    const cycles = await tx<CycleRow[]>`
      select cycle.id::text, cycle.subscription_id::text, cycle.period::text,
             (cycle.period + (
               least(
                 subscription.billing_day,
                 extract(day from cycle.period + interval '1 month - 1 day')::integer
               ) - 1
             ) * interval '1 day')::date::text as renewal_date,
             cycle.charge_transaction_id::text,
             coalesce(transaction.primary_amount, 0)::numeric(19,4)::text as charge_total,
             cycle.cashback_total::text,
             cycle.actual_net::text
        from app_private.subscription_cycles as cycle
        join app_private.subscriptions as subscription
          on subscription.user_id = cycle.user_id
         and subscription.id = cycle.subscription_id
        left join app_private.transactions as transaction
          on transaction.user_id = cycle.user_id
         and transaction.id = cycle.charge_transaction_id
       where cycle.user_id = ${userId}::uuid
       order by cycle.period desc, cycle.id
    `;
    return subscriptions.map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      billingDay: subscription.billing_day,
      paymentAccountId: subscription.payment_account_id,
      expectedGross: subscription.expected_gross,
      cashbackRate: subscription.cashback_rate,
      cashbackCap: subscription.cashback_cap,
      expectedCashback: subscription.expected_cashback,
      expectedNet: subscription.expected_net,
      active: subscription.active,
      rowVersion: subscription.row_version,
      cycles: cycles
        .filter(({ subscription_id }) => subscription_id === subscription.id)
        .map((cycle) => ({
          id: cycle.id,
          period: cycle.period,
          renewalDate: cycle.renewal_date,
          chargeTransactionId: cycle.charge_transaction_id,
          chargeTotal: cycle.charge_total,
          cashbackTotal: cycle.cashback_total,
          actualNet: cycle.actual_net,
        })),
    }));
  });
}

export async function getSubscriptionCycleContext(
  sql: LedgerSql,
  userId: string,
  cycleId: string,
): Promise<SubscriptionCycleContext> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) =>
      tx<
        {
          readonly cycle_id: string;
          readonly subscription_id: string;
          readonly payment_account_id: string;
          readonly account_type: "bank" | "cash" | "credit_card";
          readonly currency: string;
          readonly charge_transaction_id: string | null;
          readonly charge_total: string;
          readonly cashback_total: string;
          readonly actual_net: string;
        }[]
      >`
      select cycle.id::text as cycle_id,
             subscription.id::text as subscription_id,
             subscription.payment_account_id::text,
             account.account_type, account.currency,
             cycle.charge_transaction_id::text,
             coalesce(transaction.primary_amount, 0)::numeric(19,4)::text as charge_total,
             cycle.cashback_total::text,
             cycle.actual_net::text
        from app_private.subscription_cycles as cycle
        join app_private.subscriptions as subscription
          on subscription.user_id = cycle.user_id
         and subscription.id = cycle.subscription_id
         and subscription.active
        join app_private.financial_accounts as account
          on account.user_id = subscription.user_id
         and account.id = subscription.payment_account_id
         and account.status = 'active'
        left join app_private.transactions as transaction
          on transaction.user_id = cycle.user_id
         and transaction.id = cycle.charge_transaction_id
       where cycle.user_id = ${userId}::uuid
         and cycle.id = ${cycleId}::uuid
       for update of cycle
    `,
  );
  const row = rows[0];
  if (!row) throw new SubscriptionNotFoundError();
  return {
    cycleId: row.cycle_id,
    subscriptionId: row.subscription_id,
    paymentAccountId: row.payment_account_id,
    paymentAccountKind:
      row.account_type === "credit_card" ? "card" : row.account_type,
    currency: row.currency.trim(),
    chargeTransactionId: row.charge_transaction_id,
    chargeTotal: row.charge_total,
    cashbackTotal: row.cashback_total,
    actualNet: row.actual_net,
  };
}
