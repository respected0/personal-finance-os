import { describe, expect, test } from "vitest";
import { Money, MoneyError } from "../src/money/money.ts";
import { formatTrMoney, parseTrMoney } from "../src/money/tr-locale.ts";

describe("B011 decimal Money", () => {
  test("adds, subtracts, and compares without binary floating point", () => {
    const left = Money.from("0.10", "TRY");
    const right = Money.from("0.20", "TRY");

    expect(left.add(right).toCanonical()).toBe("0.30");
    expect(right.subtract(left).toCanonical()).toBe("0.10");
    expect(left.compare(right)).toBe(-1);
    expect(Money.from("999999999999999.9999", "TRY").toCanonical()).toBe(
      "999999999999999.9999",
    );
  });

  test("rejects JavaScript number, invalid currency, and numeric overflow", () => {
    expect(() => Money.from(0.1 as unknown as string, "TRY")).toThrow(
      MoneyError,
    );
    expect(() => Money.from("1.00", "try")).toThrow(MoneyError);
    expect(() => Money.from("1000000000000000.0000", "TRY")).toThrow(
      MoneyError,
    );
  });
});

describe("B012 Turkish locale parser and formatter", () => {
  test.each([
    ["427,50", "427.50", "427,50"],
    ["1.234,56", "1234.56", "1.234,56"],
    ["1000", "1000.00", "1.000,00"],
  ])("normalizes %s", (input, canonical, formatted) => {
    const parsed = parseTrMoney(input);
    expect(parsed.toCanonical()).toBe(canonical);
    expect(formatTrMoney(parsed)).toBe(formatted);
  });

  test.each(["", "0", "0,00", "-1,00", "1,2,3", "1.23,45"])(
    "rejects blank, zero, negative, or malformed input %s",
    (input) => {
      expect(() => parseTrMoney(input)).toThrow();
    },
  );
});
