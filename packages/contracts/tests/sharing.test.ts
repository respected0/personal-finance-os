import { describe, expect, test } from "vitest";
import {
  receivableSettlementRequestSchema,
  sharedExpenseCreateSchema,
} from "../src/sharing.ts";

const id = (suffix: string) =>
  `01980f42-0000-7000-8000-${suffix.padStart(12, "0")}`;

describe("B044-B048 sharing contracts", () => {
  test("defaults explicit rounding and only accepts canonical money strings", () => {
    const parsed = sharedExpenseCreateSchema.parse({
      totalAmount: "100.00",
      ownerShare: "33.34",
      shares: [{ personId: id("1"), amount: "66.66" }],
      paymentAccountId: id("2"),
      paymentSourceKind: "bank",
      currency: "TRY",
      occurredAt: "2026-08-03T12:00:00+03:00",
      economicDate: "2026-08-03",
    });
    expect(parsed.roundingAmount).toBe("0.00");
    expect(() =>
      sharedExpenseCreateSchema.parse({ ...parsed, totalAmount: 100 }),
    ).toThrow();
  });

  test("rejects number-valued settlement money before it reaches the ledger", () => {
    expect(() =>
      receivableSettlementRequestSchema.parse({
        amount: 10,
        currency: "TRY",
        occurredAt: "2026-08-03T12:00:00+03:00",
        economicDate: "2026-08-03",
        targetAccountId: id("3"),
        targetKind: "bank",
      }),
    ).toThrow();
  });
});
