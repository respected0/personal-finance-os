import { createHash, randomUUID } from "node:crypto";
import type { LedgerSql } from "./ledger-repository.js";
import {
  applyUserScope,
  withUserScope,
  type UserScopedSql,
} from "./user-scope.js";

export type MinimumPaymentRule =
  | {
      readonly type: "percentage";
      readonly rate: string;
      readonly minimumAmount: string;
    }
  | { readonly type: "fixed"; readonly amount: string };

export interface CreditCardProfileRecord {
  readonly accountId: string;
  readonly creditLimit: string;
  readonly statementDay: number;
  readonly dueDay: number;
  readonly minimumPaymentRule: MinimumPaymentRule;
  readonly active: boolean;
  readonly rowVersion: number;
}

export interface CreditCardStatementRecord {
  readonly id: string;
  readonly cardAccountId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly closingBalance: string;
  readonly minimumDue: string;
  readonly paidAmount: string;
  readonly outstandingAmount: string;
  readonly dueDate: string;
  readonly status: "open" | "partially_paid" | "paid" | "overdue";
}

export class CardNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("The credit-card account or statement was not found.");
    this.name = "CardNotFoundError";
  }
}

async function appendCardEvidence(
  sql: UserScopedSql,
  input: {
    readonly userId: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly action: string;
    readonly requestId: string;
    readonly after: Record<string, unknown>;
  },
): Promise<void> {
  await sql`
    select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(${input.userId}, 0)
    )
  `;
  const previousRows = await sql<{ readonly event_hash: string }[]>`
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
  await sql`
    insert into app_private.audit_events (
      id, user_id, entity_type, entity_id, action, before_json, after_json,
      actor_session_id, request_id, prev_hash, event_hash
    ) values (
      ${randomUUID()}::uuid,
      ${input.userId}::uuid,
      ${input.entityType},
      ${input.entityId}::uuid,
      ${input.action},
      null,
      ${sql.json(JSON.parse(JSON.stringify(input.after)))},
      null,
      ${input.requestId},
      case when ${previousHash} = '' then null else decode(${previousHash}, 'hex') end,
      decode(${eventHash}, 'hex')
    )
  `;
  await sql`
    insert into app_private.outbox_events (
      id, user_id, aggregate_type, aggregate_id, event_type,
      event_version, schema_version, payload
    ) values (
      ${randomUUID()}::uuid,
      ${input.userId}::uuid,
      ${input.entityType},
      ${input.entityId}::uuid,
      ${`${input.entityType}.${input.action}`},
      1,
      1,
      ${sql.json(JSON.parse(JSON.stringify(input.after)))}
    )
  `;
}

function profileFromRow(row: {
  readonly account_id: string;
  readonly credit_limit: string;
  readonly statement_day: number;
  readonly due_day: number;
  readonly minimum_payment_rule: MinimumPaymentRule;
  readonly active: boolean;
  readonly row_version: number;
}): CreditCardProfileRecord {
  return {
    accountId: row.account_id,
    creditLimit: row.credit_limit,
    statementDay: row.statement_day,
    dueDay: row.due_day,
    minimumPaymentRule: row.minimum_payment_rule,
    active: row.active,
    rowVersion: row.row_version,
  };
}

export async function createCreditCardProfile(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly accountId: string;
    readonly creditLimit: string;
    readonly statementDay: number;
    readonly dueDay: number;
    readonly minimumPaymentRule: MinimumPaymentRule;
    readonly requestId: string;
  },
): Promise<CreditCardProfileRecord> {
  return sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const accountRows = await tx`
      select id
        from app_private.financial_accounts
       where user_id = ${input.userId}::uuid
         and id = ${input.accountId}::uuid
         and account_type = 'credit_card'
         and status = 'active'
       for update
    `;
    if (!accountRows[0]) throw new CardNotFoundError();
    const rows = await tx<
      {
        readonly account_id: string;
        readonly credit_limit: string;
        readonly statement_day: number;
        readonly due_day: number;
        readonly minimum_payment_rule: MinimumPaymentRule;
        readonly active: boolean;
        readonly row_version: number;
      }[]
    >`
      insert into app_private.credit_card_profiles (
        account_id, user_id, credit_limit, statement_day, due_day,
        minimum_payment_rule
      ) values (
        ${input.accountId}::uuid,
        ${input.userId}::uuid,
        ${input.creditLimit}::numeric,
        ${input.statementDay},
        ${input.dueDay},
        ${tx.json(input.minimumPaymentRule)}
      )
      returning account_id::text, credit_limit::text, statement_day, due_day,
                minimum_payment_rule, active, row_version
    `;
    const row = rows[0];
    if (!row) throw new Error("Credit-card profile insert returned no row.");
    await appendCardEvidence(tx, {
      userId: input.userId,
      entityType: "credit_card_profile",
      entityId: input.accountId,
      action: "created",
      requestId: input.requestId,
      after: {
        account_id: input.accountId,
        credit_limit: input.creditLimit,
        statement_day: input.statementDay,
        due_day: input.dueDay,
      },
    });
    return profileFromRow(row);
  });
}

export async function listCreditCardProfiles(
  sql: LedgerSql,
  userId: string,
): Promise<readonly CreditCardProfileRecord[]> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) =>
      tx<
        {
          readonly account_id: string;
          readonly credit_limit: string;
          readonly statement_day: number;
          readonly due_day: number;
          readonly minimum_payment_rule: MinimumPaymentRule;
          readonly active: boolean;
          readonly row_version: number;
        }[]
      >`
      select account_id::text, credit_limit::text, statement_day, due_day,
             minimum_payment_rule, active, row_version
        from app_private.credit_card_profiles
       where user_id = ${userId}::uuid
       order by active desc, created_at, account_id
    `,
  );
  return rows.map(profileFromRow);
}

export async function createCreditCardStatement(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly cardAccountId: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly closingBalance: string;
    readonly minimumDue: string;
    readonly dueDate: string;
    readonly requestId: string;
  },
): Promise<CreditCardStatementRecord> {
  const id = randomUUID();
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const profileRows = await tx`
      select account_id
        from app_private.credit_card_profiles
       where user_id = ${input.userId}::uuid
         and account_id = ${input.cardAccountId}::uuid
         and active
       for share
    `;
    if (!profileRows[0]) throw new CardNotFoundError();
    await tx`
      insert into app_private.credit_card_statements (
        id, user_id, card_account_id, period_start, period_end,
        closing_balance, minimum_due, due_date
      ) values (
        ${id}::uuid,
        ${input.userId}::uuid,
        ${input.cardAccountId}::uuid,
        ${input.periodStart}::date,
        ${input.periodEnd}::date,
        ${input.closingBalance}::numeric,
        ${input.minimumDue}::numeric,
        ${input.dueDate}::date
      )
    `;
    await appendCardEvidence(tx, {
      userId: input.userId,
      entityType: "credit_card_statement",
      entityId: id,
      action: "created",
      requestId: input.requestId,
      after: {
        card_account_id: input.cardAccountId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        closing_balance: input.closingBalance,
      },
    });
  });
  const statements = await listCreditCardStatements(
    sql,
    input.userId,
    input.cardAccountId,
  );
  const statement = statements.find((candidate) => candidate.id === id);
  if (!statement)
    throw new Error("Credit-card statement insert returned no row.");
  return statement;
}

export async function listCreditCardStatements(
  sql: LedgerSql,
  userId: string,
  cardAccountId: string,
): Promise<readonly CreditCardStatementRecord[]> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) =>
      tx<
        {
          readonly id: string;
          readonly card_account_id: string;
          readonly period_start: string;
          readonly period_end: string;
          readonly closing_balance: string;
          readonly minimum_due: string;
          readonly paid_amount: string;
          readonly outstanding_amount: string;
          readonly due_date: string;
          readonly status: CreditCardStatementRecord["status"];
        }[]
      >`
      select id::text, card_account_id::text, period_start::text,
             period_end::text, closing_balance::text, minimum_due::text,
             paid_amount::text,
             (closing_balance - paid_amount)::numeric(19,4)::text as outstanding_amount,
             due_date::text, status
        from app_private.credit_card_statements
       where user_id = ${userId}::uuid
         and card_account_id = ${cardAccountId}::uuid
       order by period_end desc, id desc
    `,
  );
  return rows.map((row) => ({
    id: row.id,
    cardAccountId: row.card_account_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    closingBalance: row.closing_balance,
    minimumDue: row.minimum_due,
    paidAmount: row.paid_amount,
    outstandingAmount: row.outstanding_amount,
    dueDate: row.due_date,
    status: row.status,
  }));
}

export interface InstallmentPlanRecord {
  readonly id: string;
  readonly purchaseTransactionId: string;
  readonly cardAccountId: string;
  readonly purchaseTotal: string;
  readonly installmentCount: number;
  readonly recognitionPolicy: "full_at_purchase";
  readonly items: readonly {
    readonly sequence: number;
    readonly dueDate: string;
    readonly cashFlowAmount: string;
    readonly status: string;
  }[];
}

export async function listInstallmentPlans(
  sql: LedgerSql,
  userId: string,
  cardAccountId: string,
): Promise<readonly InstallmentPlanRecord[]> {
  return withUserScope(sql, userId, async (tx) => {
    const plans = await tx<
      {
        readonly id: string;
        readonly purchase_transaction_id: string;
        readonly card_account_id: string;
        readonly purchase_total: string;
        readonly installment_count: number;
        readonly recognition_policy: "full_at_purchase";
      }[]
    >`
      select id::text, purchase_transaction_id::text, card_account_id::text,
             purchase_total::text, installment_count, recognition_policy
        from app_private.installment_plans
       where user_id = ${userId}::uuid
         and card_account_id = ${cardAccountId}::uuid
       order by created_at desc, id
    `;
    if (plans.length === 0) return [];
    const items = await tx<
      {
        readonly plan_id: string;
        readonly sequence: number;
        readonly due_date: string;
        readonly cash_flow_amount: string;
        readonly status: string;
      }[]
    >`
      select plan_id::text, sequence, due_date::text,
             cash_flow_amount::text, status
        from app_private.installment_items
       where user_id = ${userId}::uuid
         and plan_id = any(${plans.map(({ id }) => id)}::uuid[])
       order by plan_id, sequence
    `;
    return plans.map((plan) => ({
      id: plan.id,
      purchaseTransactionId: plan.purchase_transaction_id,
      cardAccountId: plan.card_account_id,
      purchaseTotal: plan.purchase_total,
      installmentCount: plan.installment_count,
      recognitionPolicy: plan.recognition_policy,
      items: items
        .filter(({ plan_id }) => plan_id === plan.id)
        .map((item) => ({
          sequence: item.sequence,
          dueDate: item.due_date,
          cashFlowAmount: item.cash_flow_amount,
          status: item.status,
        })),
    }));
  });
}
