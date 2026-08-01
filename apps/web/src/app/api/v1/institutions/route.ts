import { institutionCreateSchema } from "@personal-finance-os/contracts";
import { createInstitution, listInstitutions } from "@personal-finance-os/db";
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
      await listInstitutions(runtime.sql, runtime.userId),
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
      institutionCreateSchema,
      await request.json(),
    );
    const institution = await createInstitution(runtime.sql, {
      userId: runtime.userId,
      name: body.name,
      institutionType: body.institutionType,
      requestId: runtime.requestId,
    });
    return financeJson(institution, 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
