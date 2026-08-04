import { Money } from "../money/money.js";

export const INVESTABLE_FORMULA_VERSION = "investable-formula-1.0.0";
export const INVESTABLE_POLICY_VERSION = "planning-policy-1.0.0";

export interface InvestableInputs {
  readonly liquidVerifiedAmount: string;
  readonly committedOutflowAmount: string;
  readonly operatingBufferAmount: string;
  readonly nearTermGoalReserveAmount: string;
  readonly excludedExpectedAmount: string;
  readonly excludedDoubtfulReceivableAmount: string;
  readonly currency: string;
}

export interface InvestableResult extends InvestableInputs {
  readonly formulaVersion: typeof INVESTABLE_FORMULA_VERSION;
  readonly policyVersion: typeof INVESTABLE_POLICY_VERSION;
  readonly canonicalInvestableAmount: string;
  readonly expectedIncludedAmount: "0.00";
  readonly doubtfulReceivableIncludedAmount: "0.00";
}

export function calculateCanonicalInvestableAmount(
  input: InvestableInputs,
): InvestableResult {
  const zero = Money.zero(input.currency);
  const result = Money.from(input.liquidVerifiedAmount, input.currency)
    .subtract(Money.from(input.committedOutflowAmount, input.currency))
    .subtract(Money.from(input.operatingBufferAmount, input.currency))
    .subtract(Money.from(input.nearTermGoalReserveAmount, input.currency));
  return {
    ...input,
    formulaVersion: INVESTABLE_FORMULA_VERSION,
    policyVersion: INVESTABLE_POLICY_VERSION,
    canonicalInvestableAmount:
      result.compare(zero) < 0 ? zero.toCanonical() : result.toCanonical(),
    expectedIncludedAmount: "0.00",
    doubtfulReceivableIncludedAmount: "0.00",
  };
}
