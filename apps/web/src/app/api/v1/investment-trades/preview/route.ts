import { investmentTradePreviewRequestSchema } from "@personal-finance-os/contracts";
import { previewTransaction } from "@personal-finance-os/domain";
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
    return financeJson(previewTransaction(command), 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
