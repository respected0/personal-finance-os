import { randomUUID } from "node:crypto";
import {
  evaluateRecommendation,
  RECOMMENDATION_ENGINE_VERSION,
  type RecommendationEvaluation,
} from "@personal-finance-os/domain";
import { applyUserScope, withUserScope } from "./user-scope.js";
import type { LedgerSql } from "./ledger-repository.js";

export interface RecommendationSetting {
  readonly id: string;
  readonly ruleCode: string;
  readonly ruleVersion: number;
  readonly enabled: boolean;
  readonly threshold: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly rowVersion: number;
}

export interface RecommendationRecord {
  readonly id: string;
  readonly runId: string;
  readonly investableRunId: string;
  readonly ruleCode: string;
  readonly ruleVersion: number;
  readonly period: string;
  readonly sourceWatermark: string;
  readonly engineVersion: typeof RECOMMENDATION_ENGINE_VERSION;
  readonly usedThreshold: string;
  readonly observedAmount: string;
  readonly differenceAmount: string;
  readonly impactAmount: string;
  readonly alternativeAmount: string;
  readonly status: "active" | "later" | "dismissed" | "done";
  readonly cooldownUntil: string | null;
  readonly evidence: RecommendationEvaluation["evidence"];
}

export class RecommendationNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;
  constructor() {
    super("The requested recommendation resource was not found.");
  }
}

export class RecommendationVersionConflictError extends Error {
  readonly code = "version_conflict";
  readonly status = 409;
  constructor() {
    super("The recommendation setting changed after it was read.");
  }
}

type SettingRow = {
  readonly id: string;
  readonly rule_code: string;
  readonly rule_version: number;
  readonly enabled: boolean;
  readonly threshold: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly row_version: number;
};

function settingFromRow(row: SettingRow): RecommendationSetting {
  return {
    id: row.id,
    ruleCode: row.rule_code,
    ruleVersion: row.rule_version,
    enabled: row.enabled,
    threshold: row.threshold,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    rowVersion: row.row_version,
  };
}

export async function putRecommendationSetting(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly ruleCode: string;
    readonly expectedVersion: number;
    readonly enabled: boolean;
    readonly threshold: string;
    readonly effectiveFrom: string;
    readonly effectiveTo?: string | null;
  },
): Promise<RecommendationSetting> {
  const createdId = randomUUID();
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const rule = await tx<{ readonly version: number }[]>`
      select version from app_private.recommendation_rules
       where code=${input.ruleCode} and active
       order by version desc limit 1
    `;
    const ruleVersion = rule[0]?.version;
    if (!ruleVersion) throw new RecommendationNotFoundError();
    const current = await tx<SettingRow[]>`
      select id::text, rule_code, rule_version, enabled, threshold::text,
        effective_from::text, effective_to::text, row_version
      from app_private.recommendation_settings
      where user_id=${input.userId}::uuid and rule_code=${input.ruleCode}
        and rule_version=${ruleVersion} and effective_to is null
      for update
    `;
    const existing = current[0];
    if (!existing) {
      if (input.expectedVersion !== 0)
        throw new RecommendationVersionConflictError();
    } else {
      if (
        existing.row_version !== input.expectedVersion ||
        input.effectiveFrom <= existing.effective_from
      ) {
        throw new RecommendationVersionConflictError();
      }
      await tx`
        update app_private.recommendation_settings
           set effective_to=(${input.effectiveFrom}::date - 1),
               row_version=row_version+1, updated_at=now()
         where user_id=${input.userId}::uuid and id=${existing.id}::uuid
      `;
    }
    await tx`
      insert into app_private.recommendation_settings (
        id,user_id,rule_code,rule_version,threshold,enabled,
        effective_from,effective_to
      ) values (
        ${createdId}::uuid,${input.userId}::uuid,${input.ruleCode},${ruleVersion},
        ${input.threshold}::numeric,${input.enabled},${input.effectiveFrom}::date,
        ${input.effectiveTo ?? null}::date
      )
    `;
  });
  const result = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<SettingRow[]>`
    select id::text,rule_code,rule_version,enabled,threshold::text,
      effective_from::text,effective_to::text,row_version
    from app_private.recommendation_settings
    where user_id=${input.userId}::uuid and id=${createdId}::uuid
  `,
  );
  if (!result[0]) throw new Error("Recommendation setting write disappeared.");
  return settingFromRow(result[0]);
}

type RecommendationRow = {
  readonly id: string;
  readonly run_id: string;
  readonly investable_run_id: string;
  readonly rule_code: string;
  readonly rule_version: number;
  readonly period: string;
  readonly source_watermark: string;
  readonly engine_version: typeof RECOMMENDATION_ENGINE_VERSION;
  readonly used_threshold: string;
  readonly observed_amount: string;
  readonly difference_amount: string;
  readonly impact_amount: string;
  readonly alternative_amount: string;
  readonly status: RecommendationRecord["status"];
  readonly cooldown_until: string | null;
  readonly evidence_json: RecommendationEvaluation["evidence"];
};

function recommendationFromRow(row: RecommendationRow): RecommendationRecord {
  return {
    id: row.id,
    runId: row.run_id,
    investableRunId: row.investable_run_id,
    ruleCode: row.rule_code,
    ruleVersion: row.rule_version,
    period: row.period,
    sourceWatermark: new Date(row.source_watermark).toISOString(),
    engineVersion: row.engine_version,
    usedThreshold: row.used_threshold,
    observedAmount: row.observed_amount,
    differenceAmount: row.difference_amount,
    impactAmount: row.impact_amount,
    alternativeAmount: row.alternative_amount,
    status: row.status,
    cooldownUntil: row.cooldown_until
      ? new Date(row.cooldown_until).toISOString()
      : null,
    evidence: row.evidence_json,
  };
}

async function selectRecommendations(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly period?: string;
    readonly status?: RecommendationRecord["status"];
  },
): Promise<readonly RecommendationRecord[]> {
  const rows = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<RecommendationRow[]>`
    select recommendation.id::text,recommendation.run_id::text,
      run.investable_run_id::text, recommendation.rule_code,
      recommendation.rule_version,run.period::text,run.source_watermark::text,
      run.engine_version,recommendation.used_threshold::text,
      recommendation.observed_amount::text,recommendation.difference_amount::text,
      recommendation.impact_amount::text,recommendation.alternative_amount::text,
      recommendation.status,recommendation.cooldown_until::text,
      recommendation.evidence_json
    from app_private.recommendations recommendation
    join app_private.recommendation_runs run
      on run.user_id=recommendation.user_id and run.id=recommendation.run_id
    where recommendation.user_id=${input.userId}::uuid
      and (${input.period ?? null}::text is null or
        run.period=date_trunc('month',(${input.period ?? null} || '-01')::date)::date)
      and (${input.status ?? null}::text is null or recommendation.status=${input.status ?? null})
    order by run.period desc,recommendation.rule_code,recommendation.rule_version desc
  `,
  );
  return rows.map(recommendationFromRow);
}

export async function evaluateRecommendationRun(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly period: string;
    readonly investableRunId: string;
    readonly scenarioReserveAmount: string;
  },
): Promise<readonly RecommendationRecord[]> {
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const investable = await tx<
      {
        readonly canonical_investable_amount: string;
        readonly source_watermark: string;
      }[]
    >`
      select canonical_investable_amount::text,source_watermark::text
      from app_private.planning_investable_runs
      where user_id=${input.userId}::uuid and id=${input.investableRunId}::uuid
    `;
    const source = investable[0];
    if (!source) throw new RecommendationNotFoundError();
    const existing = await tx<{ readonly id: string }[]>`
      select id::text from app_private.recommendation_runs
      where user_id=${input.userId}::uuid
        and period=(${input.period} || '-01')::date
        and investable_run_id=${input.investableRunId}::uuid
        and scenario_reserve_amount=${input.scenarioReserveAmount}::numeric
    `;
    if (existing[0]) return;
    const rules = await tx<
      {
        readonly code: string;
        readonly version: number;
        readonly used_threshold: string;
        readonly enabled: boolean;
      }[]
    >`
      select rule.code,rule.version,
        coalesce(setting.threshold,rule.default_threshold)::text used_threshold,
        coalesce(setting.enabled,rule.default_enabled) enabled
      from app_private.recommendation_rules rule
      left join lateral (
        select threshold,enabled from app_private.recommendation_settings
        where user_id=${input.userId}::uuid and rule_code=rule.code
          and rule_version=rule.version
          and effective_from <= (${input.period} || '-01')::date
          and (effective_to is null or effective_to >= (${input.period} || '-01')::date)
        order by effective_from desc limit 1
      ) setting on true
      where rule.active
      order by rule.code,rule.version desc
    `;
    const runId = randomUUID();
    await tx`
      insert into app_private.recommendation_runs (
        id,user_id,period,source_watermark,engine_version,investable_run_id,
        scenario_reserve_amount
      ) values (
        ${runId}::uuid,${input.userId}::uuid,(${input.period} || '-01')::date,
        ${source.source_watermark}::timestamptz,${RECOMMENDATION_ENGINE_VERSION},
        ${input.investableRunId}::uuid,${input.scenarioReserveAmount}::numeric
      )
    `;
    for (const rule of rules.filter(({ enabled }) => enabled)) {
      const result = evaluateRecommendation({
        period: `${input.period}-01`,
        investableRunId: input.investableRunId,
        sourceWatermark: new Date(source.source_watermark).toISOString(),
        canonicalInvestableAmount: source.canonical_investable_amount,
        usedThreshold: rule.used_threshold,
        scenarioReserveAmount: input.scenarioReserveAmount,
      });
      await tx`
        insert into app_private.recommendations (
          id,user_id,run_id,rule_code,rule_version,used_threshold,
          observed_amount,difference_amount,impact_amount,alternative_amount,
          evidence_json
        ) values (
          ${randomUUID()}::uuid,${input.userId}::uuid,${runId}::uuid,
          ${rule.code},${rule.version},${rule.used_threshold}::numeric,
          ${result.observedAmount}::numeric,${result.differenceAmount}::numeric,
          ${result.impactAmount}::numeric,${result.alternativeAmount}::numeric,
          ${tx.json(result.evidence)}
        )
      `;
    }
  });
  return selectRecommendations(sql, {
    userId: input.userId,
    period: input.period,
  });
}

export async function listRecommendations(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly period?: string;
    readonly status?: RecommendationRecord["status"];
  },
): Promise<readonly RecommendationRecord[]> {
  return selectRecommendations(sql, input);
}

export async function recordRecommendationFeedback(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly recommendationId: string;
    readonly feedback: "helpful" | "later" | "dismissed" | "done";
  },
): Promise<RecommendationRecord> {
  await withUserScope(sql, input.userId, async (tx) => {
    const rows = await tx<{ readonly id: string }[]>`
      update app_private.recommendations set
        feedback=${input.feedback},
        status=${input.feedback === "helpful" ? "active" : input.feedback},
        cooldown_until=case when ${input.feedback}='later'
          then now() + interval '7 days' else null end,
        updated_at=now()
      where user_id=${input.userId}::uuid and id=${input.recommendationId}::uuid
      returning id::text
    `;
    if (!rows[0]) throw new RecommendationNotFoundError();
  });
  const rows = await selectRecommendations(sql, { userId: input.userId });
  const result = rows.find(({ id }) => id === input.recommendationId);
  if (!result) throw new RecommendationNotFoundError();
  return result;
}
