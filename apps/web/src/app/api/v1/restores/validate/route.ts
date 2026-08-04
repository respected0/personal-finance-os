import { restoreValidateSchema } from "@personal-finance-os/contracts";
import { validateDataRestore } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "sensitive");
    const body = parseFinanceInput(restoreValidateSchema, await request.json());
    return financeJson(
      await validateDataRestore(runtime.sql, runtime.accountNameKeyring, {
        userId: runtime.userId,
        ...body,
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
