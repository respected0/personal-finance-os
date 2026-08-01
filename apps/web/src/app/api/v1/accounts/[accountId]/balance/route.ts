import { isoDateSchema, uuidSchema } from "@personal-finance-os/contracts";
import { getFinancialAccount } from "@personal-finance-os/db";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const { accountId: rawAccountId } = await context.params;
    const accountId = parseFinanceInput(uuidSchema, rawAccountId);
    const rawAsOf = new URL(request.url).searchParams.get("as_of");
    const asOf = rawAsOf
      ? parseFinanceInput(isoDateSchema, rawAsOf)
      : undefined;
    const account = await getFinancialAccount(
      runtime.sql,
      runtime.accountNameKeyring,
      runtime.userId,
      accountId,
      asOf,
    );
    if (!account) throw new FinanceApiError(404, "not_found", "Not found.");
    return financeJson(account.balance, 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
