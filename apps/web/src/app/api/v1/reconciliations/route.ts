import { reconciliationCreateSchema } from "@personal-finance-os/contracts";
import { createReconciliationSession } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const body = parseFinanceInput(
      reconciliationCreateSchema,
      await request.json(),
    );
    const session = await createReconciliationSession(runtime.sql, {
      userId: runtime.userId,
      requestId: runtime.requestId,
      ...body,
    });
    return financeJson(session, 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
