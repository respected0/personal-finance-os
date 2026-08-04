import { accountDeletionCreateSchema } from "@personal-finance-os/contracts";
import { requestAccountDeletion } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "sensitive");
    parseFinanceInput(accountDeletionCreateSchema, await request.json());
    return financeJson(
      await requestAccountDeletion(runtime.sql, {
        userId: runtime.userId,
        requestId: runtime.requestId,
      }),
      202,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
