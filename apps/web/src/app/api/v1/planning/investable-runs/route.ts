import { investableRunCreateSchema } from "@personal-finance-os/contracts";
import {
  createInvestableRun,
  getLatestInvestableRun,
  PlanningNotFoundError,
} from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function GET(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const run = await getLatestInvestableRun(runtime.sql, runtime.userId);
    if (!run) throw new PlanningNotFoundError();
    return financeJson(run, 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const body = parseFinanceInput(
      investableRunCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createInvestableRun(runtime.sql, {
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
