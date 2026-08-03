import {
  receivableSettlementRequestSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { settleReceivable } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ receivableId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { receivableId: rawReceivableId } = await context.params;
    const receivableId = parseFinanceInput(uuidSchema, rawReceivableId);
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      receivableSettlementRequestSchema,
      await request.json(),
    );
    const result = await settleReceivable(runtime.sql, {
      userId: runtime.userId,
      receivableId,
      idempotencyKey,
      requestId: runtime.requestId,
      requestPayload: body,
      ...body,
    });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
