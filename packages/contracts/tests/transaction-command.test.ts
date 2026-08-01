import { describe, expect, test } from "vitest";
import {
  reviseRequestSchema,
  transactionCommandSchema,
  transactionPreviewSchema,
  voidRequestSchema,
} from "../src/transaction-command.ts";

const common = {
  currency: "TRY",
  occurredAt: "2026-07-29T12:00:00+03:00",
  economicDate: "2026-07-29",
};
const id = (suffix: string) =>
  `01980f42-0000-7000-8000-${suffix.padStart(12, "0")}`;

describe("B013 typed command contract", () => {
  test("covers every P0 ledger command discriminator", () => {
    const commands = [
      {
        ...common,
        type: "expense",
        amount: "10.00",
        sourceAccountId: id("1"),
        sourceKind: "card",
        categoryId: id("2"),
        installmentCount: 3,
        firstInstallmentDate: "2026-08-10",
      },
      {
        ...common,
        type: "income",
        amount: "10.00",
        targetAccountId: id("1"),
        targetKind: "bank",
        categoryId: id("2"),
        incomeClass: "normal",
      },
      {
        ...common,
        type: "transfer",
        amount: "10.00",
        sourceAccountId: id("1"),
        sourceKind: "bank",
        targetAccountId: id("2"),
        targetKind: "cash",
      },
      {
        ...common,
        type: "card_payment",
        amount: "10.00",
        bankAccountId: id("1"),
        cardAccountId: id("2"),
        statementAllocations: [{ statementId: id("20"), amount: "10.00" }],
      },
      {
        ...common,
        type: "cashback_refund",
        amount: "10.00",
        targetAccountId: id("1"),
        targetKind: "card",
        relatedTransactionId: id("2"),
      },
      {
        ...common,
        type: "shared_expense",
        totalAmount: "20.00",
        ownerShare: "10.00",
        shares: [{ personId: id("3"), amount: "10.00" }],
        paymentAccountId: id("1"),
        paymentSourceKind: "bank",
      },
      {
        ...common,
        type: "receivable_settlement",
        amount: "10.00",
        receivableId: id("3"),
        targetAccountId: id("1"),
        targetKind: "bank",
      },
      {
        ...common,
        type: "expected_realization",
        amount: "10.00",
        expectedPaymentId: id("3"),
        targetAccountId: id("1"),
        targetKind: "bank",
        incomeClass: "normal",
      },
      {
        ...common,
        type: "investment_buy",
        cashAccountId: id("1"),
        instrumentId: id("2"),
        quantity: "1.3100000000",
        unitPrice: "100.0000000000",
        feeAmount: "0.00",
      },
      {
        ...common,
        type: "investment_sell",
        cashAccountId: id("1"),
        instrumentId: id("2"),
        quantity: "1.0000000000",
        unitPrice: "100.0000000000",
        feeAmount: "0.00",
      },
      {
        ...common,
        type: "opening_balance",
        amount: "10.00",
        accountId: id("1"),
        accountKind: "bank",
      },
      {
        ...common,
        type: "balance_adjustment",
        amount: "10.00",
        direction: "increase",
        accountId: id("1"),
        accountKind: "bank",
        reason: "Synthetic reconciliation",
      },
    ];
    expect(
      commands.map((command) => transactionCommandSchema.parse(command).type),
    ).toEqual([
      "expense",
      "income",
      "transfer",
      "card_payment",
      "cashback_refund",
      "shared_expense",
      "receivable_settlement",
      "expected_realization",
      "investment_buy",
      "investment_sell",
      "opening_balance",
      "balance_adjustment",
    ]);
  });

  test("rejects financial numbers and client-supplied ownership", () => {
    const invalid = {
      ...common,
      type: "expense",
      amount: 10,
      userId: id("9"),
      sourceAccountId: id("1"),
      sourceKind: "bank",
      categoryId: id("2"),
    };
    expect(transactionCommandSchema.safeParse(invalid).success).toBe(false);
  });

  test("accepts every bound account kind for opening equity only", () => {
    for (const accountKind of [
      "bank",
      "cash",
      "card",
      "wallet",
      "investment",
    ]) {
      expect(
        transactionCommandSchema.safeParse({
          ...common,
          type: "opening_balance",
          amount: "10.00",
          accountId: id("1"),
          accountKind,
        }).success,
      ).toBe(true);
    }
    expect(
      transactionCommandSchema.safeParse({
        ...common,
        type: "expense",
        amount: "10.00",
        sourceAccountId: id("1"),
        sourceKind: "investment",
        categoryId: id("2"),
      }).success,
    ).toBe(false);
  });

  test("keeps server-derived postings and invariant state out of correction requests", () => {
    expect(voidRequestSchema.parse({ reason: "Synthetic correction" })).toEqual(
      {
        reason: "Synthetic correction",
      },
    );
    expect(
      reviseRequestSchema.safeParse({
        reason: "Synthetic correction",
        replacement: {
          ...common,
          type: "expense",
          amount: "10.00",
          sourceAccountId: id("1"),
          sourceKind: "bank",
          categoryId: id("2"),
        },
        originalPostings: [],
      }).success,
    ).toBe(false);
  });

  test("requires canonical preview strings and engine trace", () => {
    expect(
      transactionPreviewSchema.safeParse({
        commandType: "expense",
        primaryAmount: "10.00",
        currency: "TRY",
        postings: [
          {
            sequence: 1,
            ledgerRole: "expense",
            side: "debit",
            amountOriginal: "10.00",
            currency: "TRY",
            fxRate: "1.000000000000",
            amountBase: "10.00",
          },
          {
            sequence: 2,
            ledgerRole: "bank_asset",
            side: "credit",
            amountOriginal: "10.00",
            currency: "TRY",
            fxRate: "1.000000000000",
            amountBase: "10.00",
          },
        ],
        effects: {
          personalExpenseDelta: "10.00",
          normalIncomeDelta: "0.00",
          netWorthDelta: "-10.00",
        },
        engineVersion: "ledger-1.0.0",
        inputSchemaVersion: 1,
        previewHash: "a".repeat(64),
      }).success,
    ).toBe(true);
  });
});
