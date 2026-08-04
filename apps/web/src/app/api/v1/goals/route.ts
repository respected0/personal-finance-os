import { goalCreateSchema } from "@personal-finance-os/contracts";
import { createGoal, listGoals } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function GET(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    return financeJson(
      await listGoals(runtime.sql, runtime.accountNameKeyring, runtime.userId),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const body = parseFinanceInput(goalCreateSchema, await request.json());
    return financeJson(
      await createGoal(runtime.sql, runtime.accountNameKeyring, {
        userId: runtime.userId,
        ...body,
      }),
      201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
