import {
  openingBalanceRequestSchema,
  uuidSchema,
} from "@personal-finance-os/contracts";
import {
  commitLedgerTransaction,
  getFinancialAccount,
} from "@personal-finance-os/db";
import type { FinancialAccountKind } from "@personal-finance-os/domain";
import {
  FinanceApiError,
  financeJson,
  financeProblem,
  parseFinanceInput,
  requireFinanceRuntime,
} from "../../../../../../server/finance/runtime";

function openingKind(accountType: string): FinancialAccountKind {
  if (accountType === "bank" || accountType === "cash") return accountType;
  if (accountType === "credit_card") return "card";
  if (accountType === "wallet" || accountType === "investment") {
    return accountType;
  }
  throw new FinanceApiError(
    422,
    "validation_failed",
    "Opening balance is not available for this account type in P0-A1.",
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const runtime = await requireFinanceRuntime(request, "aal2");
    const { accountId: rawAccountId } = await context.params;
    const accountId = parseFinanceInput(uuidSchema, rawAccountId);
    const idempotencyKey = parseFinanceInput(
      uuidSchema,
      request.headers.get("idempotency-key"),
    );
    const body = parseFinanceInput(
      openingBalanceRequestSchema,
      await request.json(),
    );
    const account = await getFinancialAccount(
      runtime.sql,
      runtime.accountNameKeyring,
      runtime.userId,
      accountId,
    );
    if (!account || account.status !== "active") {
      throw new FinanceApiError(404, "not_found", "Not found.");
    }
    if (account.currency !== body.currency) {
      throw new FinanceApiError(
        422,
        "validation_failed",
        "Opening currency must match the account.",
      );
    }
    const result = await commitLedgerTransaction(runtime.sql, {
      userId: runtime.userId,
      idempotencyKey,
      requestId: runtime.requestId,
      command: {
        type: "opening_balance",
        amount: body.amount,
        currency: body.currency,
        occurredAt: `${body.date}T12:00:00+03:00`,
        economicDate: body.date,
        accountId,
        accountKind: openingKind(account.accountType),
      },
    });
    return financeJson(result, result.replayed ? 200 : 201, runtime.requestId);
  } catch (error) {
    return financeProblem(error, request);
  }
}
