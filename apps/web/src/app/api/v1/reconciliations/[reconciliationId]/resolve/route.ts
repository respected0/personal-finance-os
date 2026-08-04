import {
  reconciliationResolutionSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { resolveReconciliationItem } from "@personal-finance-os/db";
import type { NonRevisionTransactionCommand } from "@personal-finance-os/domain";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ reconciliationId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { reconciliationId: rawReconciliationId } = await context.params;
    const sessionId = parseFinanceInput(uuidSchema, rawReconciliationId);
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      reconciliationResolutionSchema,
      await request.json(),
    );
    const result = await resolveReconciliationItem(
      runtime.sql,
      runtime.accountNameKeyring,
      {
        userId: runtime.userId,
        sessionId,
        idempotencyKey,
        requestId: runtime.requestId,
        itemId: body.itemId,
        resolutionType: body.resolutionType,
        reason: body.reason,
        ...("fxRate" in body && body.fxRate ? { fxRate: body.fxRate } : {}),
        ...("command" in body
          ? { command: body.command as NonRevisionTransactionCommand }
          : {}),
      },
    );
    return financeJson(
      result,
      result.transaction?.replayed ? 200 : 201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
