import { describe, expect, test } from "vitest";
import {
  budgetPutSchema,
  goalAllocationCreateSchema,
  goalCreateSchema,
  expectedPaymentCreateSchema,
  expectedPaymentRealizeSchema,
  investableRunCreateSchema,
} from "../src/planning.js";

const id = "01980f42-0000-7000-8000-000000000001";

describe("P0-B1 planning contracts", () => {
  test("accepts exact decimal budget and goal commands", () => {
    expect(
      budgetPutSchema.parse({
        status: "active",
        lines: [{ categoryId: id, plannedAmount: "1250.0000" }],
      }).lines[0]?.warningThreshold,
    ).toBe("0.8000");
    expect(
      goalCreateSchema.parse({
        title: "Sentetik acil durum rezervi",
        targetAmount: "15000.0000",
        targetDate: "2026-12-31",
        priority: 1,
        riskLevel: "low",
      }).targetAmount,
    ).toBe("15000.0000");
  });

  test("accepts expected-payment realization and canonical-run commands", () => {
    expect(
      expectedPaymentCreateSchema.parse({
        source: "Sentetik ödeme",
        expectedAmount: "5000.0000",
        expectedDate: "2026-08-10",
        certaintyLevel: "likely",
      }).expectedAmount,
    ).toBe("5000.0000");
    expect(
      expectedPaymentRealizeSchema.parse({
        targetAccountId: id,
        targetKind: "bank",
        currency: "TRY",
        occurredAt: "2026-08-10T09:00:00.000Z",
        economicDate: "2026-08-10",
      }).targetKind,
    ).toBe("bank");
    expect(
      investableRunCreateSchema.parse({
        asOf: "2026-08-10",
        operatingBufferAmount: "2000.0000",
      }).operatingBufferAmount,
    ).toBe("2000.0000");
  });

  test("rejects duplicate categories, float numbers, and owner injection", () => {
    expect(() =>
      budgetPutSchema.parse({
        lines: [
          { categoryId: id, plannedAmount: "10.0000" },
          { categoryId: id, plannedAmount: "20.0000" },
        ],
      }),
    ).toThrow();
    expect(() =>
      expectedPaymentCreateSchema.parse({
        userId: id,
        source: "Sızma",
        expectedAmount: 10.1,
        expectedDate: "2026-08-10",
        certaintyLevel: "certain",
      }),
    ).toThrow();
    expect(() =>
      goalAllocationCreateSchema.parse({
        accountId: id,
        allocatedValue: 10.1,
        effectiveFrom: "2026-08-01",
      }),
    ).toThrow();
    expect(() =>
      goalCreateSchema.parse({
        userId: id,
        title: "Sızma",
        targetAmount: "1.0000",
        targetDate: "2026-12-31",
        priority: 1,
        riskLevel: "low",
      }),
    ).toThrow();
  });
});
