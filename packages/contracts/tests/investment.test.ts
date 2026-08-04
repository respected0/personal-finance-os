import { describe, expect, test } from "vitest";
import {
  investmentTradeCommitRequestSchema,
  marketPriceCreateSchema,
} from "../src/investment.js";

describe("B073 investment instrument/price contract", () => {
  test("accepts exact manually timestamped bank-gold price", () => {
    expect(
      marketPriceCreateSchema.parse({
        instrument: {
          symbol: "XAU-TRY",
          name: "Sentetik banka altını",
          instrumentType: "bank_gold",
          unit: "gram",
          currency: "TRY",
        },
        price: "2875.1234567890",
        priceAt: "2026-08-04T12:00:00.000Z",
        sourceType: "reference_fixture",
        isEstimated: false,
      }).price,
    ).toBe("2875.1234567890");
  });
  test("rejects JSON numbers and owner injection", () => {
    expect(() =>
      marketPriceCreateSchema.parse({
        userId: "01980f42-0000-7000-8000-000000000001",
        instrument: {
          symbol: "XAU-TRY",
          name: "Sentetik",
          instrumentType: "bank_gold",
          unit: "gram",
          currency: "TRY",
        },
        price: 2875.12,
        priceAt: "2026-08-04T12:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("B074/B075 investment buy contract", () => {
  const command = {
    type: "investment_buy" as const,
    currency: "TRY",
    occurredAt: "2026-08-04T12:00:00.000Z",
    economicDate: "2026-08-04",
    cashAccountId: "01980f42-0000-7000-8000-000000000002",
    instrumentId: "01980f42-0000-7000-8000-000000000003",
    quantity: "1.3100000000",
    unitPrice: "2875.1234567890",
    feeAmount: "7.5000",
  };
  test("keeps quantity, price and fee as exact strings", () => {
    const parsed = investmentTradeCommitRequestSchema.parse({ command });
    expect(parsed.command.quantity).toBe("1.3100000000");
    expect(parsed.command.unitPrice).toBe("2875.1234567890");
    expect(parsed.command.feeAmount).toBe("7.5000");
  });
  test("rejects floating-point input and owner injection", () => {
    expect(() =>
      investmentTradeCommitRequestSchema.parse({
        command: { ...command, quantity: 1.31, userId: command.cashAccountId },
      }),
    ).toThrow();
  });
  test("accepts an exact sell without client-provided lot cost fields", () => {
    const parsed = investmentTradeCommitRequestSchema.parse({
      command: {
        ...command,
        type: "investment_sell",
        quantity: "0.3100000000",
        unitPrice: "3000.0000000000",
      },
    });
    expect(parsed.command.type).toBe("investment_sell");
    expect(parsed.command).not.toHaveProperty("availableQuantity");
    expect(parsed.command).not.toHaveProperty("costBasis");
  });
});
