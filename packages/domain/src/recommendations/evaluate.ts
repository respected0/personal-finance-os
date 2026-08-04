import { Money } from "../money/money.js";

export const RECOMMENDATION_ENGINE_VERSION = "recommendation-engine-1.0.0";
export const RECOMMENDATION_ALTERNATIVE_FORMULA =
  "max(0, canonical_investable_amount - scenario_reserve_amount)";

export interface RecommendationEvaluationInput {
  readonly period: string;
  readonly investableRunId: string;
  readonly sourceWatermark: string;
  readonly canonicalInvestableAmount: string;
  readonly usedThreshold: string;
  readonly scenarioReserveAmount: string;
}

export interface RecommendationEvaluation {
  readonly observedAmount: string;
  readonly differenceAmount: string;
  readonly impactAmount: string;
  readonly alternativeAmount: string;
  readonly evidence: {
    readonly period: string;
    readonly threshold: string;
    readonly observedAmount: string;
    readonly differenceAmount: string;
    readonly alternativeAmount: string;
    readonly investableRunId: string;
    readonly formula: typeof RECOMMENDATION_ALTERNATIVE_FORMULA;
    readonly sourceWatermark: string;
  };
}

export function evaluateRecommendation(
  input: RecommendationEvaluationInput,
): RecommendationEvaluation {
  const canonical = Money.from(input.canonicalInvestableAmount, "TRY");
  const threshold = Money.from(input.usedThreshold, "TRY");
  const scenarioReserve = Money.from(input.scenarioReserveAmount, "TRY");
  if (
    canonical.compare(Money.zero("TRY")) < 0 ||
    threshold.compare(Money.zero("TRY")) < 0 ||
    scenarioReserve.compare(Money.zero("TRY")) < 0
  ) {
    throw new Error("Recommendation inputs cannot be negative.");
  }
  const difference = canonical.subtract(threshold);
  const reduced = canonical.subtract(scenarioReserve);
  const alternative =
    reduced.compare(Money.zero("TRY")) < 0 ? Money.zero("TRY") : reduced;
  const observedAmount = canonical.toCanonical();
  const differenceAmount = difference.toCanonical();
  const alternativeAmount = alternative.toCanonical();
  return {
    observedAmount,
    differenceAmount,
    impactAmount: observedAmount,
    alternativeAmount,
    evidence: {
      period: input.period,
      threshold: threshold.toCanonical(),
      observedAmount,
      differenceAmount,
      alternativeAmount,
      investableRunId: input.investableRunId,
      formula: RECOMMENDATION_ALTERNATIVE_FORMULA,
      sourceWatermark: input.sourceWatermark,
    },
  };
}
