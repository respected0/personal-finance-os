import { Money } from "../money/money.js";
import { assertGoalAllocationWithinEligible } from "./invariants.js";
import type { PostingPlan } from "./posting-engine.js";

export interface ReceivablePolicyInput {
  readonly nominalAmount: string;
  readonly estimatedCollectibleAmount: string;
  readonly currency: string;
  readonly includeInNetWorth: boolean;
  readonly includeInPlanning: boolean;
}

export interface ReceivablePolicyResult {
  readonly trackedNominalAmount: string;
  readonly netWorthAmount: string;
  readonly planningAmount: string;
}

export function evaluateReceivablePolicy(
  input: ReceivablePolicyInput,
): ReceivablePolicyResult {
  const nominal = Money.positive(input.nominalAmount, input.currency);
  const estimated = Money.from(
    input.estimatedCollectibleAmount,
    input.currency,
  );
  if (
    estimated.compare(Money.zero(input.currency)) < 0 ||
    estimated.compare(nominal) > 0
  ) {
    throw new Error("Estimated collectible amount exceeds nominal amount.");
  }
  return {
    trackedNominalAmount: nominal.toCanonical(),
    netWorthAmount: input.includeInNetWorth
      ? estimated.toCanonical()
      : Money.zero(input.currency).toCanonical(),
    planningAmount: input.includeInPlanning
      ? estimated.toCanonical()
      : Money.zero(input.currency).toCanonical(),
  };
}

export function evaluateGoalAllocation(
  allocated: string,
  eligible: string,
  currency: string,
): { readonly allocated: string; readonly ledgerPostingCount: 0 } {
  assertGoalAllocationWithinEligible(allocated, eligible, currency);
  return {
    allocated: Money.from(allocated, currency).toCanonical(),
    ledgerPostingCount: 0,
  };
}

export function aggregateFinancialEffects(plans: readonly PostingPlan[]): {
  readonly personalExpense: string;
  readonly normalIncome: string;
  readonly netWorthDelta: string;
} {
  let personalExpense = Money.zero("TRY");
  let normalIncome = Money.zero("TRY");
  let netWorthDelta = Money.zero("TRY");
  for (const plan of plans) {
    personalExpense = personalExpense.add(
      Money.from(plan.effects.personalExpenseDelta, "TRY"),
    );
    normalIncome = normalIncome.add(
      Money.from(plan.effects.normalIncomeDelta, "TRY"),
    );
    netWorthDelta = netWorthDelta.add(
      Money.from(plan.effects.netWorthDelta, "TRY"),
    );
  }
  return {
    personalExpense: personalExpense.toCanonical(),
    normalIncome: normalIncome.toCanonical(),
    netWorthDelta: netWorthDelta.toCanonical(),
  };
}

export function traceRecommendationRule(
  code: string,
  version: number,
): { readonly code: string; readonly version: number } {
  if (
    !(
      /^[a-z][a-z0-9_]{2,63}$/u.test(code) ||
      /^R-(?:0[1-9]|1[0-5])$/u.test(code)
    ) ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new Error(
      "Recommendation rule code and positive integer version are required.",
    );
  }
  return { code, version };
}
