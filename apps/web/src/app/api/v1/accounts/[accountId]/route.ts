import {
  accountArchiveRequestSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import {
  archiveFinancialAccount,
  getFinancialAccount,
} from "@personal-finance-os/db";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../server/finance/runtime";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { accountId: rawAccountId } = await context.params;
    const accountId = parseFinanceInput(uuidSchema, rawAccountId);
    parseFinanceInput(accountArchiveRequestSchema, await request.json());
    const rowVersion = Number(request.headers.get("if-match"));
    if (!Number.isInteger(rowVersion) || rowVersion <= 0) {
      throw new FinanceApiError(
        422,
        "validation_failed",
        "If-Match must be a positive row version.",
      );
    }
    await archiveFinancialAccount(runtime.sql, {
      userId: runtime.userId,
      accountId,
      rowVersion,
      requestId: runtime.requestId,
    });
    const account = await getFinancialAccount(
      runtime.sql,
      runtime.accountNameKeyring,
      runtime.userId,
      accountId,
    );
    if (!account) throw new FinanceApiError(404, "not_found", "Not found.");
    return financeJson(account, 200, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
