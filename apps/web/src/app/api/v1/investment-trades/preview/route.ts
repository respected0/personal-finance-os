import { investmentTradePreviewRequestSchema } from "@personal-finance-os/contracts";
import { previewInvestmentTrade } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const command = parseFinanceInput(
      investmentTradePreviewRequestSchema,
      await request.json(),
    );
    return financeJson(
      await previewInvestmentTrade(runtime.sql, runtime.userId, command),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
