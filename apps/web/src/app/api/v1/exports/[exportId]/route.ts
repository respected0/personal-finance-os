import { uuidSchema } from "@personal-finance-os/contracts";
import { getDataExport } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "sensitive");
    const { exportId: rawExportId } = await context.params;
    const exportId = parseFinanceInput(uuidSchema, rawExportId);
    return financeJson(
      await getDataExport(runtime.sql, { userId: runtime.userId, exportId }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
