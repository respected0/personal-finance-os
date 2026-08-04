import {
  budgetPeriodSchema,
  budgetPutSchema,
} from "@personal-finance-os/contracts";
import { getBudget, putBudget } from "@personal-finance-os/db";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

function expectedVersion(request: Request): number {
  const value = Number(request.headers.get("if-match"));
  if (!Number.isInteger(value) || value < 0) {
    throw new FinanceApiError(
      422,
      "validation_failed",
      "If-Match must be zero for create or a positive row version.",
    );
  }
  return value;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const { period: rawPeriod } = await context.params;
    const period = parseFinanceInput(budgetPeriodSchema, rawPeriod);
    const budget = await getBudget(runtime.sql, runtime.userId, period);
    if (!budget)
      throw new FinanceApiError(404, "not_found", "Budget not found.");
    return financeJson(budget, 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { period: rawPeriod } = await context.params;
    const period = parseFinanceInput(budgetPeriodSchema, rawPeriod);
    const body = parseFinanceInput(budgetPutSchema, await request.json());
    const budget = await putBudget(runtime.sql, {
      userId: runtime.userId,
      period,
      expectedVersion: expectedVersion(request),
      budget: body,
    });
    return financeJson(budget, 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
