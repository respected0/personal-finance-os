import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nonNegativeMoneyStringSchema,
  positiveMoneyStringSchema,
  uuidSchema,
} from "./primitives.js";

export const minimumPaymentRuleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("percentage"),
      rate: z.string().regex(/^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/u),
      minimumAmount: nonNegativeMoneyStringSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("fixed"),
      amount: nonNegativeMoneyStringSchema,
    })
    .strict(),
]);

export const creditCardProfileCreateSchema = z
  .object({
    accountId: uuidSchema,
    creditLimit: nonNegativeMoneyStringSchema,
    statementDay: z.number().int().min(1).max(31),
    dueDay: z.number().int().min(1).max(31),
    minimumPaymentRule: minimumPaymentRuleSchema,
  })
  .strict();

export const creditCardProfileSchema = creditCardProfileCreateSchema
  .omit({ accountId: true })
  .extend({
    accountId: uuidSchema,
    active: z.boolean(),
    rowVersion: z.number().int().positive(),
  })
  .strict();

export const statementAllocationSchema = z
  .object({
    statementId: uuidSchema,
    amount: positiveMoneyStringSchema,
  })
  .strict();

export const cardPaymentRequestSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    currency: currencyCodeSchema,
    occurredAt: isoDateTimeSchema,
    economicDate: isoDateSchema,
    bankAccountId: uuidSchema,
    statementAllocations: z.array(statementAllocationSchema).max(24).optional(),
  })
  .strict();

export const creditCardStatementSchema = z
  .object({
    id: uuidSchema,
    cardAccountId: uuidSchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    closingBalance: nonNegativeMoneyStringSchema,
    minimumDue: nonNegativeMoneyStringSchema,
    paidAmount: nonNegativeMoneyStringSchema,
    outstandingAmount: nonNegativeMoneyStringSchema,
    dueDate: isoDateSchema,
    status: z.enum(["open", "partially_paid", "paid", "overdue"]),
  })
  .strict();

export type CreditCardProfileCreate = z.infer<
  typeof creditCardProfileCreateSchema
>;
export type CardPaymentRequest = z.infer<typeof cardPaymentRequestSchema>;
