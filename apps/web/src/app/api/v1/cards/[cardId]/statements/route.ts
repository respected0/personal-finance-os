import { uuidSchema } from "@personal-finance-os/contracts";
import { listCreditCardStatements } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const { cardId: rawCardId } = await context.params;
    const cardId = parseFinanceInput(uuidSchema, rawCardId);
    return financeJson(
      await listCreditCardStatements(runtime.sql, runtime.userId, cardId),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
