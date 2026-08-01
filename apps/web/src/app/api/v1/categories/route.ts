import {
  categoryCreateSchema,
  categoryTypeSchema,
} from "@personal-finance-os/contracts";
import { createCategory, listCategories } from "@personal-finance-os/db";
import {
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../server/finance/runtime";

export async function GET(request: Request) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal1");
    const value = new URL(request.url).searchParams.get("type");
    const categoryType = value
      ? parseFinanceInput(categoryTypeSchema, value)
      : undefined;
    return financeJson(
      await listCategories(runtime.sql, runtime.userId, categoryType),
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
    const body = parseFinanceInput(categoryCreateSchema, await request.json());
    const category = await createCategory(runtime.sql, {
      userId: runtime.userId,
      name: body.name,
      categoryType: body.categoryType,
      ...(body.sortOrder === undefined ? {} : { sortOrder: body.sortOrder }),
    });
    return financeJson(category, 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
