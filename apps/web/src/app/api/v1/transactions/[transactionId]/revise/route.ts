import {
  reviseRequestSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { commitRevisedTransaction } from "@personal-finance-os/db";
import type { NonRevisionTransactionCommand } from "@personal-finance-os/domain";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ transactionId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { transactionId: rawTransactionId } = await context.params;
    const transactionId = parseFinanceInput(uuidSchema, rawTransactionId);
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(reviseRequestSchema, await request.json());
    const result = await commitRevisedTransaction(runtime.sql, {
      userId: runtime.userId,
      transactionId,
      idempotencyKey,
      requestId: runtime.requestId,
      reason: body.reason,
      replacement: body.replacement as NonRevisionTransactionCommand,
    });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
