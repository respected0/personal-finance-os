import { uuidSchema, voidRequestSchema } from "@personal-finance-os/contracts";
import { commitVoidTransaction } from "@personal-finance-os/db";
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
    const body = parseFinanceInput(voidRequestSchema, await request.json());
    const result = await commitVoidTransaction(runtime.sql, {
      userId: runtime.userId,
      transactionId,
      idempotencyKey,
      requestId: runtime.requestId,
      reason: body.reason,
    });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
