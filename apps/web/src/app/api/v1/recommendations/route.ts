import { recommendationQuerySchema } from "@personal-finance-os/contracts";
import { listRecommendations } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function GET(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const url = new URL(request.url);
    const query = parseFinanceInput(recommendationQuerySchema, {
      period: url.searchParams.get("period") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return financeJson(
      await listRecommendations(runtime.sql, {
        userId: runtime.userId,
        ...(query.period ? { period: query.period } : {}),
        ...(query.status ? { status: query.status } : {}),
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
