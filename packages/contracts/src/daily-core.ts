import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneyStringSchema,
  positiveMoneyStringSchema,
  uuidSchema,
} from "./primitives.js";

export const institutionTypeSchema = z.enum([
  "bank",
  "wallet",
  "broker",
  "other",
]);
export const financialAccountTypeSchema = z.enum([
  "bank",
  "cash",
  "wallet",
  "credit_card",
  "investment",
]);
export const categoryTypeSchema = z.enum(["income", "expense"]);

export const institutionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    institutionType: institutionTypeSchema,
  })
  .strict();

export const institutionSchema = institutionCreateSchema.extend({
  id: uuidSchema,
  active: z.boolean(),
  rowVersion: z.number().int().positive(),
});

export const financialAccountCreateSchema = z
  .object({
    institutionId: uuidSchema.optional(),
    name: z.string().trim().min(1).max(120),
    accountType: financialAccountTypeSchema,
    currency: currencyCodeSchema,
    openingDate: isoDateSchema,
  })
  .strict();

export const accountBalanceSchema = z
  .object({
    accountId: uuidSchema,
    currency: currencyCodeSchema,
    asOf: isoDateSchema.nullable(),
    calculatedOriginal: moneyStringSchema,
    calculatedBase: moneyStringSchema,
  })
  .strict();

export const financialAccountSchema = financialAccountCreateSchema
  .omit({ name: true })
  .extend({
    id: uuidSchema,
    ledgerAccountId: uuidSchema,
    name: z.string().min(1).max(120),
    status: z.enum(["active", "archived"]),
    rowVersion: z.number().int().positive(),
    balance: accountBalanceSchema,
  })
  .strict();

export const openingBalanceRequestSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    currency: currencyCodeSchema,
    date: isoDateSchema,
  })
  .strict();

export const accountArchiveRequestSchema = z
  .object({ status: z.literal("archived") })
  .strict();

export const categorySchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(120),
    categoryType: categoryTypeSchema,
    active: z.boolean(),
    sortOrder: z.number().int(),
    rowVersion: z.number().int().positive(),
  })
  .strict();

export const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    categoryType: categoryTypeSchema,
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const transactionHistoryQuerySchema = z
  .object({
    cursor: z.string().min(1).max(1000).optional(),
    periodFrom: isoDateSchema.optional(),
    periodTo: isoDateSchema.optional(),
    type: z
      .enum([
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
        "void",
        "revise",
      ])
      .optional(),
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(
    (value) =>
      !value.periodFrom ||
      !value.periodTo ||
      value.periodFrom <= value.periodTo,
    { message: "periodFrom must not be after periodTo", path: ["periodTo"] },
  );

export const transactionHistoryItemSchema = z
  .object({
    id: uuidSchema,
    type: z.string().min(1),
    occurredAt: isoDateTimeSchema,
    economicDate: isoDateSchema,
    amount: positiveMoneyStringSchema,
    currency: currencyCodeSchema,
    categoryId: uuidSchema.nullable(),
    engineVersion: z.string().min(1),
  })
  .strict();

export const transactionHistoryPageSchema = z
  .object({
    items: z.array(transactionHistoryItemSchema),
    nextCursor: z.string().nullable(),
    aggregate: z
      .object({
        personalExpense: moneyStringSchema,
        normalIncome: moneyStringSchema,
        net: moneyStringSchema,
      })
      .strict(),
  })
  .strict();

export const transactionEntryDraftSchema = z
  .object({
    type: z.enum(["expense", "income", "transfer"]),
    amountInput: z.string().trim().min(1).max(40),
    date: isoDateSchema,
    sourceAccountId: z.string().optional().default(""),
    targetAccountId: z.string().optional().default(""),
    categoryId: z.string().optional().default(""),
    feeInput: z.string().trim().max(40).optional().default(""),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.type === "expense" || value.type === "transfer") &&
      !uuidSchema.safeParse(value.sourceAccountId).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceAccountId"],
        message: "Kaynak hesap seçin.",
      });
    }
    if (
      (value.type === "income" || value.type === "transfer") &&
      !uuidSchema.safeParse(value.targetAccountId).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetAccountId"],
        message: "Hedef hesap seçin.",
      });
    }
    if (
      (value.type === "expense" || value.type === "income") &&
      !uuidSchema.safeParse(value.categoryId).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Kategori seçin.",
      });
    }
    if (
      value.type === "transfer" &&
      value.sourceAccountId === value.targetAccountId
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetAccountId"],
        message: "Hedef hesap kaynak hesaptan farklı olmalı.",
      });
    }
  });

export type InstitutionCreate = z.infer<typeof institutionCreateSchema>;
export type FinancialAccountCreate = z.infer<
  typeof financialAccountCreateSchema
>;
export type OpeningBalanceRequest = z.infer<typeof openingBalanceRequestSchema>;
export type TransactionHistoryQuery = z.infer<
  typeof transactionHistoryQuerySchema
>;
export type TransactionEntryDraft = z.infer<typeof transactionEntryDraftSchema>;
