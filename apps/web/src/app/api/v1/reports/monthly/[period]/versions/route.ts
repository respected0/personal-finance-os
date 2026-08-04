import {
  monthlyPeriodSchema,
  monthlyReportVersionCreateSchema,
} from "@personal-finance-os/contracts";
import { createMonthlyReportVersion } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { period: rawPeriod } = await context.params;
    const period = parseFinanceInput(monthlyPeriodSchema, rawPeriod);
    const body = parseFinanceInput(
      monthlyReportVersionCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createMonthlyReportVersion(
        runtime.sql,
        runtime.accountNameKeyring,
        { userId: runtime.userId, period, reason: body.reason },
      ),
      201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
