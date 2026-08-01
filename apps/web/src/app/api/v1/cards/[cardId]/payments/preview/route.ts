import {
  cardPaymentRequestSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { previewTransaction } from "@personal-finance-os/domain";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { cardId: rawCardId } = await context.params;
    const cardAccountId = parseFinanceInput(uuidSchema, rawCardId);
    const body = parseFinanceInput(
      cardPaymentRequestSchema,
      await request.json(),
    );
    return financeJson(
      previewTransaction({
        type: "card_payment",
        amount: body.amount,
        currency: body.currency,
        occurredAt: body.occurredAt,
        economicDate: body.economicDate,
        bankAccountId: body.bankAccountId,
        cardAccountId,
        ...(body.statementAllocations
          ? { statementAllocations: body.statementAllocations }
          : {}),
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
