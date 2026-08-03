import { Money, multiplyCanonicalDecimals } from "../money/money.js";
import type { LedgerAccountRole, LedgerSide } from "./chart-of-accounts.js";
import type {
  FinancialAccountKind,
  NonRevisionTransactionCommand,
  OriginalPosting,
  TransactionCommand,
} from "./commands.js";
import {
  assertAmountWithin,
  assertBalanced,
  assertExpectedPaymentNotRealized,
  assertPositiveAmount,
  assertQuantityWithin,
  LedgerInvariantError,
} from "./invariants.js";

export const LEDGER_ENGINE_VERSION = "ledger-1.0.0";
export const LEDGER_INPUT_SCHEMA_VERSION = 1;
export const REPORTING_CURRENCY = "TRY";

export interface PlannedPosting {
  readonly sequence: number;
  readonly ledgerRole: LedgerAccountRole;
  readonly financialAccountId?: string;
  readonly side: LedgerSide;
  readonly amountOriginal: string;
  readonly currency: string;
  readonly fxRate: string;
  readonly amountBase: string;
}

export interface TransactionLinkPlan {
  readonly relatedTransactionId: string;
  readonly linkType:
    | "refund_of"
    | "cashback_for"
    | "repayment_of"
    | "reverses"
    | "fee_for"
    | "realizes";
  readonly allocatedAmount?: string;
}

export interface FinancialEffects {
  readonly personalExpenseDelta: string;
  readonly normalIncomeDelta: string;
  readonly netWorthDelta: string;
}

export interface PostingPlan {
  readonly commandType: TransactionCommand["type"];
  readonly primaryAmount: string;
  readonly currency: string;
  readonly postings: readonly PlannedPosting[];
  readonly links: readonly TransactionLinkPlan[];
  readonly effects: FinancialEffects;
  readonly engineVersion: typeof LEDGER_ENGINE_VERSION;
  readonly inputSchemaVersion: typeof LEDGER_INPUT_SCHEMA_VERSION;
}

interface MutablePlan {
  postings: PlannedPosting[];
  links: TransactionLinkPlan[];
}

function roleForAccountKind(kind: FinancialAccountKind): LedgerAccountRole {
  switch (kind) {
    case "bank":
      return "bank_asset";
    case "cash":
      return "cash_asset";
    case "wallet":
      return "bank_asset";
    case "investment":
      return "investment_asset";
    case "card":
      return "card_liability";
  }
}

function canonicalFxRate(currency: string, fxRate?: string): string {
  if (currency === REPORTING_CURRENCY) {
    if (fxRate !== undefined && !/^1(?:\.0{1,12})?$/u.test(fxRate)) {
      throw new LedgerInvariantError(
        "invalid_try_fx_rate",
        "TRY commands must use an FX rate of one.",
      );
    }
    return "1.000000000000";
  }
  if (!fxRate) {
    throw new LedgerInvariantError(
      "fx_rate_required",
      "Non-TRY commands require an explicit FX rate.",
    );
  }
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/u.test(fxRate) ||
    /^0(?:\.0+)?$/u.test(fxRate)
  ) {
    throw new LedgerInvariantError(
      "invalid_fx_rate",
      "FX rate must be a positive canonical decimal string.",
    );
  }
  const [integer, fraction] = fxRate.includes(".")
    ? (fxRate.split(".") as [string, string])
    : [fxRate, ""];
  return `${integer}.${fraction.padEnd(12, "0")}`;
}

function toBase(amount: Money, fxRate: string): Money {
  return Money.from(amount.multiply(fxRate).toCanonical(), REPORTING_CURRENCY);
}

function pushPosting(
  plan: MutablePlan,
  details: {
    ledgerRole: LedgerAccountRole;
    financialAccountId?: string;
    side: LedgerSide;
    amount: Money;
    fxRate: string;
  },
): void {
  plan.postings.push({
    sequence: plan.postings.length + 1,
    ledgerRole: details.ledgerRole,
    ...(details.financialAccountId
      ? { financialAccountId: details.financialAccountId }
      : {}),
    side: details.side,
    amountOriginal: details.amount.toCanonical(),
    currency: details.amount.currency,
    fxRate: details.fxRate,
    amountBase: toBase(details.amount, details.fxRate).toCanonical(),
  });
}

function zeroEffects(): FinancialEffects {
  return {
    personalExpenseDelta: "0.00",
    normalIncomeDelta: "0.00",
    netWorthDelta: "0.00",
  };
}

function effectsFromPostings(
  postings: readonly PlannedPosting[],
): FinancialEffects {
  let expense = Money.zero(REPORTING_CURRENCY);
  let income = Money.zero(REPORTING_CURRENCY);
  for (const posting of postings) {
    const amount = Money.from(posting.amountBase, REPORTING_CURRENCY);
    if (
      posting.ledgerRole === "expense" ||
      posting.ledgerRole === "fee_expense"
    ) {
      expense =
        posting.side === "debit"
          ? expense.add(amount)
          : expense.subtract(amount);
    }
    if (posting.ledgerRole === "income") {
      income =
        posting.side === "credit"
          ? income.add(amount)
          : income.subtract(amount);
    }
  }
  return {
    personalExpenseDelta: expense.toCanonical(),
    normalIncomeDelta: income.toCanonical(),
    netWorthDelta: income.subtract(expense).toCanonical(),
  };
}

function reversePostings(
  originals: readonly OriginalPosting[],
): PlannedPosting[] {
  const reversed = originals.map((posting, index) => ({
    sequence: index + 1,
    ledgerRole: posting.ledgerRole,
    ...(posting.financialAccountId
      ? { financialAccountId: posting.financialAccountId }
      : {}),
    side: posting.side === "debit" ? ("credit" as const) : ("debit" as const),
    amountOriginal: posting.amount,
    currency: posting.currency,
    fxRate: posting.fxRate,
    amountBase: posting.amountBase,
  }));
  assertBalanced(reversed);
  return reversed;
}

function buildNonRevisionPlan(
  command: NonRevisionTransactionCommand,
): PostingPlan {
  const plan: MutablePlan = { postings: [], links: [] };
  const fxRate = canonicalFxRate(command.currency, command.fxRate);
  let primaryAmount: Money;
  let effects = zeroEffects();

  switch (command.type) {
    case "expense": {
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      const hasInstallmentFields =
        command.installmentCount !== undefined ||
        command.firstInstallmentDate !== undefined;
      if (
        hasInstallmentFields &&
        (command.sourceKind !== "card" ||
          !Number.isSafeInteger(command.installmentCount) ||
          (command.installmentCount ?? 0) < 2 ||
          (command.installmentCount ?? 0) > 60 ||
          !/^\d{4}-\d{2}-\d{2}$/u.test(command.firstInstallmentDate ?? ""))
      ) {
        throw new LedgerInvariantError(
          "invalid_installment_plan",
          "Card installments require a count from 2 to 60 and a first due date.",
        );
      }
      pushPosting(plan, {
        ledgerRole: "expense",
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.sourceKind),
        financialAccountId: command.sourceAccountId,
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      effects = effectsFromPostings(plan.postings);
      break;
    }
    case "income": {
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.targetKind),
        financialAccountId: command.targetAccountId,
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "income",
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      effects = effectsFromPostings(plan.postings);
      break;
    }
    case "transfer": {
      if (command.sourceAccountId === command.targetAccountId) {
        throw new LedgerInvariantError(
          "same_transfer_account",
          "Transfer source and target must differ.",
        );
      }
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.targetKind),
        financialAccountId: command.targetAccountId,
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.sourceKind),
        financialAccountId: command.sourceAccountId,
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      if (command.feeAmount) {
        const fee = assertPositiveAmount(command.feeAmount, command.currency);
        pushPosting(plan, {
          ledgerRole: "fee_expense",
          side: "debit",
          amount: fee,
          fxRate,
        });
        pushPosting(plan, {
          ledgerRole: roleForAccountKind(command.sourceKind),
          financialAccountId: command.sourceAccountId,
          side: "credit",
          amount: fee,
          fxRate,
        });
      }
      effects = effectsFromPostings(plan.postings);
      break;
    }
    case "card_payment": {
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      let allocated = Money.zero(command.currency);
      const statementIds = new Set<string>();
      for (const allocation of command.statementAllocations ?? []) {
        if (statementIds.has(allocation.statementId)) {
          throw new LedgerInvariantError(
            "duplicate_statement_allocation",
            "A card statement can be allocated only once per payment.",
          );
        }
        statementIds.add(allocation.statementId);
        allocated = allocated.add(
          assertPositiveAmount(allocation.amount, command.currency),
        );
      }
      if (allocated.compare(primaryAmount) > 0) {
        throw new LedgerInvariantError(
          "statement_allocation_exceeded",
          "Statement allocations cannot exceed the card payment.",
        );
      }
      pushPosting(plan, {
        ledgerRole: "card_liability",
        financialAccountId: command.cardAccountId,
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "bank_asset",
        financialAccountId: command.bankAccountId,
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      break;
    }
    case "cashback_refund": {
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      assertAmountWithin(
        command.amount,
        command.relatedExpenseRemaining,
        command.currency,
        "refund_allocation_exceeded",
      );
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.targetKind),
        financialAccountId: command.targetAccountId,
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "expense",
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      plan.links.push({
        relatedTransactionId: command.relatedTransactionId,
        linkType: command.subscriptionId ? "cashback_for" : "refund_of",
        allocatedAmount: primaryAmount.toCanonical(),
      });
      effects = effectsFromPostings(plan.postings);
      break;
    }
    case "shared_expense": {
      primaryAmount = assertPositiveAmount(
        command.totalAmount,
        command.currency,
      );
      const ownerShare = Money.from(command.ownerShare, command.currency);
      if (ownerShare.compare(Money.zero(command.currency)) < 0) {
        throw new LedgerInvariantError(
          "negative_owner_share",
          "Owner share cannot be negative.",
        );
      }
      const rounding = Money.from(
        command.roundingAmount ?? "0.00",
        command.currency,
      );
      const ownerCost = ownerShare.add(rounding);
      if (ownerCost.compare(Money.zero(command.currency)) < 0) {
        throw new LedgerInvariantError(
          "negative_owner_cost",
          "Owner share plus rounding cannot be negative.",
        );
      }
      let allocated = ownerCost;
      if (ownerCost.isPositive()) {
        pushPosting(plan, {
          ledgerRole: "expense",
          side: "debit",
          amount: ownerCost,
          fxRate,
        });
      }
      for (const share of command.shares) {
        const shareAmount = assertPositiveAmount(
          share.amount,
          command.currency,
        );
        allocated = allocated.add(shareAmount);
        pushPosting(plan, {
          ledgerRole: "receivable_asset",
          side: "debit",
          amount: shareAmount,
          fxRate,
        });
      }
      if (!allocated.equals(primaryAmount)) {
        throw new LedgerInvariantError(
          "shared_expense_sum_mismatch",
          "Owner share, explicit rounding and participant shares must equal total paid.",
        );
      }
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.paymentSourceKind),
        financialAccountId: command.paymentAccountId,
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      effects = effectsFromPostings(plan.postings);
      break;
    }
    case "receivable_settlement": {
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      assertAmountWithin(
        command.amount,
        command.outstandingAmount,
        command.currency,
        "receivable_settlement_exceeded",
      );
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.targetKind),
        financialAccountId: command.targetAccountId,
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "receivable_asset",
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      break;
    }
    case "expected_realization": {
      assertExpectedPaymentNotRealized(command.alreadyRealized);
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.targetKind),
        financialAccountId: command.targetAccountId,
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "income",
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      effects = effectsFromPostings(plan.postings);
      break;
    }
    case "investment_buy": {
      const gross = multiplyCanonicalDecimals(
        command.quantity,
        command.unitPrice,
        command.currency,
      );
      const fee = Money.from(command.feeAmount, command.currency);
      if (fee.compare(Money.zero(command.currency)) < 0) {
        throw new LedgerInvariantError(
          "negative_fee",
          "Investment fee cannot be negative.",
        );
      }
      primaryAmount = gross.add(fee);
      if (!primaryAmount.isPositive()) {
        throw new LedgerInvariantError(
          "amount_must_be_positive",
          "Investment cost must be positive.",
        );
      }
      pushPosting(plan, {
        ledgerRole: "investment_asset",
        side: "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "bank_asset",
        financialAccountId: command.cashAccountId,
        side: "credit",
        amount: primaryAmount,
        fxRate,
      });
      break;
    }
    case "investment_sell": {
      assertQuantityWithin(command.quantity, command.availableQuantity);
      const gross = multiplyCanonicalDecimals(
        command.quantity,
        command.unitPrice,
        command.currency,
      );
      const fee = Money.from(command.feeAmount, command.currency);
      const proceeds = gross.subtract(fee);
      const costBasis = assertPositiveAmount(
        command.costBasis,
        command.currency,
      );
      if (!proceeds.isPositive()) {
        throw new LedgerInvariantError(
          "non_positive_proceeds",
          "Investment sale proceeds must be positive after fee.",
        );
      }
      primaryAmount = proceeds;
      pushPosting(plan, {
        ledgerRole: "bank_asset",
        financialAccountId: command.cashAccountId,
        side: "debit",
        amount: proceeds,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "investment_asset",
        side: "credit",
        amount: costBasis,
        fxRate,
      });
      const difference = proceeds.subtract(costBasis);
      if (difference.compare(Money.zero(command.currency)) > 0) {
        pushPosting(plan, {
          ledgerRole: "realized_gain",
          side: "credit",
          amount: difference,
          fxRate,
        });
      } else if (difference.compare(Money.zero(command.currency)) < 0) {
        pushPosting(plan, {
          ledgerRole: "realized_loss",
          side: "debit",
          amount: difference.absolute(),
          fxRate,
        });
      }
      break;
    }
    case "opening_balance": {
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      const isLiability = command.accountKind === "card";
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.accountKind),
        financialAccountId: command.accountId,
        side: isLiability ? "credit" : "debit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "opening_equity",
        side: isLiability ? "debit" : "credit",
        amount: primaryAmount,
        fxRate,
      });
      break;
    }
    case "balance_adjustment": {
      if (command.reason.trim().length === 0) {
        throw new LedgerInvariantError(
          "adjustment_reason_required",
          "Balance adjustment requires a reason.",
        );
      }
      primaryAmount = assertPositiveAmount(command.amount, command.currency);
      const isLiability = command.accountKind === "card";
      const accountDebit =
        (command.direction === "increase" && !isLiability) ||
        (command.direction === "decrease" && isLiability);
      pushPosting(plan, {
        ledgerRole: roleForAccountKind(command.accountKind),
        financialAccountId: command.accountId,
        side: accountDebit ? "debit" : "credit",
        amount: primaryAmount,
        fxRate,
      });
      pushPosting(plan, {
        ledgerRole: "adjustment_equity",
        side: accountDebit ? "credit" : "debit",
        amount: primaryAmount,
        fxRate,
      });
      break;
    }
  }

  assertBalanced(plan.postings);
  return {
    commandType: command.type,
    primaryAmount: primaryAmount.toCanonical(),
    currency: command.currency,
    postings: plan.postings,
    links: plan.links,
    effects,
    engineVersion: LEDGER_ENGINE_VERSION,
    inputSchemaVersion: LEDGER_INPUT_SCHEMA_VERSION,
  };
}

export function buildPostingPlan(command: TransactionCommand): PostingPlan {
  if (command.type !== "void" && command.type !== "revise") {
    return buildNonRevisionPlan(command);
  }

  const reversed = reversePostings(command.originalPostings);
  if (command.type === "void") {
    const primaryAmount = reversed[0]!.amountOriginal;
    return {
      commandType: command.type,
      primaryAmount,
      currency: command.currency,
      postings: reversed,
      links: [
        {
          relatedTransactionId: command.originalTransactionId,
          linkType: "reverses",
        },
      ],
      effects: effectsFromPostings(reversed),
      engineVersion: LEDGER_ENGINE_VERSION,
      inputSchemaVersion: LEDGER_INPUT_SCHEMA_VERSION,
    };
  }

  const replacement = buildNonRevisionPlan(command.replacement);
  const replacementSequence = replacement.postings.map((posting, index) => ({
    ...posting,
    sequence: reversed.length + index + 1,
  }));
  const postings = [...reversed, ...replacementSequence];
  assertBalanced(postings);
  const reverseEffects = effectsFromPostings(reversed);
  return {
    commandType: command.type,
    primaryAmount: replacement.primaryAmount,
    currency: command.currency,
    postings,
    links: [
      {
        relatedTransactionId: command.originalTransactionId,
        linkType: "reverses",
      },
      ...replacement.links,
    ],
    effects: {
      personalExpenseDelta: Money.from(
        reverseEffects.personalExpenseDelta,
        REPORTING_CURRENCY,
      )
        .add(
          Money.from(
            replacement.effects.personalExpenseDelta,
            REPORTING_CURRENCY,
          ),
        )
        .toCanonical(),
      normalIncomeDelta: Money.from(
        reverseEffects.normalIncomeDelta,
        REPORTING_CURRENCY,
      )
        .add(
          Money.from(replacement.effects.normalIncomeDelta, REPORTING_CURRENCY),
        )
        .toCanonical(),
      netWorthDelta: Money.from(
        reverseEffects.netWorthDelta,
        REPORTING_CURRENCY,
      )
        .add(Money.from(replacement.effects.netWorthDelta, REPORTING_CURRENCY))
        .toCanonical(),
    },
    engineVersion: LEDGER_ENGINE_VERSION,
    inputSchemaVersion: LEDGER_INPUT_SCHEMA_VERSION,
  };
}
