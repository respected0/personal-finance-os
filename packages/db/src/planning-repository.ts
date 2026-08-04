import { createHash, randomUUID } from "node:crypto";
import {
  calculateCanonicalInvestableAmount,
  INVESTABLE_FORMULA_VERSION,
  INVESTABLE_POLICY_VERSION,
} from "@personal-finance-os/domain";
import type { AccountNameKeyring } from "./account-crypto.js";
import {
  commitLedgerTransaction,
  type CommitTransactionResponse,
  type LedgerSql,
} from "./ledger-repository.js";
import {
  decryptProtectedText,
  encryptProtectedText,
} from "./protected-text-crypto.js";
import { applyUserScope, withUserScope } from "./user-scope.js";

export interface BudgetPut {
  readonly status: "draft" | "active" | "archived";
  readonly lines: readonly {
    readonly categoryId: string;
    readonly plannedAmount: string;
    readonly rolloverPolicy: "none" | "carry_remaining";
    readonly warningThreshold: string;
  }[];
}
export interface Budget {
  readonly id: string;
  readonly period: string;
  readonly status: BudgetPut["status"];
  readonly rowVersion: number;
  readonly actualFormula: "posted expense debits minus expense credits";
  readonly forecastFormula: "actual / elapsed period days * total period days";
  readonly lines: readonly {
    readonly id: string;
    readonly categoryId: string;
    readonly plannedAmount: string;
    readonly rolloverPolicy: "none" | "carry_remaining";
    readonly warningThreshold: string;
    readonly actualAmount: string;
    readonly remainingAmount: string;
    readonly forecastAmount: string;
    readonly thresholdReached: boolean;
  }[];
}
export interface GoalCreate {
  readonly title: string;
  readonly targetAmount: string;
  readonly targetDate: string;
  readonly priority: number;
  readonly riskLevel: "low" | "medium" | "high";
}
export interface GoalAllocationCreate {
  readonly accountId: string;
  readonly allocatedValue: string;
  readonly effectiveFrom: string;
}
export interface Goal extends GoalCreate {
  readonly id: string;
  readonly status: "active" | "completed" | "archived";
  readonly rowVersion: number;
  readonly allocatedValue: string;
  readonly actualContributionAmount: string;
  readonly progressAmount: string;
  readonly remainingAmount: string;
  readonly ledgerPostingCount: 0;
  readonly allocations: readonly (GoalAllocationCreate & {
    readonly id: string;
    readonly effectiveTo: string | null;
    readonly rowVersion: number;
  })[];
}

export class PlanningNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;
  constructor() {
    super("The requested planning resource was not found.");
  }
}

export class PlanningVersionConflictError extends Error {
  readonly code = "version_conflict";
  readonly status = 409;
  constructor() {
    super("The planning resource changed after it was read.");
  }
}

export class GoalAllocationBoundError extends Error {
  readonly code = "goal_allocation_exceeds_eligible";
  readonly status = 422;
  constructor() {
    super("Goal allocation exceeds the eligible account value.");
  }
}

export class ExpectedAlreadyRealizedError extends Error {
  readonly code = "already_realized";
  readonly status = 409;
  constructor() {
    super("Expected payment was already realized or is no longer available.");
  }
}

function periodDate(period: string): string {
  return `${period}-01`;
}

export async function getBudget(
  sql: LedgerSql,
  userId: string,
  period: string,
): Promise<Budget | null> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) => tx<
      {
        readonly id: string;
        readonly period: string;
        readonly status: Budget["status"];
        readonly row_version: number;
        readonly line_id: string | null;
        readonly category_id: string | null;
        readonly planned_amount: string | null;
        readonly rollover_policy: "none" | "carry_remaining" | null;
        readonly warning_threshold: string | null;
        readonly actual_amount: string | null;
        readonly remaining_amount: string | null;
        readonly forecast_amount: string | null;
        readonly threshold_reached: boolean | null;
      }[]
    >`
    with selected_budget as (
      select * from app_private.budgets
       where user_id = ${userId}::uuid and period = ${periodDate(period)}::date
    ), actuals as (
      select transaction.category_id,
        coalesce(sum(case
          when posting.side = 'debit' then posting.amount_base
          else -posting.amount_base end), 0)::numeric(19,4) as amount
        from app_private.transactions transaction
        join app_private.ledger_postings posting
          on posting.user_id = transaction.user_id
         and posting.transaction_id = transaction.id
         and posting.role in ('expense', 'fee_expense')
       where transaction.user_id = ${userId}::uuid
         and transaction.status = 'posted'
         and transaction.economic_date >= ${periodDate(period)}::date
         and transaction.economic_date < (${periodDate(period)}::date + interval '1 month')
       group by transaction.category_id
    )
    select budget.id::text, to_char(budget.period, 'YYYY-MM') as period,
      budget.status, budget.row_version, line.id::text as line_id,
      line.category_id::text, line.planned_amount::text,
      line.rollover_policy, line.warning_threshold::text,
      coalesce(actual.amount, 0)::numeric(19,4)::text as actual_amount,
      (line.planned_amount - coalesce(actual.amount, 0))::numeric(19,4)::text as remaining_amount,
      case when current_date < budget.period then 0
           when current_date >= budget.period + interval '1 month' then coalesce(actual.amount, 0)
           else (coalesce(actual.amount, 0)
             / greatest((current_date - budget.period + 1), 1)
             * extract(day from (budget.period + interval '1 month - 1 day'))
           )::numeric(19,4) end::text as forecast_amount,
      case when line.planned_amount = 0 then coalesce(actual.amount, 0) > 0
           else coalesce(actual.amount, 0) >= line.planned_amount * line.warning_threshold end
        as threshold_reached
      from selected_budget budget
      left join app_private.budget_lines line
        on line.user_id = budget.user_id and line.budget_id = budget.id
      left join actuals actual on actual.category_id = line.category_id
     order by line.category_id
  `,
  );
  const head = rows[0];
  if (!head) return null;
  return {
    id: head.id,
    period: head.period,
    status: head.status,
    rowVersion: head.row_version,
    actualFormula: "posted expense debits minus expense credits",
    forecastFormula: "actual / elapsed period days * total period days",
    lines: rows.flatMap((row) =>
      row.line_id &&
      row.category_id &&
      row.planned_amount &&
      row.rollover_policy &&
      row.warning_threshold &&
      row.actual_amount &&
      row.remaining_amount &&
      row.forecast_amount &&
      row.threshold_reached !== null
        ? [
            {
              id: row.line_id,
              categoryId: row.category_id,
              plannedAmount: row.planned_amount,
              rolloverPolicy: row.rollover_policy,
              warningThreshold: row.warning_threshold,
              actualAmount: row.actual_amount,
              remainingAmount: row.remaining_amount,
              forecastAmount: row.forecast_amount,
              thresholdReached: row.threshold_reached,
            },
          ]
        : [],
    ),
  };
}

export async function putBudget(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly period: string;
    readonly expectedVersion: number;
    readonly budget: BudgetPut;
  },
): Promise<Budget> {
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const existing = await tx<
      { readonly id: string; readonly row_version: number }[]
    >`
      select id::text, row_version from app_private.budgets
       where user_id = ${input.userId}::uuid and period = ${periodDate(input.period)}::date
       for update
    `;
    let budgetId = existing[0]?.id;
    if (!budgetId) {
      if (input.expectedVersion !== 0) throw new PlanningVersionConflictError();
      budgetId = randomUUID();
      await tx`
        insert into app_private.budgets (id, user_id, period, status)
        values (${budgetId}::uuid, ${input.userId}::uuid,
          ${periodDate(input.period)}::date, ${input.budget.status})
      `;
    } else {
      if (existing[0]?.row_version !== input.expectedVersion) {
        throw new PlanningVersionConflictError();
      }
      await tx`
        update app_private.budgets
           set status = ${input.budget.status}, row_version = row_version + 1,
               updated_at = now()
         where user_id = ${input.userId}::uuid and id = ${budgetId}::uuid
      `;
      await tx`
        delete from app_private.budget_lines
         where user_id = ${input.userId}::uuid and budget_id = ${budgetId}::uuid
      `;
    }
    for (const line of input.budget.lines) {
      const category = await tx`
        select 1 from app_private.categories
         where user_id = ${input.userId}::uuid and id = ${line.categoryId}::uuid
           and category_type = 'expense' and active
      `;
      if (!category[0]) throw new PlanningNotFoundError();
      await tx`
        insert into app_private.budget_lines (
          id, user_id, budget_id, category_id, planned_amount,
          rollover_policy, warning_threshold
        ) values (
          ${randomUUID()}::uuid, ${input.userId}::uuid, ${budgetId}::uuid,
          ${line.categoryId}::uuid, ${line.plannedAmount}::numeric,
          ${line.rolloverPolicy}, ${line.warningThreshold}::numeric
        )
      `;
    }
  });
  const result = await getBudget(sql, input.userId, input.period);
  if (!result) throw new Error("Budget write returned no projection.");
  return result;
}

interface GoalRow {
  readonly id: string;
  readonly title_enc: Uint8Array;
  readonly title_key_id: string;
  readonly title_algorithm: "AEAD_AES_256_GCM";
  readonly title_enc_version: 1;
  readonly title_nonce: Uint8Array;
  readonly title_auth_tag: Uint8Array;
  readonly title_aad_version: 1;
  readonly target_amount: string;
  readonly target_date: string;
  readonly priority: number;
  readonly risk_level: Goal["riskLevel"];
  readonly status: Goal["status"];
  readonly row_version: number;
  readonly allocated_value: string;
  readonly actual_contribution_amount: string;
  readonly progress_amount: string;
  readonly remaining_amount: string;
}

async function goalRows(sql: LedgerSql, userId: string): Promise<GoalRow[]> {
  return withUserScope(
    sql,
    userId,
    (tx) => tx<GoalRow[]>`
    select goal.id::text, goal.title_enc, goal.title_key_id,
      goal.title_algorithm, goal.title_enc_version, goal.title_nonce,
      goal.title_auth_tag, goal.title_aad_version, goal.target_amount::text,
      goal.target_date::text, goal.priority, goal.risk_level, goal.status,
      goal.row_version,
      coalesce(allocation.total, 0)::numeric(19,4)::text as allocated_value,
      coalesce(contribution.total, 0)::numeric(19,4)::text as actual_contribution_amount,
      least(goal.target_amount,
        coalesce(allocation.total, 0) + coalesce(contribution.total, 0)
      )::numeric(19,4)::text as progress_amount,
      greatest(goal.target_amount - coalesce(allocation.total, 0)
        - coalesce(contribution.total, 0), 0)::numeric(19,4)::text as remaining_amount
      from app_private.goals goal
      left join lateral (
        select sum(allocated_value) as total from app_private.goal_allocations
         where user_id = goal.user_id and goal_id = goal.id and effective_to is null
      ) allocation on true
      left join lateral (
        select sum(actual_amount) as total from app_private.goal_contribution_events
         where user_id = goal.user_id and goal_id = goal.id
           and actual_transaction_id is not null
      ) contribution on true
     where goal.user_id = ${userId}::uuid
     order by goal.status, goal.priority, goal.target_date, goal.id
  `,
  );
}

async function allocationMap(sql: LedgerSql, userId: string) {
  interface AllocationRow {
    readonly id: string;
    readonly goal_id: string;
    readonly account_id: string;
    readonly allocated_value: string;
    readonly effective_from: string;
    readonly effective_to: string | null;
    readonly row_version: number;
  }
  const rows = await withUserScope(
    sql,
    userId,
    (tx) => tx<AllocationRow[]>`
    select id::text, goal_id::text, account_id::text, allocated_value::text,
      effective_from::text, effective_to::text, row_version
      from app_private.goal_allocations
     where user_id = ${userId}::uuid and account_id is not null
     order by effective_from, id
  `,
  );
  const grouped = new Map<string, AllocationRow[]>();
  for (const row of rows) {
    const current: AllocationRow[] = grouped.get(row.goal_id) ?? [];
    current.push(row);
    grouped.set(row.goal_id, current);
  }
  return grouped;
}

export async function listGoals(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  userId: string,
): Promise<readonly Goal[]> {
  const [rows, allocations] = await Promise.all([
    goalRows(sql, userId),
    allocationMap(sql, userId),
  ]);
  return rows.map((row) => ({
    id: row.id,
    title: decryptProtectedText(
      {
        ciphertext: row.title_enc,
        keyId: row.title_key_id,
        algorithm: row.title_algorithm,
        encryptionVersion: row.title_enc_version,
        nonce: row.title_nonce,
        authTag: row.title_auth_tag,
        aadVersion: row.title_aad_version,
      },
      userId,
      row.id,
      "goal-title",
      keyring,
    ),
    targetAmount: row.target_amount,
    targetDate: row.target_date,
    priority: row.priority,
    riskLevel: row.risk_level,
    status: row.status,
    rowVersion: row.row_version,
    allocatedValue: row.allocated_value,
    actualContributionAmount: row.actual_contribution_amount,
    progressAmount: row.progress_amount,
    remainingAmount: row.remaining_amount,
    ledgerPostingCount: 0,
    allocations: (allocations.get(row.id) ?? []).map((allocation) => ({
      id: allocation.id,
      accountId: allocation.account_id,
      allocatedValue: allocation.allocated_value,
      effectiveFrom: allocation.effective_from,
      effectiveTo: allocation.effective_to,
      rowVersion: allocation.row_version,
    })),
  }));
}

export async function createGoal(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: GoalCreate & { readonly userId: string },
): Promise<Goal> {
  const id = randomUUID();
  const title = encryptProtectedText(
    input.title,
    input.userId,
    id,
    "goal-title",
    keyring,
  );
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    await tx`
      insert into app_private.goals (
        id, user_id, title_enc, title_key_id, title_algorithm,
        title_enc_version, title_nonce, title_auth_tag, title_aad_version,
        target_amount, target_date, priority, risk_level
      ) values (
        ${id}::uuid, ${input.userId}::uuid, ${Buffer.from(title.ciphertext)},
        ${title.keyId}, ${title.algorithm}, ${title.encryptionVersion},
        ${Buffer.from(title.nonce)}, ${Buffer.from(title.authTag)}, ${title.aadVersion},
        ${input.targetAmount}::numeric, ${input.targetDate}::date,
        ${input.priority}, ${input.riskLevel}
      )
    `;
  });
  const goal = (await listGoals(sql, keyring, input.userId)).find(
    (item) => item.id === id,
  );
  if (!goal) throw new Error("Goal insert returned no projection.");
  return goal;
}

export async function createGoalAllocation(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: GoalAllocationCreate & {
    readonly userId: string;
    readonly goalId: string;
    readonly expectedVersion: number;
  },
): Promise<Goal> {
  try {
    await sql.begin("isolation level serializable", async (tx) => {
      await applyUserScope(tx, input.userId);
      const goal = await tx<{ readonly row_version: number }[]>`
        select row_version from app_private.goals
         where user_id = ${input.userId}::uuid and id = ${input.goalId}::uuid
         for update
      `;
      if (!goal[0]) throw new PlanningNotFoundError();
      if (goal[0].row_version !== input.expectedVersion) {
        throw new PlanningVersionConflictError();
      }
      await tx`
        insert into app_private.goal_allocations (
          id, user_id, goal_id, account_id, allocated_value, effective_from
        ) values (
          ${randomUUID()}::uuid, ${input.userId}::uuid, ${input.goalId}::uuid,
          ${input.accountId}::uuid, ${input.allocatedValue}::numeric,
          ${input.effectiveFrom}::date
        )
      `;
      await tx`
        update app_private.goals set row_version = row_version + 1, updated_at = now()
         where user_id = ${input.userId}::uuid and id = ${input.goalId}::uuid
      `;
    });
  } catch (error) {
    if (
      (error as { message?: unknown }).message ===
      "goal_allocation_exceeds_eligible"
    ) {
      throw new GoalAllocationBoundError();
    }
    throw error;
  }
  const goal = (await listGoals(sql, keyring, input.userId)).find(
    (item) => item.id === input.goalId,
  );
  if (!goal) throw new PlanningNotFoundError();
  return goal;
}

export interface ExpectedPaymentCreate {
  readonly source: string;
  readonly expectedAmount: string;
  readonly expectedDate: string;
  readonly certaintyLevel: "certain" | "likely" | "uncertain";
}
export interface ExpectedPayment extends ExpectedPaymentCreate {
  readonly id: string;
  readonly status: "expected" | "overdue" | "received" | "cancelled";
  readonly realizedTransactionId: string | null;
  readonly rowVersion: number;
  readonly accountingEffect: {
    readonly beforeRealizationIncome: "0.0000";
    readonly beforeRealizationNetWorth: "0.0000";
    readonly beforeRealizationInvestable: "0.0000";
  };
}

export async function listExpectedPayments(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  userId: string,
): Promise<readonly ExpectedPayment[]> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) => tx<
      {
        readonly id: string;
        readonly source_enc: Uint8Array;
        readonly source_key_id: string;
        readonly source_algorithm: "AEAD_AES_256_GCM";
        readonly source_enc_version: 1;
        readonly source_nonce: Uint8Array;
        readonly source_auth_tag: Uint8Array;
        readonly source_aad_version: 1;
        readonly expected_amount: string;
        readonly expected_date: string;
        readonly certainty_level: ExpectedPayment["certaintyLevel"];
        readonly status: ExpectedPayment["status"];
        readonly realized_transaction_id: string | null;
        readonly row_version: number;
      }[]
    >`
    select id::text, source_enc, source_key_id, source_algorithm,
      source_enc_version, source_nonce, source_auth_tag, source_aad_version,
      expected_amount::text, expected_date::text, certainty_level,
      case when status = 'expected' and expected_date < current_date
        then 'overdue' else status end as status,
      realized_transaction_id::text, row_version
      from app_private.expected_payments
     where user_id = ${userId}::uuid
     order by case status when 'received' then 1 when 'cancelled' then 2 else 0 end,
       expected_date, id
  `,
  );
  return rows.map((row) => ({
    id: row.id,
    source: decryptProtectedText(
      {
        ciphertext: row.source_enc,
        keyId: row.source_key_id,
        algorithm: row.source_algorithm,
        encryptionVersion: row.source_enc_version,
        nonce: row.source_nonce,
        authTag: row.source_auth_tag,
        aadVersion: row.source_aad_version,
      },
      userId,
      row.id,
      "expected-source",
      keyring,
    ),
    expectedAmount: row.expected_amount,
    expectedDate: row.expected_date,
    certaintyLevel: row.certainty_level,
    status: row.status,
    realizedTransactionId: row.realized_transaction_id,
    rowVersion: row.row_version,
    accountingEffect: {
      beforeRealizationIncome: "0.0000",
      beforeRealizationNetWorth: "0.0000",
      beforeRealizationInvestable: "0.0000",
    },
  }));
}

export async function createExpectedPayment(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: ExpectedPaymentCreate & { readonly userId: string },
): Promise<ExpectedPayment> {
  const id = randomUUID();
  const source = encryptProtectedText(
    input.source,
    input.userId,
    id,
    "expected-source",
    keyring,
  );
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    await tx`
      insert into app_private.expected_payments (
        id, user_id, source_enc, source_key_id, source_algorithm,
        source_enc_version, source_nonce, source_auth_tag, source_aad_version,
        expected_amount, expected_date, certainty_level
      ) values (
        ${id}::uuid, ${input.userId}::uuid, ${Buffer.from(source.ciphertext)},
        ${source.keyId}, ${source.algorithm}, ${source.encryptionVersion},
        ${Buffer.from(source.nonce)}, ${Buffer.from(source.authTag)},
        ${source.aadVersion}, ${input.expectedAmount}::numeric,
        ${input.expectedDate}::date, ${input.certaintyLevel}
      )
    `;
  });
  const created = (await listExpectedPayments(sql, keyring, input.userId)).find(
    (payment) => payment.id === id,
  );
  if (!created) throw new Error("Expected payment insert returned no row.");
  return created;
}

export async function realizeExpectedPayment(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly expectedPaymentId: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly targetAccountId: string;
    readonly targetKind: "bank" | "cash";
    readonly currency: "TRY";
    readonly occurredAt: string;
    readonly economicDate: string;
  },
): Promise<CommitTransactionResponse> {
  const source = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<
      {
        readonly expected_amount: string;
        readonly status: string;
      }[]
    >`
    select expected_amount::text, status from app_private.expected_payments
     where user_id = ${input.userId}::uuid and id = ${input.expectedPaymentId}::uuid
  `,
  );
  const expected = source[0];
  if (!expected) throw new PlanningNotFoundError();
  if (expected.status === "cancelled") {
    throw new ExpectedAlreadyRealizedError();
  }
  const publicPayload = {
    expectedPaymentId: input.expectedPaymentId,
    targetAccountId: input.targetAccountId,
    targetKind: input.targetKind,
    currency: input.currency,
    occurredAt: input.occurredAt,
    economicDate: input.economicDate,
  };
  return commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    requestHash: createHash("sha256")
      .update(JSON.stringify(publicPayload))
      .digest("hex"),
    command: {
      type: "expected_realization",
      amount: expected.expected_amount,
      expectedPaymentId: input.expectedPaymentId,
      alreadyRealized: false,
      targetAccountId: input.targetAccountId,
      targetKind: input.targetKind,
      incomeClass: "normal",
      currency: input.currency,
      occurredAt: input.occurredAt,
      economicDate: input.economicDate,
    },
    requiredFinancialAccountId: input.targetAccountId,
    beforeFinalize: async ({ tx, transactionId }) => {
      const locked = await tx<{ readonly expected_amount: string }[]>`
        select expected_amount::text from app_private.expected_payments
         where user_id = ${input.userId}::uuid
           and id = ${input.expectedPaymentId}::uuid
           and status in ('expected', 'overdue')
           and realized_transaction_id is null
         for update
      `;
      if (
        !locked[0] ||
        locked[0].expected_amount !== expected.expected_amount
      ) {
        throw new ExpectedAlreadyRealizedError();
      }
      const updated = await tx`
        update app_private.expected_payments
           set status = 'received', realized_transaction_id = ${transactionId}::uuid,
               row_version = row_version + 1, updated_at = now()
         where user_id = ${input.userId}::uuid
           and id = ${input.expectedPaymentId}::uuid
           and status in ('expected', 'overdue')
           and realized_transaction_id is null
        returning id
      `;
      if (!updated[0]) throw new ExpectedAlreadyRealizedError();
    },
  });
}

export interface InvestableRun {
  readonly id: string;
  readonly asOf: string;
  readonly sourceWatermark: string;
  readonly formulaVersion: typeof INVESTABLE_FORMULA_VERSION;
  readonly policyVersion: typeof INVESTABLE_POLICY_VERSION;
  readonly liquidVerifiedAmount: string;
  readonly committedOutflowAmount: string;
  readonly operatingBufferAmount: string;
  readonly nearTermGoalReserveAmount: string;
  readonly excludedExpectedAmount: string;
  readonly excludedDoubtfulReceivableAmount: string;
  readonly canonicalInvestableAmount: string;
  readonly evidence: {
    readonly formula: "max(0, liquid_verified - committed_outflow - operating_buffer - near_term_goal_reserve)";
    readonly liquidSource: "posted active bank/cash/wallet balances";
    readonly committedOutflowSource: "active budget remaining planned expense";
    readonly goalReserveSource: "active allocations for goals due within 90 days";
    readonly expected: {
      readonly trackedAmount: string;
      readonly includedAmount: "0.0000";
      readonly reason: "not realized";
    };
    readonly doubtfulReceivable: {
      readonly trackedAmount: string;
      readonly includedAmount: "0.0000";
      readonly reason: "planning policy excludes doubtful receivables";
    };
  };
  readonly createdAt: string;
}

interface InvestableSourceRow {
  readonly liquid_verified_amount: string;
  readonly committed_outflow_amount: string;
  readonly near_term_goal_reserve_amount: string;
  readonly excluded_expected_amount: string;
  readonly excluded_doubtful_receivable_amount: string;
  readonly source_watermark: string;
}

async function investableSources(
  sql: LedgerSql,
  userId: string,
  asOf: string,
): Promise<InvestableSourceRow> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) => tx<InvestableSourceRow[]>`
    with account_values as (
      select account.id,
        coalesce(sum(case when posting.side = 'debit' then posting.amount_base
          else -posting.amount_base end) filter (where transaction.status = 'posted'
            and transaction.economic_date <= ${asOf}::date), 0)::numeric(19,4) as balance
        from app_private.financial_accounts account
        left join app_private.ledger_postings posting
          on posting.user_id = account.user_id and posting.financial_account_id = account.id
        left join app_private.transactions transaction
          on transaction.user_id = posting.user_id and transaction.id = posting.transaction_id
       where account.user_id = ${userId}::uuid and account.status = 'active'
         and account.account_type in ('bank', 'cash', 'wallet')
       group by account.id
    ), actuals as (
      select transaction.category_id,
        coalesce(sum(case when posting.side = 'debit' then posting.amount_base
          else -posting.amount_base end), 0)::numeric(19,4) as amount
        from app_private.transactions transaction
        join app_private.ledger_postings posting
          on posting.user_id = transaction.user_id and posting.transaction_id = transaction.id
         and posting.role in ('expense', 'fee_expense')
       where transaction.user_id = ${userId}::uuid and transaction.status = 'posted'
         and transaction.economic_date >= date_trunc('month', ${asOf}::date)::date
         and transaction.economic_date <= ${asOf}::date
       group by transaction.category_id
    ), committed as (
      select coalesce(sum(greatest(line.planned_amount - coalesce(actual.amount, 0), 0)), 0)::numeric(19,4) amount
        from app_private.budgets budget
        join app_private.budget_lines line
          on line.user_id = budget.user_id and line.budget_id = budget.id
        left join actuals actual on actual.category_id = line.category_id
       where budget.user_id = ${userId}::uuid and budget.status = 'active'
         and budget.period = date_trunc('month', ${asOf}::date)::date
    ), reserve as (
      select coalesce(sum(allocation.allocated_value), 0)::numeric(19,4) amount
        from app_private.goal_allocations allocation
        join app_private.goals goal
          on goal.user_id = allocation.user_id and goal.id = allocation.goal_id
       where allocation.user_id = ${userId}::uuid and goal.status = 'active'
         and goal.target_date <= ${asOf}::date + 90
         and allocation.effective_from <= ${asOf}::date
         and (allocation.effective_to is null or allocation.effective_to >= ${asOf}::date)
    ), expected as (
      select coalesce(sum(expected_amount), 0)::numeric(19,4) amount
        from app_private.expected_payments
       where user_id = ${userId}::uuid and status in ('expected', 'overdue')
    ), doubtful as (
      select coalesce(sum(greatest(nominal_amount - collected_amount, 0)), 0)::numeric(19,4) amount
        from app_private.obligations
       where user_id = ${userId}::uuid and direction = 'receivable'
         and collectability_status = 'doubtful' and not include_in_planning
    ), watermark as (
      select greatest(
        coalesce((select max(posted_at) from app_private.transactions where user_id = ${userId}::uuid), '1970-01-01'::timestamptz),
        coalesce((select max(updated_at) from app_private.budgets where user_id = ${userId}::uuid), '1970-01-01'::timestamptz),
        coalesce((select max(updated_at) from app_private.goals where user_id = ${userId}::uuid), '1970-01-01'::timestamptz),
        coalesce((select max(updated_at) from app_private.expected_payments where user_id = ${userId}::uuid), '1970-01-01'::timestamptz),
        coalesce((select max(created_at) from app_private.obligations where user_id = ${userId}::uuid), '1970-01-01'::timestamptz)
      ) source_watermark
    )
    select greatest(coalesce((select sum(balance) from account_values), 0), 0)::numeric(19,4)::text as liquid_verified_amount,
      committed.amount::text as committed_outflow_amount,
      reserve.amount::text as near_term_goal_reserve_amount,
      expected.amount::text as excluded_expected_amount,
      doubtful.amount::text as excluded_doubtful_receivable_amount,
      watermark.source_watermark::text
      from committed cross join reserve cross join expected cross join doubtful cross join watermark
  `,
  );
  const row = rows[0];
  if (!row) throw new Error("Investable source query returned no row.");
  return row;
}

function runFromRow(row: {
  readonly id: string;
  readonly as_of: string;
  readonly source_watermark: string;
  readonly formula_version: typeof INVESTABLE_FORMULA_VERSION;
  readonly policy_version: typeof INVESTABLE_POLICY_VERSION;
  readonly liquid_verified_amount: string;
  readonly committed_outflow_amount: string;
  readonly operating_buffer_amount: string;
  readonly near_term_goal_reserve_amount: string;
  readonly excluded_expected_amount: string;
  readonly excluded_doubtful_receivable_amount: string;
  readonly canonical_investable_amount: string;
  readonly evidence_json: InvestableRun["evidence"];
  readonly created_at: string;
}): InvestableRun {
  return {
    id: row.id,
    asOf: row.as_of,
    sourceWatermark: new Date(row.source_watermark).toISOString(),
    formulaVersion: row.formula_version,
    policyVersion: row.policy_version,
    liquidVerifiedAmount: row.liquid_verified_amount,
    committedOutflowAmount: row.committed_outflow_amount,
    operatingBufferAmount: row.operating_buffer_amount,
    nearTermGoalReserveAmount: row.near_term_goal_reserve_amount,
    excludedExpectedAmount: row.excluded_expected_amount,
    excludedDoubtfulReceivableAmount: row.excluded_doubtful_receivable_amount,
    canonicalInvestableAmount: row.canonical_investable_amount,
    evidence: row.evidence_json,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

type InvestableRunRow = Parameters<typeof runFromRow>[0];

export async function createInvestableRun(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly asOf: string;
    readonly operatingBufferAmount: string;
  },
): Promise<InvestableRun> {
  const source = await investableSources(sql, input.userId, input.asOf);
  const result = calculateCanonicalInvestableAmount({
    liquidVerifiedAmount: source.liquid_verified_amount,
    committedOutflowAmount: source.committed_outflow_amount,
    operatingBufferAmount: input.operatingBufferAmount,
    nearTermGoalReserveAmount: source.near_term_goal_reserve_amount,
    excludedExpectedAmount: source.excluded_expected_amount,
    excludedDoubtfulReceivableAmount:
      source.excluded_doubtful_receivable_amount,
    currency: "TRY",
  });
  const evidence: InvestableRun["evidence"] = {
    formula:
      "max(0, liquid_verified - committed_outflow - operating_buffer - near_term_goal_reserve)",
    liquidSource: "posted active bank/cash/wallet balances",
    committedOutflowSource: "active budget remaining planned expense",
    goalReserveSource: "active allocations for goals due within 90 days",
    expected: {
      trackedAmount: source.excluded_expected_amount,
      includedAmount: "0.0000",
      reason: "not realized",
    },
    doubtfulReceivable: {
      trackedAmount: source.excluded_doubtful_receivable_amount,
      includedAmount: "0.0000",
      reason: "planning policy excludes doubtful receivables",
    },
  };
  const id = randomUUID();
  const rows = await sql.begin(
    "isolation level repeatable read read write",
    async (tx) => {
      await applyUserScope(tx, input.userId);
      return tx<InvestableRunRow[]>`
      insert into app_private.planning_investable_runs (
        id, user_id, as_of, source_watermark, formula_version, policy_version,
        liquid_verified_amount, committed_outflow_amount, operating_buffer_amount,
        near_term_goal_reserve_amount, excluded_expected_amount,
        excluded_doubtful_receivable_amount, canonical_investable_amount, evidence_json
      ) values (
        ${id}::uuid, ${input.userId}::uuid, ${input.asOf}::date,
        ${source.source_watermark}::timestamptz, ${result.formulaVersion},
        ${result.policyVersion}, ${result.liquidVerifiedAmount}::numeric,
        ${result.committedOutflowAmount}::numeric,
        ${result.operatingBufferAmount}::numeric,
        ${result.nearTermGoalReserveAmount}::numeric,
        ${result.excludedExpectedAmount}::numeric,
        ${result.excludedDoubtfulReceivableAmount}::numeric,
        ${result.canonicalInvestableAmount}::numeric,
        ${tx.json(JSON.parse(JSON.stringify(evidence)))}
      ) returning id::text, as_of::text, source_watermark::text,
        formula_version, policy_version, liquid_verified_amount::text,
        committed_outflow_amount::text, operating_buffer_amount::text,
        near_term_goal_reserve_amount::text, excluded_expected_amount::text,
        excluded_doubtful_receivable_amount::text,
        canonical_investable_amount::text, evidence_json, created_at::text
    `;
    },
  );
  if (!rows[0]) throw new Error("Investable run insert returned no row.");
  return runFromRow(rows[0]);
}

export async function getLatestInvestableRun(
  sql: LedgerSql,
  userId: string,
): Promise<InvestableRun | null> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) => tx<InvestableRunRow[]>`
    select id::text, as_of::text, source_watermark::text, formula_version,
      policy_version, liquid_verified_amount::text,
      committed_outflow_amount::text, operating_buffer_amount::text,
      near_term_goal_reserve_amount::text, excluded_expected_amount::text,
      excluded_doubtful_receivable_amount::text,
      canonical_investable_amount::text, evidence_json, created_at::text
      from app_private.planning_investable_runs
     where user_id = ${userId}::uuid
     order by created_at desc, id desc limit 1
  `,
  );
  return rows[0] ? runFromRow(rows[0]) : null;
}
