import { describe, expect, test } from "vitest";
import {
  evaluateRecommendation,
  RECOMMENDATION_ALTERNATIVE_FORMULA,
  traceRecommendationRule,
} from "../src/index.ts";

describe("P0-B3 recommendation evaluation", () => {
  test("traces the binding R-01 through R-15 registry identifiers", () => {
    expect(traceRecommendationRule("R-01", 1)).toEqual({
      code: "R-01",
      version: 1,
    });
    expect(traceRecommendationRule("R-15", 2)).toEqual({
      code: "R-15",
      version: 2,
    });
    expect(() => traceRecommendationRule("R-16", 1)).toThrow();
  });

  test("consumes the canonical amount without reimplementing its formula", () => {
    expect(
      evaluateRecommendation({
        period: "2026-08-01",
        investableRunId: "01980f42-0000-7000-8000-000000000070",
        sourceWatermark: "2026-08-04T12:00:00.000Z",
        canonicalInvestableAmount: "1234.5678",
        usedThreshold: "1000.0000",
        scenarioReserveAmount: "250.1250",
      }),
    ).toEqual({
      observedAmount: "1234.5678",
      differenceAmount: "234.5678",
      impactAmount: "1234.5678",
      alternativeAmount: "984.4428",
      evidence: {
        period: "2026-08-01",
        threshold: "1000.00",
        observedAmount: "1234.5678",
        differenceAmount: "234.5678",
        alternativeAmount: "984.4428",
        investableRunId: "01980f42-0000-7000-8000-000000000070",
        formula: RECOMMENDATION_ALTERNATIVE_FORMULA,
        sourceWatermark: "2026-08-04T12:00:00.000Z",
      },
    });
  });

  test("floors only the alternative scenario at zero with exact decimals", () => {
    const result = evaluateRecommendation({
      period: "2026-08-01",
      investableRunId: "01980f42-0000-7000-8000-000000000070",
      sourceWatermark: "2026-08-04T12:00:00.000Z",
      canonicalInvestableAmount: "0.0001",
      usedThreshold: "0.0002",
      scenarioReserveAmount: "0.0002",
    });
    expect(result.differenceAmount).toBe("-0.0001");
    expect(result.alternativeAmount).toBe("0.00");
  });
});
