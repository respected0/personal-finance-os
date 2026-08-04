import { describe, expect, test } from "vitest";
import { calculateCanonicalInvestableAmount } from "../src/planning/investable.js";

describe("B070 canonical investable amount", () => {
  test("subtracts only binding inputs and excludes expected/doubtful values", () => {
    expect(
      calculateCanonicalInvestableAmount({
        liquidVerifiedAmount: "20000.0000",
        committedOutflowAmount: "3000.0000",
        operatingBufferAmount: "2000.0000",
        nearTermGoalReserveAmount: "1000.0000",
        excludedExpectedAmount: "5000.0000",
        excludedDoubtfulReceivableAmount: "10000.0000",
        currency: "TRY",
      }),
    ).toMatchObject({
      canonicalInvestableAmount: "14000.00",
      expectedIncludedAmount: "0.00",
      doubtfulReceivableIncludedAmount: "0.00",
      formulaVersion: "investable-formula-1.0.0",
      policyVersion: "planning-policy-1.0.0",
    });
  });

  test("floors a negative result at exact zero without floating point", () => {
    expect(
      calculateCanonicalInvestableAmount({
        liquidVerifiedAmount: "0.1000",
        committedOutflowAmount: "0.1001",
        operatingBufferAmount: "0.0000",
        nearTermGoalReserveAmount: "0.0000",
        excludedExpectedAmount: "999999999999.9999",
        excludedDoubtfulReceivableAmount: "999999999999.9999",
        currency: "TRY",
      }).canonicalInvestableAmount,
    ).toBe("0.00");
  });
});
