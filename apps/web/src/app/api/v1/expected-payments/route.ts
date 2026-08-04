import { expectedPaymentCreateSchema } from "@personal-finance-os/contracts";
import {
  createExpectedPayment,
  listExpectedPayments,
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
      await listExpectedPayments(
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
      expectedPaymentCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createExpectedPayment(runtime.sql, runtime.accountNameKeyring, {
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
