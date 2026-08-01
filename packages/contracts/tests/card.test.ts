import { describe, expect, test } from "vitest";
import {
  cardPaymentRequestSchema,
  creditCardProfileCreateSchema,
} from "../src/card.js";

const id = (suffix: string) =>
  `01980f42-0000-7000-8000-${suffix.padStart(12, "0")}`;

describe("P0-A2 card contracts", () => {
  test("keeps credit limit and minimum payment inputs as exact strings", () => {
    expect(
      creditCardProfileCreateSchema.safeParse({
        accountId: id("1"),
        creditLimit: "50000.00",
        statementDay: 15,
        dueDay: 25,
        minimumPaymentRule: {
          type: "percentage",
          rate: "0.20",
          minimumAmount: "500.00",
        },
      }).success,
    ).toBe(true);
    expect(
      creditCardProfileCreateSchema.safeParse({
        accountId: id("1"),
        creditLimit: 50000,
        statementDay: 15,
        dueDay: 25,
        minimumPaymentRule: { type: "fixed", amount: "500.00" },
      }).success,
    ).toBe(false);
  });

  test("accepts exact partial statement allocations without owner input", () => {
    expect(
      cardPaymentRequestSchema.safeParse({
        amount: "500.00",
        currency: "TRY",
        occurredAt: "2026-08-01T12:00:00+03:00",
        economicDate: "2026-08-01",
        bankAccountId: id("2"),
        statementAllocations: [{ statementId: id("3"), amount: "300.00" }],
      }).success,
    ).toBe(true);
  });
});
