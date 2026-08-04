import {
  goalAllocationCreateSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { createGoalAllocation } from "@personal-finance-os/db";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ goalId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { goalId: rawGoalId } = await context.params;
    const goalId = parseFinanceInput(uuidSchema, rawGoalId);
    const body = parseFinanceInput(
      goalAllocationCreateSchema,
      await request.json(),
    );
    const rowVersion = Number(request.headers.get("if-match"));
    if (!Number.isInteger(rowVersion) || rowVersion <= 0) {
      throw new FinanceApiError(
        422,
        "validation_failed",
        "If-Match must be a positive goal row version.",
      );
    }
    return financeJson(
      await createGoalAllocation(runtime.sql, runtime.accountNameKeyring, {
        userId: runtime.userId,
        goalId,
        expectedVersion: rowVersion,
        ...body,
      }),
      201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
