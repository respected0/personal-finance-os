import { describe, expect, it } from "vitest";
import {
  financialAccountCreateSchema,
  institutionCreateSchema,
  openingBalanceRequestSchema,
  transactionHistoryQuerySchema,
} from "../src/daily-core.js";

describe("P0-A1 daily core contracts", () => {
  it("accepts an owned account request without server-owned fields", () => {
    expect(
      financialAccountCreateSchema.parse({
        name: "Günlük hesap",
        accountType: "bank",
        currency: "TRY",
        openingDate: "2026-08-01",
      }),
    ).toEqual({
      name: "Günlük hesap",
      accountType: "bank",
      currency: "TRY",
      openingDate: "2026-08-01",
    });
    expect(
      financialAccountCreateSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        ledgerAccountId: "22222222-2222-4222-8222-222222222222",
        name: "Injected",
        accountType: "bank",
        currency: "TRY",
        openingDate: "2026-08-01",
      }).success,
    ).toBe(false);
  });

  it("keeps opening balance separate and exact", () => {
    expect(
      openingBalanceRequestSchema.safeParse({
        amount: "427.50",
        currency: "TRY",
        date: "2026-08-01",
      }).success,
    ).toBe(true);
    expect(
      openingBalanceRequestSchema.safeParse({
        amount: 427.5,
        currency: "TRY",
        date: "2026-08-01",
      }).success,
    ).toBe(false);
  });

  it("validates institution and bounded history filters", () => {
    expect(
      institutionCreateSchema.safeParse({
        name: "Sentetik Banka",
        institutionType: "bank",
      }).success,
    ).toBe(true);
    expect(
      transactionHistoryQuerySchema.safeParse({
        periodFrom: "2026-08-31",
        periodTo: "2026-08-01",
      }).success,
    ).toBe(false);
    expect(
      transactionHistoryQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
  });
});
