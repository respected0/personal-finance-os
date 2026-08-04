import { portfolioQuerySchema } from "@personal-finance-os/contracts";
import { getPortfolio } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function GET(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const query = parseFinanceInput(portfolioQuerySchema, {
      asOf: new URL(request.url).searchParams.get("as_of") ?? undefined,
    });
    return financeJson(
      await getPortfolio(runtime.sql, {
        userId: runtime.userId,
        asOf: query.asOf ?? new Date().toISOString(),
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
