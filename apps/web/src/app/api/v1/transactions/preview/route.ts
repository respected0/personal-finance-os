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

function dailyCommand(input: TransactionCommandInput): TransactionCommand {
  if (
    input.type !== "expense" &&
    input.type !== "income" &&
    input.type !== "transfer"
  ) {
    throw new FinanceApiError(
      422,
      "validation_failed",
      "This transaction type is not available in P0-A1.",
    );
  }
  return input as TransactionCommand;
}

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const command = dailyCommand(
      parseFinanceInput(transactionCommandSchema, await request.json()),
    );
    return financeJson(previewTransaction(command), 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
