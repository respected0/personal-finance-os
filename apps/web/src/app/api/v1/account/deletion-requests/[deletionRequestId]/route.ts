import { uuidSchema } from "@personal-finance-os/contracts";
import { cancelAccountDeletion } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ deletionRequestId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "sensitive");
    const { deletionRequestId: rawId } = await context.params;
    const deletionRequestId = parseFinanceInput(uuidSchema, rawId);
    return financeJson(
      await cancelAccountDeletion(runtime.sql, {
        userId: runtime.userId,
        deletionRequestId,
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
