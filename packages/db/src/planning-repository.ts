import { randomUUID } from "node:crypto";
import type { AccountNameKeyring } from "./account-crypto.js";
import type { LedgerSql } from "./ledger-repository.js";
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
