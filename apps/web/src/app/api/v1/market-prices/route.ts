import { marketPriceCreateSchema } from "@personal-finance-os/contracts";
import {
  createMarketPrice,
  listLatestMarketPrices,
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
      await listLatestMarketPrices(runtime.sql, runtime.userId),
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
      marketPriceCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createMarketPrice(runtime.sql, { userId: runtime.userId, ...body }),
      201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
