import { describe, expect, test } from "vitest";
import {
  resolveLedgerAccount,
  SYSTEM_LEDGER_ACCOUNTS,
  SYSTEM_LEDGER_ROLES,
  type LedgerChart,
} from "../src/ledger/chart-of-accounts.ts";
import type {
  OriginalPosting,
  TransactionCommand,
} from "../src/ledger/commands.ts";
import {
  assertAmountWithin,
  assertBalanced,
  assertGoalAllocationWithinEligible,
  assertPositiveAmount,
  assertQuantityWithin,
  LedgerInvariantError,
} from "../src/ledger/invariants.ts";
import { buildPostingPlan } from "../src/ledger/posting-engine.ts";
import {
  hashTransactionCommand,
  previewTransaction,
} from "../src/ledger/preview.ts";
import {
  evaluateReceivablePolicy,
  traceRecommendationRule,
} from "../src/ledger/uat-rules.ts";
import {
  compareCanonicalDecimals,
  Money,
  MoneyError,
  multiplyCanonicalDecimals,
} from "../src/money/money.ts";
import { formatTrMoney } from "../src/money/tr-locale.ts";

const id = (suffix: string) =>
  `01980f42-0000-7000-8000-${suffix.padStart(12, "0")}`;
const common = {
  currency: "TRY",
  occurredAt: "2026-07-29T12:00:00+03:00",
  economicDate: "2026-07-29",
} as const;
const baseExpense = {
  ...common,
  type: "expense",
  amount: "10.00",
  sourceAccountId: id("1"),
  sourceKind: "bank",
  categoryId: id("2"),
} as const;

function originals(command: TransactionCommand): OriginalPosting[] {
  return buildPostingPlan(command).postings.map((posting) => ({
    ledgerRole: posting.ledgerRole,
    ...(posting.financialAccountId
      ? { financialAccountId: posting.financialAccountId }
      : {}),
    side: posting.side,
    amount: posting.amountOriginal,
    currency: posting.currency,
    fxRate: posting.fxRate,
    amountBase: posting.amountBase,
  }));
}

describe("B014 fixed chart of accounts", () => {
  test("defines one unique account for every system role", async () => {
    const domain = await import("../src/index.ts");
    expect(domain.domainBoundary).toBe("domain");
    expect(SYSTEM_LEDGER_ROLES).toHaveLength(13);
    expect(SYSTEM_LEDGER_ACCOUNTS).toHaveLength(13);
    expect(new Set(SYSTEM_LEDGER_ACCOUNTS.map(({ role }) => role)).size).toBe(
      13,
    );
    const chart = Object.fromEntries(
      SYSTEM_LEDGER_ROLES.map((role, index) => [role, id(String(index + 1))]),
    ) as LedgerChart;
    expect(resolveLedgerAccount(chart, "expense")).toBe(id("4"));
    expect(() =>
      resolveLedgerAccount({ ...chart, expense: "" }, "expense"),
    ).toThrow(/Missing system ledger role/u);
  });
});

describe("B011 Money edge conditions", () => {
  test("covers signs, equality, zero, products, and currency isolation", () => {
    const negative = Money.from("-12.3400", "TRY");
    expect(negative.absolute().toCanonical()).toBe("12.34");
    expect(negative.negate().toCanonical()).toBe("12.34");
    expect(Money.zero("TRY").isZero()).toBe(true);
    expect(Money.from("1.00", "TRY").equals(Money.from("1.00", "USD"))).toBe(
      false,
    );
    expect(Money.from("2.00", "TRY").multiply("1.2500").toCanonical()).toBe(
      "2.50",
    );
    expect(
      multiplyCanonicalDecimals("1.3100000000", "2.0", "TRY").toCanonical(),
    ).toBe("2.62");
    expect(compareCanonicalDecimals("1.1", "1.10")).toBe(0);
    expect(formatTrMoney(negative)).toBe("-12,34");
  });

  test("rejects cross-currency and every invalid decimal entry boundary", () => {
    expect(() => Money.from("1.00", 1 as unknown as string)).toThrow(
      MoneyError,
    );
    expect(() => Money.positive("0.00", "TRY")).toThrow(MoneyError);
    expect(() =>
      Money.from("1.00", "TRY").add(Money.from("1.00", "USD")),
    ).toThrow(/Currency mismatch/u);
    expect(() => Money.product("x", "1.0", "TRY")).toThrow(MoneyError);
    expect(() => Money.product("1.0", "x", "TRY")).toThrow(MoneyError);
    expect(() => Money.product("999999999999999.9999", "2.0", "TRY")).toThrow(
      /numeric\(19,4\)/u,
    );
    expect(() =>
      Money.from("1.00", "TRY").multiply(2 as unknown as string),
    ).toThrow(MoneyError);
    expect(() => Money.from("1.00", "TRY").multiply("-2.0")).toThrow(
      MoneyError,
    );
    expect(() =>
      compareCanonicalDecimals(1 as unknown as string, "1.0"),
    ).toThrow(MoneyError);
    expect(() =>
      compareCanonicalDecimals("1.0", 1 as unknown as string),
    ).toThrow(MoneyError);
    expect(() => compareCanonicalDecimals("-1.0", "1.0")).toThrow(MoneyError);
    expect(() => compareCanonicalDecimals("1.0", "-1.0")).toThrow(MoneyError);
  });
});

describe("INV helper negative paths", () => {
  test("rejects invalid availability, quantities, and balance", () => {
    expect(() => assertPositiveAmount("0.00", "TRY")).toThrow(
      LedgerInvariantError,
    );
    expect(() => assertAmountWithin("1.00", "-1.00", "TRY", "cap")).toThrow(
      LedgerInvariantError,
    );
    expect(() =>
      assertGoalAllocationWithinEligible("-1.00", "2.00", "TRY"),
    ).toThrow(LedgerInvariantError);
    expect(() => assertQuantityWithin("0.0", "1.0")).toThrow(
      LedgerInvariantError,
    );
    expect(() =>
      assertBalanced([{ side: "debit", amountBase: "1.00" }]),
    ).toThrow(/at least two/u);
    expect(() =>
      assertBalanced([
        { side: "debit", amountBase: "2.00" },
        { side: "credit", amountBase: "1.00" },
      ]),
    ).toThrow(/must equal/u);
  });
});

describe("B015 posting engine branch matrix", () => {
  test("covers income, transfer fee, refund, and zero-owner sharing", () => {
    const income = buildPostingPlan({
      ...common,
      type: "income",
      amount: "20.00",
      targetAccountId: id("3"),
      targetKind: "cash",
      categoryId: id("2"),
      incomeClass: "normal",
    });
    expect(income.effects.normalIncomeDelta).toBe("20.00");
    expect(
      buildPostingPlan({
        ...common,
        type: "transfer",
        amount: "10.00",
        sourceAccountId: id("1"),
        sourceKind: "cash",
        targetAccountId: id("3"),
        targetKind: "bank",
        feeAmount: "1.00",
      }).postings,
    ).toHaveLength(4);
    expect(
      buildPostingPlan({
        ...common,
        type: "cashback_refund",
        amount: "5.00",
        targetAccountId: id("1"),
        targetKind: "bank",
        relatedTransactionId: id("4"),
        relatedExpenseRemaining: "10.00",
      }).links[0]?.linkType,
    ).toBe("refund_of");
    expect(
      buildPostingPlan({
        ...common,
        type: "shared_expense",
        totalAmount: "10.00",
        ownerShare: "0.00",
        shares: [{ personId: id("5"), amount: "10.00" }],
        paymentAccountId: id("1"),
        paymentSourceKind: "bank",
      }).postings,
    ).toHaveLength(2);
  });

  test("covers investment gain, loss, flat sale, openings, and adjustments", () => {
    const sale = (costBasis: string) =>
      buildPostingPlan({
        ...common,
        type: "investment_sell",
        cashAccountId: id("1"),
        instrumentId: id("6"),
        quantity: "1.0000000000",
        availableQuantity: "2.0000000000",
        unitPrice: "100.0000000000",
        costBasis,
        feeAmount: "0.00",
      });
    expect(
      sale("90.00").postings.some(
        ({ ledgerRole }) => ledgerRole === "realized_gain",
      ),
    ).toBe(true);
    expect(
      sale("110.00").postings.some(
        ({ ledgerRole }) => ledgerRole === "realized_loss",
      ),
    ).toBe(true);
    expect(sale("100.00").postings).toHaveLength(2);

    const assetOpening = buildPostingPlan({
      ...common,
      type: "opening_balance",
      amount: "10.00",
      accountId: id("1"),
      accountKind: "bank",
    });
    const liabilityOpening = buildPostingPlan({
      ...common,
      type: "opening_balance",
      amount: "10.00",
      accountId: id("7"),
      accountKind: "card",
    });
    expect(assetOpening.postings.map(({ side }) => side)).toEqual([
      "debit",
      "credit",
    ]);
    expect(liabilityOpening.postings.map(({ side }) => side)).toEqual([
      "credit",
      "debit",
    ]);
    expect(
      buildPostingPlan({
        ...common,
        type: "opening_balance",
        amount: "10.00",
        accountId: id("8"),
        accountKind: "wallet",
      }).postings[0]?.ledgerRole,
    ).toBe("bank_asset");
    expect(
      buildPostingPlan({
        ...common,
        type: "opening_balance",
        amount: "10.00",
        accountId: id("9"),
        accountKind: "investment",
      }).postings[0]?.ledgerRole,
    ).toBe("investment_asset");

    const sides = (
      direction: "increase" | "decrease",
      accountKind: "bank" | "card",
    ) =>
      buildPostingPlan({
        ...common,
        type: "balance_adjustment",
        amount: "1.00",
        direction,
        accountId: id("1"),
        accountKind,
        reason: "Synthetic matrix",
      }).postings.map(({ side }) => side);
    expect(sides("increase", "bank")).toEqual(["debit", "credit"]);
    expect(sides("decrease", "bank")).toEqual(["credit", "debit"]);
    expect(sides("increase", "card")).toEqual(["credit", "debit"]);
    expect(sides("decrease", "card")).toEqual(["debit", "credit"]);
  });

  test("covers FX, validation failures, and deterministic command hashing", () => {
    expect(
      buildPostingPlan({ ...baseExpense, currency: "USD", fxRate: "32" })
        .postings[0]?.amountBase,
    ).toBe("320.00");
    expect(() => buildPostingPlan({ ...baseExpense, fxRate: "2.0" })).toThrow(
      /FX rate of one/u,
    );
    expect(() => buildPostingPlan({ ...baseExpense, currency: "USD" })).toThrow(
      /require an explicit FX/u,
    );
    expect(() =>
      buildPostingPlan({ ...baseExpense, currency: "USD", fxRate: "bad" }),
    ).toThrow(/positive canonical/u);
    expect(() =>
      buildPostingPlan({ ...baseExpense, currency: "USD", fxRate: "0.000" }),
    ).toThrow(/positive canonical/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "transfer",
        amount: "1.00",
        sourceAccountId: id("1"),
        sourceKind: "bank",
        targetAccountId: id("1"),
        targetKind: "cash",
      }),
    ).toThrow(/must differ/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "cashback_refund",
        amount: "11.00",
        targetAccountId: id("1"),
        targetKind: "bank",
        relatedTransactionId: id("4"),
        relatedExpenseRemaining: "10.00",
      }),
    ).toThrow(/exceeds available/u);
    expect(hashTransactionCommand(baseExpense)).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      previewTransaction({ ...baseExpense, fxRate: undefined }).previewHash,
    ).toBe(previewTransaction(baseExpense).previewHash);
  });

  test("rejects invalid shared, investment, and adjustment commands", () => {
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "shared_expense",
        totalAmount: "11.00",
        ownerShare: "1.00",
        shares: [{ personId: id("5"), amount: "1.00" }],
        paymentAccountId: id("1"),
        paymentSourceKind: "bank",
      }),
    ).toThrow(/must equal total/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "investment_buy",
        cashAccountId: id("1"),
        instrumentId: id("6"),
        quantity: "1.0",
        unitPrice: "1.0",
        feeAmount: "-2.00",
      }),
    ).toThrow(/cannot be negative/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "investment_buy",
        cashAccountId: id("1"),
        instrumentId: id("6"),
        quantity: "0.0",
        unitPrice: "1.0",
        feeAmount: "0.00",
      }),
    ).toThrow(/must be positive/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "investment_sell",
        cashAccountId: id("1"),
        instrumentId: id("6"),
        quantity: "1.0",
        availableQuantity: "1.0",
        unitPrice: "1.0",
        costBasis: "1.00",
        feeAmount: "2.00",
      }),
    ).toThrow(/proceeds must be positive/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "balance_adjustment",
        amount: "1.00",
        direction: "increase",
        accountId: id("1"),
        accountKind: "bank",
        reason: " ",
      }),
    ).toThrow(/requires a reason/u);
  });

  test("covers void income and revise effect composition", () => {
    const income: TransactionCommand = {
      ...common,
      type: "income",
      amount: "20.00",
      targetAccountId: id("1"),
      targetKind: "bank",
      categoryId: id("2"),
      incomeClass: "normal",
    };
    const voidIncome = buildPostingPlan({
      ...common,
      type: "void",
      originalTransactionId: id("8"),
      reason: "Synthetic reversal",
      originalPostings: originals(income),
    });
    expect(voidIncome.effects.normalIncomeDelta).toBe("-20.00");

    const revise = buildPostingPlan({
      ...common,
      type: "revise",
      originalTransactionId: id("9"),
      reason: "Synthetic revision",
      originalPostings: originals(baseExpense),
      replacement: {
        ...common,
        type: "cashback_refund",
        amount: "2.00",
        targetAccountId: id("1"),
        targetKind: "bank",
        relatedTransactionId: id("10"),
        relatedExpenseRemaining: "10.00",
      },
    });
    expect(revise.links.map(({ linkType }) => linkType)).toEqual([
      "reverses",
      "refund_of",
    ]);
    expect(revise.effects.personalExpenseDelta).toBe("-12.00");
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "void",
        originalTransactionId: id("8"),
        reason: "Bad reversal",
        originalPostings: [
          {
            ledgerRole: "expense",
            side: "debit",
            amount: "1.00",
            currency: "TRY",
            fxRate: "1.000000000000",
            amountBase: "1.00",
          },
        ],
      }),
    ).toThrow(/at least two/u);
  });
});

describe("UAT policy negative and included paths", () => {
  test("validates receivable values and both policy flags", () => {
    expect(
      evaluateReceivablePolicy({
        nominalAmount: "10.00",
        estimatedCollectibleAmount: "5.00",
        currency: "TRY",
        includeInNetWorth: true,
        includeInPlanning: true,
      }),
    ).toMatchObject({ netWorthAmount: "5.00", planningAmount: "5.00" });
    expect(() =>
      evaluateReceivablePolicy({
        nominalAmount: "10.00",
        estimatedCollectibleAmount: "-1.00",
        currency: "TRY",
        includeInNetWorth: false,
        includeInPlanning: false,
      }),
    ).toThrow(/exceeds nominal/u);
    expect(() =>
      evaluateReceivablePolicy({
        nominalAmount: "10.00",
        estimatedCollectibleAmount: "11.00",
        currency: "TRY",
        includeInNetWorth: false,
        includeInPlanning: false,
      }),
    ).toThrow(/exceeds nominal/u);
  });

  test.each([
    ["x", 1],
    ["valid_code", 1.5],
    ["valid_code", 0],
  ])("rejects invalid recommendation trace %s/%s", (code, version) => {
    expect(() => traceRecommendationRule(code, version)).toThrow(
      /positive integer/u,
    );
  });
});
