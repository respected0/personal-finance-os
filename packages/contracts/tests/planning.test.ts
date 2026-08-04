import { describe, expect, test } from "vitest";
import {
  budgetPutSchema,
  goalAllocationCreateSchema,
  goalCreateSchema,
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
