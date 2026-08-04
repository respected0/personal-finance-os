import {
  balanceSnapshotCreateSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { createBalanceSnapshot } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { accountId: rawAccountId } = await context.params;
    const accountId = parseFinanceInput(uuidSchema, rawAccountId);
    const body = parseFinanceInput(
      balanceSnapshotCreateSchema,
      await request.json(),
    );
    const snapshot = await createBalanceSnapshot(runtime.sql, {
      userId: runtime.userId,
      accountId,
      requestId: runtime.requestId,
      ...body,
    });
    return financeJson(snapshot, 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
