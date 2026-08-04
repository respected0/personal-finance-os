import { createHash, randomUUID } from "node:crypto";
import {
  canonicalCommandJson,
  hashTransactionCommand,
  previewTransaction,
  resolveLedgerAccount,
  SYSTEM_LEDGER_ROLES,
  type FinancialAccountKind,
  type LedgerChart,
  type NonRevisionTransactionCommand,
  type OriginalPosting,
  type PlannedPosting,
  type PostingPlan,
  type TransactionCommand,
} from "@personal-finance-os/domain";
import postgres from "postgres";
import { applyUserScope, withUserScope } from "./user-scope.js";

export type LedgerSql = ReturnType<typeof postgres>;

export interface CommitTransactionInput {
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly actorSessionId?: string;
  readonly command: TransactionCommand;
  readonly previewHash?: string;
  /** Stable hash of the public endpoint payload when server-only context is injected. */
  readonly requestHash?: string;
  readonly subscriptionCycleId?: string;
  /** Creates the B044 shared-expense aggregate atomically with its ledger payment. */
  readonly sharedExpenseId?: string;
  /** Creates the B047 settlement aggregate atomically with its ledger payment. */
  readonly settlementObligationId?: string;
  /** Requires the final posting plan to affect this owned financial account. */
  readonly requiredFinancialAccountId?: string;
  /** Internal aggregate hook; executes inside the same SERIALIZABLE transaction. */
  readonly beforeFinalize?: (context: {
    readonly tx: postgres.TransactionSql;
    readonly transactionId: string;
    readonly preview: PostingPlan & { readonly previewHash: string };
  }) => Promise<void>;
}

export interface CommitTransactionResponse {
  readonly transactionId: string;
  readonly replayed: boolean;
  readonly previewHash: string;
  readonly engineVersion: string;
  readonly postings: readonly PlannedPosting[];
  readonly effects: PostingPlan["effects"];
}

export class IdempotencyConflictError extends Error {
  readonly code = "idempotency_conflict";
  readonly status = 409;

  constructor() {
    super("The idempotency key was already used with a different payload.");
    this.name = "IdempotencyConflictError";
  }
}

export class SerializationRetryExhaustedError extends Error {
  readonly code = "serialization_retry_exhausted";
  readonly status = 503;

  constructor() {
    super("The serializable transaction retry limit was exhausted.");
    this.name = "SerializationRetryExhaustedError";
  }
}

export class LedgerReferenceError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("A referenced financial resource was not found or is unavailable.");
    this.name = "LedgerReferenceError";
  }
}

export class PreviewMismatchError extends Error {
  readonly code = "version_conflict";
  readonly status = 409;

  constructor() {
    super("The committed command no longer matches the supplied preview.");
    this.name = "PreviewMismatchError";
  }
}

export class StatementAllocationError extends Error {
  readonly code = "statement_allocation_exceeded";
  readonly status = 409;

  constructor() {
    super(
      "A card statement allocation exceeds its current outstanding amount.",
    );
    this.name = "StatementAllocationError";
  }
}

export class SubscriptionCycleStateError extends Error {
  readonly code = "subscription_cycle_conflict";
  readonly status = 409;

  constructor() {
    super(
      "The subscription cycle charge or cashback state is no longer valid.",
    );
    this.name = "SubscriptionCycleStateError";
  }
}

export class SharedExpenseStateError extends Error {
  readonly code = "shared_expense_conflict";
  readonly status = 409;

  constructor() {
    super("The shared expense split references unavailable or invalid state.");
    this.name = "SharedExpenseStateError";
  }
}

export class ReceivableSettlementStateError extends Error {
  readonly code = "receivable_settlement_conflict";
  readonly status = 409;

  constructor() {
    super("The receivable settlement no longer fits the outstanding balance.");
    this.name = "ReceivableSettlementStateError";
  }
}

export class RevisionConflictError extends Error {
  readonly code = "revision_conflict";
  readonly status = 409;

  constructor() {
    super("The original transaction already has a reversal or is unavailable.");
    this.name = "RevisionConflictError";
  }
}

export function createLedgerSql(
  databaseUrl: string,
  options: { readonly max?: number } = {},
): LedgerSql {
  return postgres(databaseUrl, {
    max: options.max ?? 5,
    prepare: true,
    transform: { undefined: null },
  });
}

function isRetryableDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return ["40001", "40P01", "23505"].includes(String(error.code));
}

function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10 * 2 ** (attempt - 1)));
}

function eventMetadata(
  transactionId: string,
  plan: PostingPlan,
): Record<string, unknown> {
  return {
    engine_version: plan.engineVersion,
    event_type: plan.commandType,
    input_schema_version: plan.inputSchemaVersion,
    status: "posted",
    transaction_id: transactionId,
  };
}

type StoredAccountKind =
  "bank" | "cash" | "wallet" | "credit_card" | "investment";

interface AccountReference {
  readonly id: string;
  readonly kind: StoredAccountKind;
}

function storedKind(kind: FinancialAccountKind): StoredAccountKind {
  return kind === "card" ? "credit_card" : kind;
}

function accountReferences(
  command: NonRevisionTransactionCommand,
): readonly AccountReference[] {
  switch (command.type) {
    case "expense":
      return [
        { id: command.sourceAccountId, kind: storedKind(command.sourceKind) },
      ];
    case "income":
      return [{ id: command.targetAccountId, kind: command.targetKind }];
    case "transfer":
      return [
        { id: command.sourceAccountId, kind: command.sourceKind },
        { id: command.targetAccountId, kind: command.targetKind },
      ];
    case "card_payment":
      return [
        { id: command.bankAccountId, kind: "bank" },
        { id: command.cardAccountId, kind: "credit_card" },
      ];
    case "cashback_refund":
      return [
        { id: command.targetAccountId, kind: storedKind(command.targetKind) },
      ];
    case "shared_expense":
      return [
        {
          id: command.paymentAccountId,
          kind: storedKind(command.paymentSourceKind),
        },
      ];
    case "receivable_settlement":
    case "expected_realization":
      return [{ id: command.targetAccountId, kind: command.targetKind }];
    case "investment_buy":
    case "investment_sell":
      return [{ id: command.cashAccountId, kind: "bank" }];
    case "opening_balance":
    case "balance_adjustment":
      return [{ id: command.accountId, kind: storedKind(command.accountKind) }];
  }
}

export async function provisionSystemLedgerAccounts(
  sql: LedgerSql,
  userId: string,
): Promise<LedgerChart> {
  await sql`select app_private.provision_system_ledger_accounts(${userId}::uuid)`;
  const rows = await sql<
    { readonly id: string; readonly system_role: string }[]
  >`
    select id::text, system_role
      from app_private.ledger_accounts
     where user_id = ${userId}::uuid
     order by system_role
  `;
  const entries = rows.map((row) => [row.system_role, row.id]);
  const chart = Object.fromEntries(entries) as LedgerChart;
  for (const role of SYSTEM_LEDGER_ROLES) {
    resolveLedgerAccount(chart, role);
  }
  return chart;
}

export async function commitLedgerTransaction(
  sql: LedgerSql,
  input: CommitTransactionInput,
): Promise<CommitTransactionResponse> {
  const requestHash =
    input.requestHash ?? hashTransactionCommand(input.command);
  const commandJson = canonicalCommandJson(input.command);
  const preview = previewTransaction(input.command);
  if (input.previewHash && input.previewHash !== preview.previewHash) {
    throw new PreviewMismatchError();
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await sql.begin("isolation level serializable", async (tx) => {
        await applyUserScope(tx, input.userId);
        const existingRows = await tx<
          {
            readonly request_hash: string;
            readonly response_body: CommitTransactionResponse | null;
            readonly status: string;
          }[]
        >`
          select
            encode(request_hash, 'hex') as request_hash,
            response_body,
            status
          from app_private.idempotency_keys
          where user_id = ${input.userId}::uuid
            and key = ${input.idempotencyKey}
          for update
        `;
        const existing = existingRows[0];
        if (existing) {
          if (existing.request_hash !== requestHash) {
            throw new IdempotencyConflictError();
          }
          if (existing.status === "completed" && existing.response_body) {
            return { ...existing.response_body, replayed: true };
          }
          throw new SerializationRetryExhaustedError();
        }

        await tx`
          insert into app_private.idempotency_keys (
            user_id,
            key,
            request_hash,
            status,
            expires_at
          ) values (
            ${input.userId}::uuid,
            ${input.idempotencyKey},
            decode(${requestHash}, 'hex'),
            'processing',
            now() + interval '24 hours'
          )
        `;

        await tx`
          select app_private.provision_system_ledger_accounts(${input.userId}::uuid)
        `;
        const accountRows = await tx<
          { readonly id: string; readonly system_role: string }[]
        >`
          select id::text, system_role
            from app_private.ledger_accounts
           where user_id = ${input.userId}::uuid
           order by system_role
        `;
        const chart = Object.fromEntries(
          accountRows.map((row) => [row.system_role, row.id]),
        ) as LedgerChart;
        for (const role of SYSTEM_LEDGER_ROLES) {
          resolveLedgerAccount(chart, role);
        }

        const financialAccountRows = await tx<
          {
            readonly id: string;
            readonly ledger_account_id: string;
            readonly account_type: string;
            readonly currency: string;
            readonly status: string;
          }[]
        >`
          select
            id::text,
            ledger_account_id::text,
            account_type,
            currency,
            status
          from app_private.financial_accounts
          where user_id = ${input.userId}::uuid
        `;
        const financialAccounts = new Map(
          financialAccountRows.map((row) => [row.id, row]),
        );
        const postingAccountIds = new Set(
          preview.postings.flatMap((posting) =>
            posting.financialAccountId ? [posting.financialAccountId] : [],
          ),
        );
        for (const accountId of postingAccountIds) {
          if (!financialAccounts.has(accountId)) {
            throw new LedgerReferenceError();
          }
        }
        if (
          input.requiredFinancialAccountId &&
          !postingAccountIds.has(input.requiredFinancialAccountId)
        ) {
          throw new LedgerReferenceError();
        }

        const activeCommands =
          input.command.type === "void"
            ? []
            : input.command.type === "revise"
              ? [input.command.replacement]
              : [input.command];
        for (const command of activeCommands) {
          for (const reference of accountReferences(command)) {
            const account = financialAccounts.get(reference.id);
            if (
              !account ||
              account.status !== "active" ||
              account.account_type !== reference.kind ||
              account.currency.trim() !== command.currency
            ) {
              throw new LedgerReferenceError();
            }
          }
          if (command.type === "expense" || command.type === "income") {
            const categoryRows = await tx`
              select id
                from app_private.categories
               where user_id = ${input.userId}::uuid
                 and id = ${command.categoryId}::uuid
                 and category_type = ${command.type}
                 and active
               for share
            `;
            if (!categoryRows[0]) {
              throw new LedgerReferenceError();
            }
          }
        }

        if (input.sharedExpenseId) {
          if (input.command.type !== "shared_expense") {
            throw new SharedExpenseStateError();
          }
          const personIds = input.command.shares.map(
            ({ personId }) => personId,
          );
          if (new Set(personIds).size !== personIds.length) {
            throw new SharedExpenseStateError();
          }
          const people = await tx`
            select id::text
              from app_private.counterparties
             where user_id = ${input.userId}::uuid
               and active
               and type = 'person'
               and id = any(${personIds}::uuid[])
             for share
          `;
          if (people.length !== personIds.length) {
            throw new SharedExpenseStateError();
          }
        }

        let lockedSettlement:
          | {
              readonly id: string;
              readonly nominal_amount: string;
              readonly collected_amount: string;
            }
          | undefined;
        if (input.settlementObligationId) {
          if (
            input.command.type !== "receivable_settlement" ||
            input.command.receivableId !== input.settlementObligationId
          ) {
            throw new ReceivableSettlementStateError();
          }
          const obligations = await tx<
            {
              readonly id: string;
              readonly nominal_amount: string;
              readonly collected_amount: string;
            }[]
          >`
            select id::text, nominal_amount::text, collected_amount::text
              from app_private.obligations
             where user_id = ${input.userId}::uuid
               and id = ${input.settlementObligationId}::uuid
               and direction = 'receivable'
               and collectability_status <> 'closed'
             for update
          `;
          lockedSettlement = obligations[0];
          if (!lockedSettlement) throw new ReceivableSettlementStateError();
          const allowed = await tx<{ readonly allowed: boolean }[]>`
            select ${input.command.amount}::numeric
              <= (${lockedSettlement.nominal_amount}::numeric
                - ${lockedSettlement.collected_amount}::numeric) as allowed
          `;
          if (!allowed[0]?.allowed) throw new ReceivableSettlementStateError();
        }

        const transactionId = randomUUID();
        const reversesTransactionId =
          input.command.type === "void" || input.command.type === "revise"
            ? input.command.originalTransactionId
            : null;
        let revisionGroupId: string = randomUUID();
        if (reversesTransactionId) {
          const originalRows = await tx<
            { readonly revision_group_id: string }[]
          >`
            select revision_group_id::text
              from app_private.transactions
             where user_id = ${input.userId}::uuid
               and id = ${reversesTransactionId}::uuid
             for share
          `;
          const original = originalRows[0];
          if (!original) {
            throw new Error("Original transaction was not found.");
          }
          revisionGroupId = original.revision_group_id;
        }

        const categoryId =
          input.command.type === "expense" || input.command.type === "income"
            ? input.command.categoryId
            : null;
        await tx`
          insert into app_private.transactions (
            id,
            user_id,
            client_request_id,
            event_type,
            status,
            occurred_at,
            economic_date,
            primary_amount,
            primary_currency,
            category_id,
            engine_version,
            input_schema_version,
            input_json,
            preview_hash,
            revision_group_id,
            reverses_transaction_id,
            posted_at
          ) values (
            ${transactionId}::uuid,
            ${input.userId}::uuid,
            ${input.idempotencyKey}::uuid,
            ${preview.commandType},
            'draft',
            ${input.command.occurredAt}::timestamptz,
            ${input.command.economicDate}::date,
            ${preview.primaryAmount}::numeric,
            ${preview.currency},
            ${categoryId}::uuid,
            ${preview.engineVersion},
            ${preview.inputSchemaVersion},
            ${tx.json(JSON.parse(commandJson))},
            ${preview.previewHash},
            ${revisionGroupId}::uuid,
            ${reversesTransactionId}::uuid,
            null
          )
        `;

        for (const posting of preview.postings) {
          const ledgerAccountId = posting.financialAccountId
            ? financialAccounts.get(posting.financialAccountId)
                ?.ledger_account_id
            : resolveLedgerAccount(chart, posting.ledgerRole);
          if (!ledgerAccountId) {
            throw new LedgerReferenceError();
          }
          await tx`
            insert into app_private.ledger_postings (
              id,
              user_id,
              transaction_id,
              ledger_account_id,
              financial_account_id,
              side,
              amount_original,
              currency,
              fx_rate,
              amount_base,
              role,
              sequence_no
            ) values (
              ${randomUUID()}::uuid,
              ${input.userId}::uuid,
              ${transactionId}::uuid,
              ${ledgerAccountId}::uuid,
              ${posting.financialAccountId ?? null}::uuid,
              ${posting.side},
              ${posting.amountOriginal}::numeric,
              ${posting.currency},
              ${posting.fxRate}::numeric,
              ${posting.amountBase}::numeric,
              ${posting.ledgerRole},
              ${posting.sequence}
            )
          `;
        }

        if (
          input.command.type === "expense" &&
          input.command.sourceKind === "card" &&
          input.command.installmentCount !== undefined &&
          input.command.firstInstallmentDate !== undefined
        ) {
          const planId = randomUUID();
          await tx`
            insert into app_private.installment_plans (
              id, user_id, purchase_transaction_id, card_account_id,
              purchase_total, installment_count, recognition_policy
            ) values (
              ${planId}::uuid,
              ${input.userId}::uuid,
              ${transactionId}::uuid,
              ${input.command.sourceAccountId}::uuid,
              ${input.command.amount}::numeric,
              ${input.command.installmentCount},
              'full_at_purchase'
            )
          `;
          for (
            let installmentNumber = 1;
            installmentNumber <= input.command.installmentCount;
            installmentNumber += 1
          ) {
            await tx`
              insert into app_private.installment_items (
                id, user_id, plan_id, sequence, due_date,
                cash_flow_amount, status
              ) values (
                ${randomUUID()}::uuid,
                ${input.userId}::uuid,
                ${planId}::uuid,
                ${installmentNumber}::smallint,
                (${input.command.firstInstallmentDate}::date
                  + pg_catalog.make_interval(months => ${installmentNumber} - 1))::date,
                case
                  when ${installmentNumber} = ${input.command.installmentCount}
                    then (${input.command.amount}::numeric
                      - trunc(${input.command.amount}::numeric / ${input.command.installmentCount}, 4)
                        * (${input.command.installmentCount} - 1))::numeric(19,4)
                  else trunc(${input.command.amount}::numeric / ${input.command.installmentCount}, 4)::numeric(19,4)
                end,
                'scheduled'
              )
            `;
          }
        }

        if (input.command.type === "card_payment") {
          for (const allocation of input.command.statementAllocations ?? []) {
            const updated = await tx`
              update app_private.credit_card_statements
                 set paid_amount = paid_amount + ${allocation.amount}::numeric,
                     status = case
                       when paid_amount + ${allocation.amount}::numeric = closing_balance
                         then 'paid'
                       else 'partially_paid'
                     end
               where user_id = ${input.userId}::uuid
                 and id = ${allocation.statementId}::uuid
                 and card_account_id = ${input.command.cardAccountId}::uuid
                 and paid_amount + ${allocation.amount}::numeric <= closing_balance
              returning id
            `;
            if (!updated[0]) throw new StatementAllocationError();
            await tx`
              insert into app_private.statement_payments (
                id, user_id, statement_id, transaction_id, amount
              ) values (
                ${randomUUID()}::uuid,
                ${input.userId}::uuid,
                ${allocation.statementId}::uuid,
                ${transactionId}::uuid,
                ${allocation.amount}::numeric
              )
            `;
          }
        }

        if (input.subscriptionCycleId) {
          if (
            input.command.type !== "expense" &&
            input.command.type !== "cashback_refund"
          ) {
            throw new SubscriptionCycleStateError();
          }
          if (input.command.type === "expense") {
            const updated = await tx`
              update app_private.subscription_cycles as cycle
                 set charge_transaction_id = ${transactionId}::uuid,
                     actual_net = ${input.command.amount}::numeric
                from app_private.subscriptions as subscription
               where cycle.user_id = ${input.userId}::uuid
                 and cycle.id = ${input.subscriptionCycleId}::uuid
                 and cycle.charge_transaction_id is null
                 and subscription.user_id = cycle.user_id
                 and subscription.id = cycle.subscription_id
                 and subscription.active
                 and subscription.payment_account_id = ${input.command.sourceAccountId}::uuid
              returning cycle.id
            `;
            if (!updated[0]) throw new SubscriptionCycleStateError();
          } else {
            const updated = await tx`
              update app_private.subscription_cycles as cycle
                 set cashback_total = cycle.cashback_total + ${input.command.amount}::numeric,
                     actual_net = cycle.actual_net - ${input.command.amount}::numeric
                from app_private.subscriptions as subscription
               where cycle.user_id = ${input.userId}::uuid
                 and cycle.id = ${input.subscriptionCycleId}::uuid
                 and cycle.charge_transaction_id = ${input.command.relatedTransactionId}::uuid
                 and cycle.actual_net >= ${input.command.amount}::numeric
                 and subscription.user_id = cycle.user_id
                 and subscription.id = cycle.subscription_id
                 and subscription.id = ${input.command.subscriptionId ?? null}::uuid
                 and subscription.active
                 and cycle.cashback_total + ${input.command.amount}::numeric
                   <= subscription.cashback_cap
              returning cycle.id
            `;
            if (!updated[0]) throw new SubscriptionCycleStateError();
          }
        }

        if (input.sharedExpenseId) {
          if (input.command.type !== "shared_expense") {
            throw new SharedExpenseStateError();
          }
          const sharedExpenseId = input.sharedExpenseId;
          await tx`
            insert into app_private.shared_expenses (
              id, user_id, payment_transaction_id, total_paid, owner_share,
              rounding_amount, currency, sharing_status
            ) values (
              ${sharedExpenseId}::uuid, ${input.userId}::uuid,
              ${transactionId}::uuid, ${input.command.totalAmount}::numeric,
              ${input.command.ownerShare}::numeric,
              ${input.command.roundingAmount ?? "0.00"}::numeric,
              ${input.command.currency}, 'split'
            )
          `;
          for (const share of input.command.shares) {
            const obligationId = randomUUID();
            await tx`
              insert into app_private.obligations (
                id, user_id, person_id, direction, origin_type, currency,
                nominal_amount, collected_amount, collectability_status,
                estimated_collectible_amount, include_in_net_worth,
                include_in_planning
              ) values (
                ${obligationId}::uuid, ${input.userId}::uuid,
                ${share.personId}::uuid, 'receivable', 'shared_expense',
                ${input.command.currency}, ${share.amount}::numeric, 0,
                'collectible', ${share.amount}::numeric, true, true
              )
            `;
            await tx`
              insert into app_private.shared_expense_shares (
                id, user_id, shared_expense_id, person_id, share_amount,
                receivable_id
              ) values (
                ${randomUUID()}::uuid, ${input.userId}::uuid,
                ${sharedExpenseId}::uuid, ${share.personId}::uuid,
                ${share.amount}::numeric, ${obligationId}::uuid
              )
            `;
          }
        }

        if (input.settlementObligationId && lockedSettlement) {
          if (input.command.type !== "receivable_settlement") {
            throw new ReceivableSettlementStateError();
          }
          const updated = await tx`
            update app_private.obligations
               set collected_amount = collected_amount + ${input.command.amount}::numeric,
                   estimated_collectible_amount = least(
                     estimated_collectible_amount,
                     nominal_amount - collected_amount - ${input.command.amount}::numeric
                   ),
                   collectability_status = case
                     when collected_amount + ${input.command.amount}::numeric = nominal_amount
                       then 'closed'
                     else collectability_status
                   end
             where user_id = ${input.userId}::uuid
               and id = ${lockedSettlement.id}::uuid
               and collected_amount + ${input.command.amount}::numeric <= nominal_amount
            returning id
          `;
          if (!updated[0]) throw new ReceivableSettlementStateError();
          await tx`
            insert into app_private.settlements (
              id, user_id, obligation_id, transaction_id, amount
            ) values (
              ${randomUUID()}::uuid, ${input.userId}::uuid,
              ${lockedSettlement.id}::uuid, ${transactionId}::uuid,
              ${input.command.amount}::numeric
            )
          `;
          await tx`
            update app_private.shared_expense_shares
               set settled_amount = settled_amount + ${input.command.amount}::numeric
             where user_id = ${input.userId}::uuid
               and receivable_id = ${lockedSettlement.id}::uuid
          `;
          await tx`
            update app_private.shared_expenses as expense
               set sharing_status = 'closed'
             where expense.user_id = ${input.userId}::uuid
               and expense.sharing_status = 'split'
               and not exists (
                 select 1
                   from app_private.shared_expense_shares as share
                  where share.user_id = expense.user_id
                    and share.shared_expense_id = expense.id
                    and share.settled_amount <> share.share_amount
               )
          `;
        }

        for (const link of preview.links) {
          await tx`
            insert into app_private.transaction_links (
              id,
              user_id,
              from_transaction_id,
              to_transaction_id,
              link_type,
              allocated_amount
            ) values (
              ${randomUUID()}::uuid,
              ${input.userId}::uuid,
              ${transactionId}::uuid,
              ${link.relatedTransactionId}::uuid,
              ${link.linkType},
              ${link.allocatedAmount ?? null}::numeric
            )
          `;
        }

        await input.beforeFinalize?.({ tx, transactionId, preview });

        await tx`
          update app_private.transactions
             set status = 'posted',
                 posted_at = now()
           where user_id = ${input.userId}::uuid
             and id = ${transactionId}::uuid
             and status = 'draft'
        `;

        await tx`
          select pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(${input.userId}, 0)
          )
        `;
        const previousAuditRows = await tx<{ readonly event_hash: string }[]>`
          select encode(event_hash, 'hex') as event_hash
            from app_private.audit_events
           where user_id = ${input.userId}::uuid
           order by occurred_at desc, id desc
           limit 1
        `;
        const previousAuditHash = previousAuditRows[0]?.event_hash ?? "";
        const auditAfter = eventMetadata(transactionId, preview);
        const auditHash = createHash("sha256")
          .update(
            `${previousAuditHash}|${input.requestId}|${JSON.stringify(auditAfter)}`,
          )
          .digest("hex");
        await tx`
          insert into app_private.audit_events (
            id,
            user_id,
            entity_type,
            entity_id,
            action,
            before_json,
            after_json,
            actor_session_id,
            request_id,
            prev_hash,
            event_hash
          ) values (
            ${randomUUID()}::uuid,
            ${input.userId}::uuid,
            'transaction',
            ${transactionId}::uuid,
            'posted',
            null,
            ${tx.json(JSON.parse(JSON.stringify(auditAfter)))},
            ${input.actorSessionId ?? null}::uuid,
            ${input.requestId},
            case when ${previousAuditHash} = '' then null else decode(${previousAuditHash}, 'hex') end,
            decode(${auditHash}, 'hex')
          )
        `;

        await tx`
          insert into app_private.outbox_events (
            id,
            user_id,
            aggregate_type,
            aggregate_id,
            event_type,
            event_version,
            schema_version,
            payload
          ) values (
            ${randomUUID()}::uuid,
            ${input.userId}::uuid,
            'transaction',
            ${transactionId}::uuid,
            'transaction.posted',
            1,
            1,
            ${tx.json(JSON.parse(JSON.stringify(auditAfter)))}
          )
        `;

        const response: CommitTransactionResponse = {
          transactionId,
          replayed: false,
          previewHash: preview.previewHash,
          engineVersion: preview.engineVersion,
          postings: preview.postings,
          effects: preview.effects,
        };
        await tx`
          update app_private.idempotency_keys
             set status = 'completed',
                 response_code = 201,
                 response_body = ${tx.json(JSON.parse(JSON.stringify(response)))},
                 updated_at = now()
           where user_id = ${input.userId}::uuid
             and key = ${input.idempotencyKey}
        `;
        return response;
      });
    } catch (error) {
      if (
        error instanceof IdempotencyConflictError ||
        error instanceof SerializationRetryExhaustedError
      ) {
        throw error;
      }
      if (!isRetryableDatabaseError(error)) {
        throw error;
      }
      const constraint = (error as { readonly constraint_name?: unknown })
        .constraint_name;
      if (
        String((error as { readonly code?: unknown }).code) === "23505" &&
        typeof constraint === "string" &&
        constraint.includes("revers")
      ) {
        throw new RevisionConflictError();
      }
      if (attempt < 3) {
        await waitBeforeRetry(attempt);
      }
    }
  }

  throw new SerializationRetryExhaustedError();
}

interface OriginalTransactionForRevision {
  readonly economicDate: string;
  readonly currency: string;
  readonly postings: readonly OriginalPosting[];
}

async function loadOriginalTransactionForRevision(
  sql: LedgerSql,
  userId: string,
  transactionId: string,
): Promise<OriginalTransactionForRevision> {
  return withUserScope(sql, userId, async (tx) => {
    const rows = await tx<
      {
        readonly economic_date: string;
        readonly primary_currency: string;
      }[]
    >`
      select economic_date::text, primary_currency
        from app_private.transactions
       where user_id = ${userId}::uuid
         and id = ${transactionId}::uuid
         and status = 'posted'
       for share
    `;
    const original = rows[0];
    if (!original) throw new LedgerReferenceError();
    const postingRows = await tx<
      {
        readonly role: OriginalPosting["ledgerRole"];
        readonly financial_account_id: string | null;
        readonly side: OriginalPosting["side"];
        readonly amount_original: string;
        readonly currency: string;
        readonly fx_rate: string;
        readonly amount_base: string;
      }[]
    >`
      select role, financial_account_id::text, side, amount_original::text,
             currency, fx_rate::text, amount_base::text
        from app_private.ledger_postings
       where user_id = ${userId}::uuid
         and transaction_id = ${transactionId}::uuid
       order by sequence_no
    `;
    if (postingRows.length < 2) throw new RevisionConflictError();
    return {
      economicDate: original.economic_date,
      currency: original.primary_currency.trim(),
      postings: postingRows.map((posting) => ({
        ledgerRole: posting.role,
        ...(posting.financial_account_id
          ? { financialAccountId: posting.financial_account_id }
          : {}),
        side: posting.side,
        amount: posting.amount_original,
        currency: posting.currency.trim(),
        fxRate: posting.fx_rate,
        amountBase: posting.amount_base,
      })),
    };
  });
}

function publicRevisionHash(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function commitVoidTransaction(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly transactionId: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly reason: string;
  },
): Promise<CommitTransactionResponse> {
  const original = await loadOriginalTransactionForRevision(
    sql,
    input.userId,
    input.transactionId,
  );
  return commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    requestHash: publicRevisionHash({
      operation: "void",
      reason: input.reason,
      transactionId: input.transactionId,
    }),
    command: {
      type: "void",
      occurredAt: new Date().toISOString(),
      economicDate: original.economicDate,
      currency: original.currency,
      originalTransactionId: input.transactionId,
      originalPostings: original.postings,
      reason: input.reason,
    },
  });
}

export async function commitRevisedTransaction(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly transactionId: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly reason: string;
    readonly replacement: NonRevisionTransactionCommand;
  },
): Promise<CommitTransactionResponse> {
  const original = await loadOriginalTransactionForRevision(
    sql,
    input.userId,
    input.transactionId,
  );
  if (
    input.replacement.currency !== original.currency ||
    input.replacement.economicDate !== original.economicDate
  ) {
    throw new RevisionConflictError();
  }
  return commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    requestHash: publicRevisionHash({
      operation: "revise",
      reason: input.reason,
      replacement: input.replacement,
      transactionId: input.transactionId,
    }),
    command: {
      type: "revise",
      occurredAt: new Date().toISOString(),
      economicDate: original.economicDate,
      currency: original.currency,
      originalTransactionId: input.transactionId,
      originalPostings: original.postings,
      reason: input.reason,
      replacement: input.replacement,
    },
  });
}
