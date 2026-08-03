import {
  sharedExpenseCreateSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { createSharedExpense } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      sharedExpenseCreateSchema,
      await request.json(),
    );
    const result = await createSharedExpense(runtime.sql, {
      userId: runtime.userId,
      idempotencyKey,
      requestId: runtime.requestId,
      requestPayload: body,
      command: { type: "shared_expense", ...body },
    });
    return financeJson(
      result,
      result.transaction.replayed ? 200 : 201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
