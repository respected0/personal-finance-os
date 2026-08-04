import {
  expectedPaymentRealizeSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { realizeExpectedPayment } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ expectedPaymentId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { expectedPaymentId: rawId } = await context.params;
    const expectedPaymentId = parseFinanceInput(uuidSchema, rawId);
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      expectedPaymentRealizeSchema,
      await request.json(),
    );
    const result = await realizeExpectedPayment(runtime.sql, {
      userId: runtime.userId,
      expectedPaymentId,
      idempotencyKey,
      requestId: runtime.requestId,
      ...body,
    });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
