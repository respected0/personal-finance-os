import { restoreApplySchema, uuidSchema } from "@personal-finance-os/contracts";
import { refuseRestoreApply } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ validationId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "sensitive");
    const { validationId: rawValidationId } = await context.params;
    const validationId = parseFinanceInput(uuidSchema, rawValidationId);
    const body = parseFinanceInput(restoreApplySchema, await request.json());
    await refuseRestoreApply(runtime.sql, {
      userId: runtime.userId,
      validationId,
      confirmationToken: body.confirmationToken,
    });
    return financeJson({}, 202, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
