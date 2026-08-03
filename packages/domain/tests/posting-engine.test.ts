import { describe, expect, test } from "vitest";
import type { TransactionCommand } from "../src/ledger/commands.ts";
import {
  assertBalanced,
  LedgerInvariantError,
} from "../src/ledger/invariants.ts";
import { buildPostingPlan } from "../src/ledger/posting-engine.ts";
import { previewTransaction } from "../src/ledger/preview.ts";
import {
  aggregateFinancialEffects,
  evaluateGoalAllocation,
  evaluateReceivablePolicy,
  traceRecommendationRule,
} from "../src/ledger/uat-rules.ts";

const id = (suffix: string) =>
  `01980f42-0000-7000-8000-${suffix.padStart(12, "0")}`;
const common = {
  currency: "TRY",
  occurredAt: "2026-07-29T12:00:00+03:00",
  economicDate: "2026-07-29",
} as const;

const expense: TransactionCommand = {
  ...common,
  type: "expense",
  amount: "427.50",
  sourceAccountId: id("1"),
  sourceKind: "bank",
  categoryId: id("2"),
};

describe("B013-B015 transaction commands and posting templates", () => {
  test.each<[string, TransactionCommand, number, string, string]>([
    ["UAT-01 bank expense", expense, 2, "427.50", "-427.50"],
    [
      "UAT-02 transfer",
      {
        ...common,
        type: "transfer",
        amount: "1000.00",
        sourceAccountId: id("1"),
        sourceKind: "bank",
        targetAccountId: id("3"),
        targetKind: "cash",
      },
      2,
      "0.00",
      "0.00",
    ],
    [
      "UAT-03 card expense",
      { ...expense, sourceAccountId: id("4"), sourceKind: "card" },
      2,
      "427.50",
      "-427.50",
    ],
    [
      "UAT-04 card payment",
      {
        ...common,
        type: "card_payment",
        amount: "500.00",
        bankAccountId: id("1"),
        cardAccountId: id("4"),
      },
      2,
      "0.00",
      "0.00",
    ],
    [
      "UAT-05 subscription cashback",
      {
        ...common,
        type: "cashback_refund",
        amount: "25.00",
        targetAccountId: id("4"),
        targetKind: "card",
        relatedTransactionId: id("5"),
        relatedExpenseRemaining: "100.00",
        subscriptionId: id("6"),
      },
      2,
      "-25.00",
      "25.00",
    ],
    [
      "UAT-06 shared expense",
      {
        ...common,
        type: "shared_expense",
        totalAmount: "300.00",
        ownerShare: "100.00",
        shares: [
          { personId: id("7"), amount: "100.00" },
          { personId: id("8"), amount: "100.00" },
        ],
        paymentAccountId: id("1"),
        paymentSourceKind: "bank",
      },
      4,
      "100.00",
      "-100.00",
    ],
    [
      "UAT-07 receivable settlement",
      {
        ...common,
        type: "receivable_settlement",
        amount: "100.00",
        receivableId: id("9"),
        outstandingAmount: "250.00",
        targetAccountId: id("1"),
        targetKind: "bank",
      },
      2,
      "0.00",
      "0.00",
    ],
    [
      "UAT-09 expected realization",
      {
        ...common,
        type: "expected_realization",
        amount: "1200.00",
        expectedPaymentId: id("10"),
        alreadyRealized: false,
        targetAccountId: id("1"),
        targetKind: "bank",
        incomeClass: "normal",
      },
      2,
      "0.00",
      "1200.00",
    ],
    [
      "UAT-10 investment buy",
      {
        ...common,
        type: "investment_buy",
        cashAccountId: id("1"),
        instrumentId: id("11"),
        quantity: "1.3100000000",
        unitPrice: "2450.0000000000",
        feeAmount: "5.00",
      },
      2,
      "0.00",
      "0.00",
    ],
    [
      "UAT-12 reconciliation adjustment",
      {
        ...common,
        type: "balance_adjustment",
        amount: "10.00",
        direction: "increase",
        accountId: id("1"),
        accountKind: "bank",
        reason: "Synthetic reconciliation difference",
        reconciliationId: id("12"),
      },
      2,
      "0.00",
      "0.00",
    ],
    [
      "UAT-15 mobile quick expense uses same engine",
      expense,
      2,
      "427.50",
      "-427.50",
    ],
  ])("%s", (_name, command, postingCount, expenseDelta, netWorthDelta) => {
    const plan = buildPostingPlan(command);
    expect(plan.postings).toHaveLength(postingCount);
    expect(plan.effects.personalExpenseDelta).toBe(expenseDelta);
    expect(plan.effects.netWorthDelta).toBe(netWorthDelta);
    expect(() => assertBalanced(plan.postings)).not.toThrow();
  });

  test("transfer fee is an expense while transfer principal remains neutral", () => {
    const plan = buildPostingPlan({
      ...common,
      type: "transfer",
      amount: "1000.00",
      feeAmount: "2.50",
      sourceAccountId: id("1"),
      sourceKind: "bank",
      targetAccountId: id("3"),
      targetKind: "cash",
    });
    expect(plan.effects).toEqual({
      personalExpenseDelta: "2.50",
      normalIncomeDelta: "0.00",
      netWorthDelta: "-2.50",
    });
    expect(plan.postings).toHaveLength(4);
  });

  test("card installment expense is fully recognized at purchase", () => {
    const plan = buildPostingPlan({
      ...common,
      type: "expense",
      amount: "1000.01",
      sourceAccountId: id("4"),
      sourceKind: "card",
      categoryId: id("2"),
      installmentCount: 3,
      firstInstallmentDate: "2026-08-10",
    });
    expect(plan.effects.personalExpenseDelta).toBe("1000.01");
    expect(plan.effects.netWorthDelta).toBe("-1000.01");
    expect(plan.postings).toHaveLength(2);
  });

  test("card payment statement allocations cannot exceed payment", () => {
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "card_payment",
        amount: "500.00",
        bankAccountId: id("1"),
        cardAccountId: id("4"),
        statementAllocations: [{ statementId: id("20"), amount: "500.01" }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "statement_allocation_exceeded" }),
    );
  });

  test("preview is pure, deterministic, and uses the production engine", () => {
    const first = previewTransaction(expense);
    const second = previewTransaction(structuredClone(expense));
    expect(first).toEqual(second);
    expect(first.previewHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.engineVersion).toBe("ledger-1.0.0");
  });

  test("void creates an exact immutable reversal", () => {
    const original = buildPostingPlan(expense);
    const reversal = buildPostingPlan({
      ...common,
      type: "void",
      originalTransactionId: id("13"),
      reason: "Synthetic correction",
      originalPostings: original.postings.map((posting) => ({
        ledgerRole: posting.ledgerRole,
        ...(posting.financialAccountId
          ? { financialAccountId: posting.financialAccountId }
          : {}),
        side: posting.side,
        amount: posting.amountOriginal,
        currency: posting.currency,
        fxRate: posting.fxRate,
        amountBase: posting.amountBase,
      })),
    });
    expect(reversal.postings.map(({ side }) => side)).toEqual([
      "credit",
      "debit",
    ]);
    expect(reversal.effects.personalExpenseDelta).toBe("-427.50");
    expect(reversal.links[0]?.linkType).toBe("reverses");
  });
});

describe("B044 exact shared-expense rounding", () => {
  test("allocates explicit rounding to owner cost without floating-point arithmetic", () => {
    const plan = buildPostingPlan({
      ...common,
      type: "shared_expense",
      totalAmount: "100.00",
      ownerShare: "33.33",
      roundingAmount: "0.01",
      shares: [
        { personId: id("701"), amount: "33.33" },
        { personId: id("702"), amount: "33.33" },
      ],
      paymentAccountId: id("1"),
      paymentSourceKind: "bank",
    });
    expect(plan.effects.personalExpenseDelta).toBe("33.34");
    expect(
      plan.postings
        .filter(
          ({ ledgerRole, side }) =>
            ledgerRole === "receivable_asset" && side === "debit",
        )
        .map(({ amountOriginal }) => amountOriginal),
    ).toEqual(["33.33", "33.33"]);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "shared_expense",
        totalAmount: "1.00",
        ownerShare: "0.00",
        roundingAmount: "-0.01",
        shares: [{ personId: id("703"), amount: "1.01" }],
        paymentAccountId: id("1"),
        paymentSourceKind: "bank",
      }),
    ).toThrow(LedgerInvariantError);
  });
});

describe("B024 UAT financial rule coverage", () => {
  test("UAT-08 doubtful receivable policies remain independent", () => {
    expect(
      evaluateReceivablePolicy({
        nominalAmount: "1500.00",
        estimatedCollectibleAmount: "300.00",
        currency: "TRY",
        includeInNetWorth: false,
        includeInPlanning: false,
      }),
    ).toEqual({
      trackedNominalAmount: "1500.00",
      netWorthAmount: "0.00",
      planningAmount: "0.00",
    });
  });

  test("UAT-11 goal allocation is virtual and bounded", () => {
    expect(evaluateGoalAllocation("250.00", "500.00", "TRY")).toEqual({
      allocated: "250.00",
      ledgerPostingCount: 0,
    });
    expect(() => evaluateGoalAllocation("501.00", "500.00", "TRY")).toThrow(
      LedgerInvariantError,
    );
  });

  test("UAT-13 report aggregate is derived from ledger effects", () => {
    const transfer = buildPostingPlan({
      ...common,
      type: "transfer",
      amount: "100.00",
      sourceAccountId: id("1"),
      sourceKind: "bank",
      targetAccountId: id("2"),
      targetKind: "cash",
    });
    expect(
      aggregateFinancialEffects([buildPostingPlan(expense), transfer]),
    ).toEqual({
      personalExpense: "427.50",
      normalIncome: "0.00",
      netWorthDelta: "-427.50",
    });
  });

  test("UAT-14 recommendation evidence carries rule version", () => {
    expect(traceRecommendationRule("cash_buffer", 1)).toEqual({
      code: "cash_buffer",
      version: 1,
    });
  });

  test("rejects receivable over-settlement, repeated realization, and lot over-sell", () => {
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "receivable_settlement",
        amount: "251.00",
        receivableId: id("9"),
        outstandingAmount: "250.00",
        targetAccountId: id("1"),
        targetKind: "bank",
      }),
    ).toThrowError(/exceeds available/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "expected_realization",
        amount: "100.00",
        expectedPaymentId: id("10"),
        alreadyRealized: true,
        targetAccountId: id("1"),
        targetKind: "bank",
        incomeClass: "normal",
      }),
    ).toThrowError(/already realized/u);
    expect(() =>
      buildPostingPlan({
        ...common,
        type: "investment_sell",
        cashAccountId: id("1"),
        instrumentId: id("11"),
        quantity: "1.3100000001",
        availableQuantity: "1.3100000000",
        unitPrice: "2500.0000000000",
        costBasis: "3000.00",
        feeAmount: "5.00",
      }),
    ).toThrowError(/available lot quantity/u);
  });
});
