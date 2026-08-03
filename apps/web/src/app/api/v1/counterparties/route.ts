import {
  counterpartyCreateSchema,
  counterpartyTypeSchema,
} from "@personal-finance-os/contracts";
import {
  createCounterparty,
  listCounterparties,
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
    const typeValue = new URL(request.url).searchParams.get("type");
    const type =
      typeValue === null
        ? undefined
        : parseFinanceInput(counterpartyTypeSchema, typeValue);
    return financeJson(
      await listCounterparties(
        runtime.sql,
        runtime.accountNameKeyring,
        runtime.userId,
        type,
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
      counterpartyCreateSchema,
      await request.json(),
    );
    return financeJson(
      await createCounterparty(runtime.sql, runtime.accountNameKeyring, {
        userId: runtime.userId,
        type: body.type,
        name: body.name,
        requestId: runtime.requestId,
      }),
      201,
      runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
