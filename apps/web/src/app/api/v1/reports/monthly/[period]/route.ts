import {
  monthlyPeriodSchema,
  monthlyReportQuerySchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { getMonthlyReport } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const { period: rawPeriod } = await context.params;
    const period = parseFinanceInput(monthlyPeriodSchema, rawPeriod);
    const search = new URL(request.url).searchParams;
    const rawVersion = search.get("version");
    const query = parseFinanceInput(monthlyReportQuerySchema, {
      version:
        rawVersion === null || rawVersion === "latest"
          ? "latest"
          : Number(rawVersion),
      accountId: search.get("account")
        ? parseFinanceInput(uuidSchema, search.get("account"))
        : undefined,
      categoryId: search.get("category")
        ? parseFinanceInput(uuidSchema, search.get("category"))
        : undefined,
    });
    return financeJson(
      await getMonthlyReport(runtime.sql, {
        userId: runtime.userId,
        period,
        ...query,
      }),
      200,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
