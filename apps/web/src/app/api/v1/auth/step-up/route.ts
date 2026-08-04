import { sensitiveStepUpSchema } from "@personal-finance-os/contracts";
import {
  establishSensitiveActionProof,
  financeJson,
  financeProblem,
  parseFinanceInput,
} from "../../../../../server/finance/runtime";

export async function POST(request: Request) {
  try {
    const body = parseFinanceInput(sensitiveStepUpSchema, await request.json());
    const result = await establishSensitiveActionProof(request, body.code);
    return financeJson(
      { verifiedAt: result.verifiedAt, expiresAt: result.expiresAt },
      200,
      result.runtime.requestId,
    );
  } catch (error) {
    return financeProblem(error, request);
  }
}
