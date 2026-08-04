import { randomUUID } from "node:crypto";
import {
  createLedgerSql,
  evaluateRecommendationRun,
  listRecommendations,
  putRecommendationSetting,
  RecommendationNotFoundError,
  RecommendationVersionConflictError,
} from "../../dist/index.js";
import {
  runSupabase,
  startLocalStack,
} from "../../../../scripts/db/common.mjs";

const sql = createLedgerSql(
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 4 },
);
const userA = randomUUID();
const userB = randomUUID();
const augustRunId = randomUUID();
const septemberRunId = randomUUID();
let stackStarted = false;

function assert(value, message) {
  if (!value) throw new Error(message);
}

try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalStack();
  stackStarted = true;
  runSupabase(["db", "reset", "--local"], { capture: true });
  await sql`
    insert into auth.users (id,email,aud,role,created_at,updated_at)
    values
      (${userA}::uuid,${`b085-${userA}@example.test`},'authenticated','authenticated',now(),now()),
      (${userB}::uuid,${`b085-${userB}@example.test`},'authenticated','authenticated',now(),now())
  `;
  const registry = await sql`
    select code,version,default_enabled,default_threshold::text
    from app_private.recommendation_rules order by code
  `;
  assert(
    registry.length === 15 &&
      registry[0]?.code === "R-01" &&
      registry[14]?.code === "R-15" &&
      registry.every((row) => row.version === 1) &&
      registry.filter((row) => row.default_enabled).length === 1 &&
      registry[0]?.default_threshold === "0.0000",
    "B083 exact versioned R-01–R-15 registry is incomplete or unexpectedly active.",
  );
  await sql`
    insert into app_private.planning_investable_runs (
      id,user_id,as_of,source_watermark,formula_version,policy_version,
      liquid_verified_amount,committed_outflow_amount,operating_buffer_amount,
      near_term_goal_reserve_amount,excluded_expected_amount,
      excluded_doubtful_receivable_amount,canonical_investable_amount,evidence_json
    ) values
      (${augustRunId}::uuid,${userA}::uuid,'2026-08-31','2026-08-31T20:00:00Z',
       'investable-formula-1.0.0','planning-policy-1.0.0',3000.0000,500.0000,
       1000.0000,265.4322,0.0000,0.0000,1234.5678,
       '{"fixture":"SYN-B085-AUG","expected":{"includedAmount":"0.0000"},"doubtfulReceivable":{"includedAmount":"0.0000"}}'::jsonb),
      (${septemberRunId}::uuid,${userA}::uuid,'2026-09-30','2026-09-30T20:00:00Z',
       'investable-formula-1.0.0','planning-policy-1.0.0',2500.0000,400.0000,
       1000.0000,65.4322,0.0000,0.0000,1034.5678,
       '{"fixture":"SYN-B085-SEP","expected":{"includedAmount":"0.0000"},"doubtfulReceivable":{"includedAmount":"0.0000"}}'::jsonb)
  `;

  const augustSetting = await putRecommendationSetting(sql, {
    userId: userA,
    ruleCode: "R-01",
    expectedVersion: 0,
    enabled: true,
    threshold: "1000.0000",
    effectiveFrom: "2026-08-01",
  });
  assert(
    augustSetting.ruleVersion === 1 &&
      augustSetting.rowVersion === 1 &&
      augustSetting.threshold === "1000.0000",
    "B084 first effective threshold setting is not visible with its version.",
  );
  try {
    await putRecommendationSetting(sql, {
      userId: userA,
      ruleCode: "R-01",
      expectedVersion: 9,
      enabled: true,
      threshold: "900.0000",
      effectiveFrom: "2026-09-01",
    });
    throw new Error("Stale recommendation setting unexpectedly committed.");
  } catch (error) {
    assert(
      error instanceof RecommendationVersionConflictError,
      `B084 stale If-Match returned unexpected error: ${error?.message}`,
    );
  }

  const first = await evaluateRecommendationRun(sql, {
    userId: userA,
    period: "2026-08",
    investableRunId: augustRunId,
    scenarioReserveAmount: "250.1250",
  });
  assert(
    first.length === 1 &&
      first[0]?.ruleCode === "R-01" &&
      first[0]?.ruleVersion === 1 &&
      first[0]?.investableRunId === augustRunId &&
      first[0]?.observedAmount === "1234.5678" &&
      first[0]?.usedThreshold === "1000.0000" &&
      first[0]?.differenceAmount === "234.5678" &&
      first[0]?.alternativeAmount === "984.4428" &&
      first[0]?.evidence.investableRunId === augustRunId &&
      first[0]?.evidence.sourceWatermark === "2026-08-31T20:00:00.000Z",
    "B085 canonical run identity or exact threshold/difference/alternative evidence changed.",
  );
  const replay = await evaluateRecommendationRun(sql, {
    userId: userA,
    period: "2026-08",
    investableRunId: augustRunId,
    scenarioReserveAmount: "250.1250",
  });
  const runCounts = await sql`
    select
      (select count(*) from app_private.recommendation_runs)::integer runs,
      (select count(*) from app_private.recommendations)::integer recommendations
  `;
  assert(
    replay[0]?.id === first[0]?.id &&
      runCounts[0]?.runs === 1 &&
      runCounts[0]?.recommendations === 1,
    "B085 idempotent evaluation duplicated a run or recommendation.",
  );

  const septemberSetting = await putRecommendationSetting(sql, {
    userId: userA,
    ruleCode: "R-01",
    expectedVersion: augustSetting.rowVersion,
    enabled: true,
    threshold: "800.0000",
    effectiveFrom: "2026-09-01",
  });
  assert(
    septemberSetting.threshold === "800.0000" &&
      septemberSetting.effectiveFrom === "2026-09-01",
    "B084 dated threshold override was not materialized.",
  );
  const september = await evaluateRecommendationRun(sql, {
    userId: userA,
    period: "2026-09",
    investableRunId: septemberRunId,
    scenarioReserveAmount: "50.0000",
  });
  assert(
    september[0]?.observedAmount === "1034.5678" &&
      september[0]?.usedThreshold === "800.0000" &&
      september[0]?.differenceAmount === "234.5678" &&
      september[0]?.alternativeAmount === "984.5678",
    "B084/B085 effective-date threshold or exact scenario boundary failed.",
  );
  assert(
    (await listRecommendations(sql, { userId: userB })).length === 0,
    "B085 recommendation list crossed user ownership.",
  );
  try {
    await evaluateRecommendationRun(sql, {
      userId: userB,
      period: "2026-08",
      investableRunId: augustRunId,
      scenarioReserveAmount: "0.0000",
    });
    throw new Error("Cross-user canonical run unexpectedly evaluated.");
  } catch (error) {
    assert(
      error instanceof RecommendationNotFoundError,
      `B085 cross-user canonical run returned unexpected error: ${error?.message}`,
    );
  }
  const history = await sql`
    select threshold::text,effective_from::text,effective_to::text,row_version
    from app_private.recommendation_settings
    where user_id=${userA}::uuid and rule_code='R-01'
    order by effective_from
  `;
  assert(
    history.length === 2 &&
      history[0]?.effective_to === "2026-08-31" &&
      history[0]?.row_version === 2 &&
      history[1]?.effective_to === null,
    "B084 effective setting history was overwritten instead of versioned.",
  );
  console.log("P0-B3 B083 R-01–R-15 registry/version acceptance: PASS");
  console.log("P0-B3 B084 threshold/override/effective-date acceptance: PASS");
  console.log(
    "P0-B3 B085 canonical investable_run consumer, exact evidence, idempotency and RLS: PASS",
  );
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted)
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
}
