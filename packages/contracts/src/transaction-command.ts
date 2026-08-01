import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nonNegativeMoneyStringSchema,
  positiveDecimalStringSchema,
  positiveMoneyStringSchema,
  uuidSchema,
} from "./primitives.js";

const accountKindSchema = z.enum(["bank", "cash", "card"]);
const openingAccountKindSchema = z.enum([
  "bank",
  "cash",
  "card",
  "wallet",
  "investment",
]);
const assetAccountKindSchema = z.enum(["bank", "cash"]);
const ledgerRoleSchema = z.enum([
  "bank_asset",
  "cash_asset",
  "card_liability",
  "expense",
  "income",
  "receivable_asset",
  "investment_asset",
  "opening_equity",
  "adjustment_equity",
  "realized_gain",
  "realized_loss",
  "fee_expense",
  "fx_rounding",
]);

const commonShape = {
  currency: currencyCodeSchema,
  occurredAt: isoDateTimeSchema,
  economicDate: isoDateSchema,
  fxRate: positiveDecimalStringSchema.optional(),
};

export const expenseCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("expense"),
    amount: positiveMoneyStringSchema,
    sourceAccountId: uuidSchema,
    sourceKind: accountKindSchema,
    categoryId: uuidSchema,
  })
  .strict();

export const incomeCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("income"),
    amount: positiveMoneyStringSchema,
    targetAccountId: uuidSchema,
    targetKind: assetAccountKindSchema,
    categoryId: uuidSchema,
    incomeClass: z.literal("normal"),
  })
  .strict();

export const transferCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("transfer"),
    amount: positiveMoneyStringSchema,
    sourceAccountId: uuidSchema,
    sourceKind: assetAccountKindSchema,
    targetAccountId: uuidSchema,
    targetKind: assetAccountKindSchema,
    feeAmount: positiveMoneyStringSchema.optional(),
  })
  .strict()
  .refine((value) => value.sourceAccountId !== value.targetAccountId, {
    message: "Source and target accounts must differ",
    path: ["targetAccountId"],
  });

export const cardPaymentCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("card_payment"),
    amount: positiveMoneyStringSchema,
    bankAccountId: uuidSchema,
    cardAccountId: uuidSchema,
  })
  .strict();

export const cashbackRefundCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("cashback_refund"),
    amount: positiveMoneyStringSchema,
    targetAccountId: uuidSchema,
    targetKind: accountKindSchema,
    relatedTransactionId: uuidSchema,
    subscriptionId: uuidSchema.optional(),
  })
  .strict();

const sharedExpenseShareSchema = z
  .object({
    personId: uuidSchema,
    amount: positiveMoneyStringSchema,
  })
  .strict();

export const sharedExpenseCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("shared_expense"),
    totalAmount: positiveMoneyStringSchema,
    ownerShare: nonNegativeMoneyStringSchema,
    shares: z.array(sharedExpenseShareSchema).min(1).max(50),
    paymentAccountId: uuidSchema,
    paymentSourceKind: accountKindSchema,
  })
  .strict();

export const receivableSettlementCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("receivable_settlement"),
    amount: positiveMoneyStringSchema,
    receivableId: uuidSchema,
    targetAccountId: uuidSchema,
    targetKind: assetAccountKindSchema,
  })
  .strict();

export const expectedRealizationCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("expected_realization"),
    amount: positiveMoneyStringSchema,
    expectedPaymentId: uuidSchema,
    targetAccountId: uuidSchema,
    targetKind: assetAccountKindSchema,
    incomeClass: z.literal("normal"),
  })
  .strict();

export const investmentBuyCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("investment_buy"),
    cashAccountId: uuidSchema,
    instrumentId: uuidSchema,
    quantity: positiveDecimalStringSchema,
    unitPrice: positiveDecimalStringSchema,
    feeAmount: nonNegativeMoneyStringSchema,
  })
  .strict();

export const investmentSellCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("investment_sell"),
    cashAccountId: uuidSchema,
    instrumentId: uuidSchema,
    quantity: positiveDecimalStringSchema,
    unitPrice: positiveDecimalStringSchema,
    feeAmount: nonNegativeMoneyStringSchema,
  })
  .strict();

export const openingBalanceCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("opening_balance"),
    amount: positiveMoneyStringSchema,
    accountId: uuidSchema,
    accountKind: openingAccountKindSchema,
  })
  .strict();

export const balanceAdjustmentCommandSchema = z
  .object({
    ...commonShape,
    type: z.literal("balance_adjustment"),
    amount: positiveMoneyStringSchema,
    direction: z.enum(["increase", "decrease"]),
    accountId: uuidSchema,
    accountKind: openingAccountKindSchema,
    reason: z.string().trim().min(1).max(500),
    reconciliationId: uuidSchema.optional(),
  })
  .strict();

export const nonRevisionTransactionCommandSchema = z.discriminatedUnion(
  "type",
  [
    expenseCommandSchema,
    incomeCommandSchema,
    transferCommandSchema,
    cardPaymentCommandSchema,
    cashbackRefundCommandSchema,
    sharedExpenseCommandSchema,
    receivableSettlementCommandSchema,
    expectedRealizationCommandSchema,
    investmentBuyCommandSchema,
    investmentSellCommandSchema,
    openingBalanceCommandSchema,
    balanceAdjustmentCommandSchema,
  ],
);

export const voidRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const reviseRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    replacement: nonRevisionTransactionCommandSchema,
  })
  .strict();

export const transactionCommandSchema = nonRevisionTransactionCommandSchema;

export const transactionCommitRequestSchema = z
  .object({
    command: transactionCommandSchema,
    previewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export const transactionPreviewSchema = z
  .object({
    commandType: z.string().min(1),
    primaryAmount: positiveMoneyStringSchema,
    currency: currencyCodeSchema,
    postings: z
      .array(
        z
          .object({
            sequence: z.number().int().min(1),
            ledgerRole: ledgerRoleSchema,
            financialAccountId: uuidSchema.optional(),
            side: z.enum(["debit", "credit"]),
            amountOriginal: positiveMoneyStringSchema,
            currency: currencyCodeSchema,
            fxRate: positiveDecimalStringSchema,
            amountBase: positiveMoneyStringSchema,
          })
          .strict(),
      )
      .min(2),
    effects: z
      .object({
        personalExpenseDelta: z.string(),
        normalIncomeDelta: z.string(),
        netWorthDelta: z.string(),
      })
      .strict(),
    engineVersion: z.literal("ledger-1.0.0"),
    inputSchemaVersion: z.literal(1),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type TransactionCommandInput = z.infer<typeof transactionCommandSchema>;
export type TransactionPreview = z.infer<typeof transactionPreviewSchema>;
