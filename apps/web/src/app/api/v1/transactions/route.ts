import {
  transactionCommitRequestSchema,
  transactionHistoryQuerySchema,
  type TransactionCommandInput,
  uuidSchema,
} from "@personal-finance-os/contracts";
import {
  commitLedgerTransaction,
  listTransactions,
} from "@personal-finance-os/db";
import type { TransactionCommand } from "@personal-finance-os/domain";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

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

export async function GET(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const search = new URL(request.url).searchParams;
    const rawLimit = search.get("limit");
    const query = parseFinanceInput(transactionHistoryQuerySchema, {
      cursor: search.get("cursor") ?? undefined,
      periodFrom: search.get("period_from") ?? undefined,
      periodTo: search.get("period_to") ?? undefined,
      type: search.get("type") ?? undefined,
      accountId: search.get("account") ?? undefined,
      categoryId: search.get("category") ?? undefined,
      limit: rawLimit === null ? undefined : Number(rawLimit),
    });
    return financeJson(
      await listTransactions(runtime.sql, {
        userId: runtime.userId,
        ...query,
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      transactionCommitRequestSchema,
      await request.json(),
    );
    const result = await commitLedgerTransaction(runtime.sql, {
      userId: runtime.userId,
      idempotencyKey,
      requestId: runtime.requestId,
      command: availableCommand(body.command),
      ...(body.previewHash ? { previewHash: body.previewHash } : {}),
    });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
