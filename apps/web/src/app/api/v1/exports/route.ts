import { dataExportCreateSchema } from "@personal-finance-os/contracts";
import { createDataExport } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "sensitive");
    const body = parseFinanceInput(
      dataExportCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createDataExport(runtime.sql, runtime.accountNameKeyring, {
        userId: runtime.userId,
        format: body.format,
        scope: body.scope,
        passphrase: body.passphrase,
      }),
      202,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
