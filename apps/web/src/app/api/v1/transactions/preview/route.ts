import {
  transactionCommandSchema,
  type TransactionCommandInput,
} from "@personal-finance-os/contracts";
import {
  previewTransaction,
  type TransactionCommand,
} from "@personal-finance-os/domain";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

function availableCommand(input: TransactionCommandInput): TransactionCommand {
  if (
    input.type !== "expense" &&
    input.type !== "income" &&
    input.type !== "transfer" &&
    input.type !== "card_payment"
  ) {
    throw new FinanceApiError(
      422,
      "validation_failed",
      "This transaction type is not available in the current product wave.",
    );
  }
  return input as TransactionCommand;
}

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const command = availableCommand(
      parseFinanceInput(transactionCommandSchema, await request.json()),
    );
    return financeJson(previewTransaction(command), 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
