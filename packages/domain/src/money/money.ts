import { Decimal } from "decimal.js";

const MONEY_PATTERN = /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,4})$/u;
const UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,12})$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

const ExactDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40,
});

export class MoneyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
  }
}

export type CurrencyCode = string & { readonly __currencyCode: unique symbol };
export type MoneyString = string & { readonly __moneyString: unique symbol };

function assertCurrency(currency: string): asserts currency is CurrencyCode {
  if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
    throw new MoneyError(
      "invalid_currency",
      "Currency must be an uppercase ISO 4217 code.",
    );
  }
}

function assertMoneyString(amount: string): void {
  if (typeof amount !== "string" || !MONEY_PATTERN.test(amount)) {
    throw new MoneyError(
      "invalid_money",
      "Money must be a canonical decimal string with one to four fraction digits.",
    );
  }
}

function formatCanonical(value: Decimal): MoneyString {
  const fixed = value.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).toFixed(4);
  const [integer, fraction] = fixed.split(".") as [string, string];
  const compactFraction = fraction.replace(/0+$/u, "").padEnd(2, "0");
  const canonical = `${integer}.${compactFraction}`;
  assertMoneyString(canonical);
  return canonical as MoneyString;
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new MoneyError(
      "currency_mismatch",
      `Currency mismatch: ${left.currency}/${right.currency}.`,
    );
  }
}

export class Money {
  readonly currency: CurrencyCode;
  readonly #value: Decimal;

  private constructor(value: Decimal, currency: CurrencyCode) {
    if (!value.isFinite()) {
      throw new MoneyError("invalid_money", "Money must be finite.");
    }
    const rounded = value.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
    if (rounded.abs().greaterThan("999999999999999.9999")) {
      throw new MoneyError(
        "money_out_of_range",
        "Money exceeds numeric(19,4).",
      );
    }
    this.#value = rounded;
    this.currency = currency;
  }

  static from(amount: string, currency: string): Money {
    assertMoneyString(amount);
    assertCurrency(currency);
    return new Money(new ExactDecimal(amount), currency);
  }

  static positive(amount: string, currency: string): Money {
    const money = Money.from(amount, currency);
    if (!money.isPositive()) {
      throw new MoneyError(
        "amount_must_be_positive",
        "Amount must be positive.",
      );
    }
    return money;
  }

  static zero(currency: string): Money {
    assertCurrency(currency);
    return new Money(new ExactDecimal(0), currency);
  }

  static product(
    multiplicand: string,
    multiplier: string,
    currency: string,
  ): Money {
    if (
      !UNSIGNED_DECIMAL_PATTERN.test(multiplicand) ||
      !UNSIGNED_DECIMAL_PATTERN.test(multiplier)
    ) {
      throw new MoneyError(
        "invalid_decimal_factor",
        "Quantity and unit price must be unsigned canonical decimal strings.",
      );
    }
    assertCurrency(currency);
    return new Money(
      new ExactDecimal(multiplicand).times(new ExactDecimal(multiplier)),
      currency,
    );
  }

  add(other: Money): Money {
    assertSameCurrency(this, other);
    return new Money(this.#value.plus(other.#value), this.currency);
  }

  subtract(other: Money): Money {
    assertSameCurrency(this, other);
    return new Money(this.#value.minus(other.#value), this.currency);
  }

  negate(): Money {
    return new Money(this.#value.negated(), this.currency);
  }

  absolute(): Money {
    return new Money(this.#value.abs(), this.currency);
  }

  multiply(factor: string): Money {
    if (typeof factor !== "string" || !UNSIGNED_DECIMAL_PATTERN.test(factor)) {
      throw new MoneyError(
        "invalid_decimal_factor",
        "Factor must be an unsigned canonical decimal string.",
      );
    }
    return new Money(
      this.#value.times(new ExactDecimal(factor)),
      this.currency,
    );
  }

  compare(other: Money): -1 | 0 | 1 {
    assertSameCurrency(this, other);
    return this.#value.comparedTo(other.#value) as -1 | 0 | 1;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.#value.equals(other.#value);
  }

  isZero(): boolean {
    return this.#value.isZero();
  }

  isPositive(): boolean {
    return this.#value.greaterThan(0);
  }

  toCanonical(): MoneyString {
    return formatCanonical(this.#value);
  }
}

export function multiplyCanonicalDecimals(
  multiplicand: string,
  multiplier: string,
  currency: string,
): Money {
  return Money.product(multiplicand, multiplier, currency);
}

export function compareCanonicalDecimals(
  left: string,
  right: string,
): -1 | 0 | 1 {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !UNSIGNED_DECIMAL_PATTERN.test(left) ||
    !UNSIGNED_DECIMAL_PATTERN.test(right)
  ) {
    throw new MoneyError(
      "invalid_decimal_factor",
      "Values must be unsigned canonical decimal strings.",
    );
  }
  return new ExactDecimal(left).comparedTo(new ExactDecimal(right)) as
    -1 | 0 | 1;
}
