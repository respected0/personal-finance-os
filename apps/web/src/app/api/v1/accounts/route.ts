import { financialAccountCreateSchema } from "@personal-finance-os/contracts";
import {
  createFinancialAccount,
  listFinancialAccounts,
} from "@personal-finance-os/db";
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
      await listFinancialAccounts(
        runtime.sql,
        runtime.accountNameKeyring,
        runtime.userId,
      ),
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
    const body = parseFinanceInput(
      financialAccountCreateSchema,
      await request.json(),
    );
    const account = await createFinancialAccount(
      runtime.sql,
      runtime.accountNameKeyring,
      {
        userId: runtime.userId,
        ...(body.institutionId ? { institutionId: body.institutionId } : {}),
        name: body.name,
        accountType: body.accountType,
        currency: body.currency,
        openingDate: body.openingDate,
        requestId: runtime.requestId,
      },
    );
    return financeJson(account, 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
