import { creditCardProfileCreateSchema } from "@personal-finance-os/contracts";
import {
  createCreditCardProfile,
  listCreditCardProfiles,
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
      await listCreditCardProfiles(runtime.sql, runtime.userId),
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
      creditCardProfileCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createCreditCardProfile(runtime.sql, {
        userId: runtime.userId,
        accountId: body.accountId,
        creditLimit: body.creditLimit,
        statementDay: body.statementDay,
        dueDay: body.dueDay,
        minimumPaymentRule: body.minimumPaymentRule,
        requestId: runtime.requestId,
      }),
      201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
