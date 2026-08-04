import { randomUUID } from "node:crypto";
import type { LedgerSql } from "./ledger-repository.js";
import { applyUserScope, withUserScope } from "./user-scope.js";

export const MONTHLY_REVIEW_VERSION = "monthly-review-1.0.0";

export interface MonthlyReviewRecord {
  readonly id: string;
  readonly period: string;
  readonly reportVersionId: string;
  readonly investableRunId: string;
  readonly checklist: Readonly<Record<string, boolean>>;
  readonly decision:
    "hold" | "adjust_budget" | "adjust_goal" | "review_investment";
  readonly reviewVersion: typeof MONTHLY_REVIEW_VERSION;
  readonly completedAt: string;
}

type Row = {
  readonly id: string;
  readonly period: string;
  readonly report_version_id: string;
  readonly investable_run_id: string;
  readonly checklist_json: Readonly<Record<string, boolean>>;
  readonly decision: MonthlyReviewRecord["decision"];
  readonly review_version: typeof MONTHLY_REVIEW_VERSION;
  readonly completed_at: string;
};

function fromRow(row: Row): MonthlyReviewRecord {
  return {
    id: row.id,
    period: row.period.slice(0, 7),
    reportVersionId: row.report_version_id,
    investableRunId: row.investable_run_id,
    checklist: row.checklist_json,
    decision: row.decision,
    reviewVersion: row.review_version,
    completedAt: new Date(row.completed_at).toISOString(),
  };
}

export async function createMonthlyReview(
  sql: LedgerSql,
  input: Omit<MonthlyReviewRecord, "id" | "reviewVersion" | "completedAt"> & {
    readonly userId: string;
  },
): Promise<MonthlyReviewRecord> {
  const id = randomUUID();
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    await tx`
      insert into app_private.monthly_reviews (
        id,user_id,period,report_version_id,investable_run_id,
        checklist_json,decision,review_version,completed_at
      ) values (
        ${id}::uuid,${input.userId}::uuid,(${input.period} || '-01')::date,
        ${input.reportVersionId}::uuid,${input.investableRunId}::uuid,
        ${tx.json(input.checklist)},${input.decision},${MONTHLY_REVIEW_VERSION},now()
      )
      on conflict (user_id,period,report_version_id,investable_run_id)
      do update set checklist_json=excluded.checklist_json,
        decision=excluded.decision,completed_at=excluded.completed_at
    `;
  });
  const rows = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<Row[]>`
    select id::text,period::text,report_version_id::text,investable_run_id::text,
      checklist_json,decision,review_version,completed_at::text
    from app_private.monthly_reviews
    where user_id=${input.userId}::uuid and period=(${input.period} || '-01')::date
      and report_version_id=${input.reportVersionId}::uuid
      and investable_run_id=${input.investableRunId}::uuid
  `,
  );
  if (!rows[0]) throw new Error("Monthly review write disappeared.");
  return fromRow(rows[0]);
}
