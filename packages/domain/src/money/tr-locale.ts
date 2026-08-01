import { Money, MoneyError } from "./money.js";

const TR_MONEY_PATTERN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,4})?$/u;

export function parseTrMoney(input: string, currency = "TRY"): Money {
  const normalized = input.trim();
  if (normalized.length === 0) {
    throw new MoneyError("amount_required", "Amount is required.");
  }
  if (!TR_MONEY_PATTERN.test(normalized)) {
    throw new MoneyError("invalid_tr_money", "Invalid Turkish money format.");
  }

  const canonical = normalized.replaceAll(".", "").replace(",", ".");
  const withFraction = canonical.includes(".") ? canonical : `${canonical}.00`;
  return Money.positive(withFraction, currency);
}

export function formatTrMoney(money: Money): string {
  const [integer = "0", fraction = "00"] = money.toCanonical().split(".");
  const sign = integer.startsWith("-") ? "-" : "";
  const digits = sign ? integer.slice(1) : integer;
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return `${sign}${groups.join(".")},${fraction}`;
}
