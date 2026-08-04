import { monthlyReviewCreateSchema } from "@personal-finance-os/contracts";
import { createMonthlyReview } from "@personal-finance-os/db";
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
      monthlyReviewCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createMonthlyReview(runtime.sql, {
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
