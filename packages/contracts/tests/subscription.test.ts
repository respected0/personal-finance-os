import { describe, expect, test } from "vitest";
import {
  subscriptionCashbackRequestSchema,
  subscriptionChargeRequestSchema,
  subscriptionCreateSchema,
} from "../src/index.js";

const uuid = "018f6f4e-7f35-7e34-8000-000000000042";
const event = {
  amount: "1200.00",
  currency: "TRY",
  occurredAt: "2026-08-01T12:00:00+03:00",
  economicDate: "2026-08-01",
};

describe("P0-A2 subscription contracts", () => {
  test("accepts exact gross/cashback expectation fields", () => {
    expect(
      subscriptionCreateSchema.parse({
        name: "Sentetik Abonelik",
        billingDay: 12,
        paymentAccountId: uuid,
        expectedGross: "1200.00",
        cashbackRate: "0.10",
        cashbackCap: "120.00",
      }).cashbackRate,
    ).toBe("0.10");
  });

  test("keeps charge and cashback transport amounts as decimal strings", () => {
    expect(
      subscriptionChargeRequestSchema.parse({ ...event, categoryId: uuid })
        .amount,
    ).toBe("1200.00");
    expect(
      subscriptionCashbackRequestSchema.parse({
        ...event,
        amount: "120.00",
        targetAccountId: uuid,
        targetKind: "card",
      }).amount,
    ).toBe("120.00");
    expect(() =>
      subscriptionCashbackRequestSchema.parse({
        ...event,
        amount: 120,
        targetAccountId: uuid,
        targetKind: "card",
      }),
    ).toThrow();
  });
});
