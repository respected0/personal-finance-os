import {
  collectabilityStatusSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { listReceivables } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function GET(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const search = new URL(request.url).searchParams;
    const statusValue = search.get("status");
    const personValue = search.get("person");
    return financeJson(
      await listReceivables(runtime.sql, runtime.accountNameKeyring, {
        userId: runtime.userId,
        status:
          statusValue === null
            ? undefined
            : parseFinanceInput(collectabilityStatusSchema, statusValue),
        personId:
          personValue === null
            ? undefined
            : parseFinanceInput(uuidSchema, personValue),
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
