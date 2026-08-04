import {
  recommendationRuleCodeSchema,
  recommendationSettingPutSchema,
} from "@personal-finance-os/contracts";
import { putRecommendationSetting } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

function expectedVersion(request: Request): number {
  const value = request.headers.get("if-match");
  if (!value || !/^\d+$/u.test(value)) {
    throw Object.assign(
      new Error("If-Match must be zero or a positive row version."),
      {
        code: "invalid_input",
        status: 400,
      },
    );
  }
  return Number(value);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ rule: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const ruleCode = parseFinanceInput(
      recommendationRuleCodeSchema,
      (await context.params).rule,
    );
    const body = parseFinanceInput(
      recommendationSettingPutSchema,
      await request.json(),
    );
    return financeJson(
      await putRecommendationSetting(runtime.sql, {
        userId: runtime.userId,
        ruleCode,
        expectedVersion: expectedVersion(request),
        enabled: body.enabled,
        threshold: body.threshold,
        effectiveFrom: body.effectiveFrom,
        ...(body.effectiveTo !== undefined
          ? { effectiveTo: body.effectiveTo }
          : {}),
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
