import { subscriptionCreateSchema } from "@personal-finance-os/contracts";
import { createSubscription, listSubscriptions } from "@personal-finance-os/db";
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
      await listSubscriptions(runtime.sql, runtime.userId),
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
      subscriptionCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createSubscription(runtime.sql, {
        userId: runtime.userId,
        name: body.name,
        billingDay: body.billingDay,
        paymentAccountId: body.paymentAccountId,
        expectedGross: body.expectedGross,
        cashbackRate: body.cashbackRate,
        cashbackCap: body.cashbackCap,
        requestId: runtime.requestId,
      }),
      201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
