import { describe, expect, test } from "vitest";
import { marketPriceCreateSchema } from "../src/investment.js";

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
