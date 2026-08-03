import {
  subscriptionCashbackRequestSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { hashCanonicalValue } from "@personal-finance-os/domain";
import {
  commitLedgerTransaction,
  getSubscriptionCycleContext,
  SubscriptionCycleStateError,
} from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ cycleId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { cycleId: rawCycleId } = await context.params;
    const cycleId = parseFinanceInput(uuidSchema, rawCycleId);
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      subscriptionCashbackRequestSchema,
      await request.json(),
    );
    const cycle = await getSubscriptionCycleContext(
      runtime.sql,
      runtime.userId,
      cycleId,
    );
    if (!cycle.chargeTransactionId) throw new SubscriptionCycleStateError();
    const result = await commitLedgerTransaction(runtime.sql, {
      userId: runtime.userId,
      idempotencyKey,
      requestId: runtime.requestId,
      requestHash: hashCanonicalValue({ cycleId, ...body }),
      subscriptionCycleId: cycleId,
      command: {
        type: "cashback_refund",
        amount: body.amount,
        currency: body.currency,
        occurredAt: body.occurredAt,
        economicDate: body.economicDate,
        targetAccountId: body.targetAccountId,
        targetKind: body.targetKind,
        relatedTransactionId: cycle.chargeTransactionId,
        relatedExpenseRemaining: cycle.actualNet,
        subscriptionId: cycle.subscriptionId,
      },
    });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
