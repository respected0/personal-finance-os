import { compareCanonicalDecimals, Money, MoneyError } from "../money/money.js";
import type { LedgerSide } from "./chart-of-accounts.js";

export interface BalanceablePosting {
  readonly side: LedgerSide;
  readonly amountBase: string;
}

export class LedgerInvariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LedgerInvariantError";
    this.code = code;
  }
}

export function assertPositiveAmount(amount: string, currency: string): Money {
  try {
    return Money.positive(amount, currency);
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new LedgerInvariantError(error.code, error.message);
    }
    throw error;
  }
}

export function assertAmountWithin(
  amount: string,
  available: string,
  currency: string,
  code: string,
): void {
  const requested = assertPositiveAmount(amount, currency);
  const limit = Money.from(available, currency);
  if (limit.compare(Money.zero(currency)) < 0 || requested.compare(limit) > 0) {
    throw new LedgerInvariantError(code, "Requested amount exceeds available.");
  }
}

export function assertGoalAllocationWithinEligible(
  allocated: string,
  eligible: string,
  currency: string,
): void {
  const value = Money.from(allocated, currency);
  const limit = Money.from(eligible, currency);
  if (value.compare(Money.zero(currency)) < 0 || value.compare(limit) > 0) {
    throw new LedgerInvariantError(
      "goal_allocation_exceeds_eligible",
      "Goal allocation exceeds eligible value.",
    );
  }
}

export function assertExpectedPaymentNotRealized(
  alreadyRealized: boolean,
): void {
  if (alreadyRealized) {
    throw new LedgerInvariantError(
      "already_realized",
      "Expected payment was already realized.",
    );
  }
}

export function assertQuantityWithin(
  requested: string,
  available: string,
): void {
  if (
    compareCanonicalDecimals(requested, "0.0") <= 0 ||
    compareCanonicalDecimals(requested, available) > 0
  ) {
    throw new LedgerInvariantError(
      "lot_quantity_exceeded",
      "Sell quantity exceeds available lot quantity.",
    );
  }
}

export function assertBalanced(postings: readonly BalanceablePosting[]): void {
  if (postings.length < 2) {
    throw new LedgerInvariantError(
      "minimum_postings",
      "A posted transaction requires at least two postings.",
    );
  }
  let debit = Money.zero("TRY");
  let credit = Money.zero("TRY");
  for (const posting of postings) {
    const amount = assertPositiveAmount(posting.amountBase, "TRY");
    if (posting.side === "debit") {
      debit = debit.add(amount);
    } else {
      credit = credit.add(amount);
    }
  }
  if (!debit.equals(credit)) {
    throw new LedgerInvariantError(
      "unbalanced_postings",
      `Debit ${debit.toCanonical()} must equal credit ${credit.toCanonical()}.`,
    );
  }
}
