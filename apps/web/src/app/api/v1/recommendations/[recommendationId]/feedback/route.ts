import {
  recommendationFeedbackSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { recordRecommendationFeedback } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ recommendationId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const recommendationId = parseFinanceInput(
      uuidSchema,
      (await context.params).recommendationId,
    );
    const body = parseFinanceInput(
      recommendationFeedbackSchema,
      await request.json(),
    );
    return financeJson(
      await recordRecommendationFeedback(runtime.sql, {
        userId: runtime.userId,
        recommendationId,
        feedback: body.feedback,
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
