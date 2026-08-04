import {
  investmentTradeCommitRequestSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import { commitInvestmentTrade } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      investmentTradeCommitRequestSchema,
      await request.json(),
    );
    const common = {
      userId: runtime.userId,
      idempotencyKey,
      requestId: runtime.requestId,
      ...(body.previewHash ? { previewHash: body.previewHash } : {}),
    };
    const result =
      body.command.type === "investment_buy"
        ? await commitInvestmentTrade(runtime.sql, {
            ...common,
            command: body.command,
          })
        : await commitInvestmentTrade(runtime.sql, {
            ...common,
            command: body.command,
          });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
