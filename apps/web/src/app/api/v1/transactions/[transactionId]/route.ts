import { uuidSchema } from "@personal-finance-os/contracts";
import { getTransactionDetail } from "@personal-finance-os/db";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ transactionId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const { transactionId: rawTransactionId } = await context.params;
    const transactionId = parseFinanceInput(uuidSchema, rawTransactionId);
    const detail = await getTransactionDetail(
      runtime.sql,
      runtime.userId,
      transactionId,
    );
    if (!detail) throw new FinanceApiError(404, "not_found", "Not found.");
    return financeJson(detail, 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
