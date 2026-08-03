import { sharedExpensePreviewRequestSchema } from "@personal-finance-os/contracts";
import { previewSharedExpense } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const body = parseFinanceInput(
      sharedExpensePreviewRequestSchema,
      await request.json(),
    );
    return financeJson(
      await previewSharedExpense(runtime.sql, {
        userId: runtime.userId,
        command: { type: "shared_expense", ...body },
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
