import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneyStringSchema,
  nonNegativeMoneyStringSchema,
  positiveMoneyStringSchema,
  uuidSchema,
} from "./primitives.js";

export const counterpartyTypeSchema = z.enum([
  "person",
  "merchant",
  "employer",
  "provider",
]);

export const counterpartyCreateSchema = z
  .object({
    type: counterpartyTypeSchema,
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const sharedExpenseShareSchema = z
  .object({
    personId: uuidSchema,
    amount: positiveMoneyStringSchema,
  })
  .strict();

const sharedExpenseBaseSchema = z
  .object({
    totalAmount: positiveMoneyStringSchema,
    ownerShare: nonNegativeMoneyStringSchema,
    roundingAmount: moneyStringSchema.default("0.00"),
    shares: z.array(sharedExpenseShareSchema).min(1).max(50),
    paymentAccountId: uuidSchema,
    paymentSourceKind: z.enum(["bank", "cash", "card"]),
    currency: currencyCodeSchema,
    occurredAt: isoDateTimeSchema,
    economicDate: isoDateSchema,
  })
  .strict();

export const sharedExpensePreviewRequestSchema = sharedExpenseBaseSchema;
export const sharedExpenseCreateSchema = sharedExpenseBaseSchema;

export const receivableSettlementRequestSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    currency: currencyCodeSchema,
    occurredAt: isoDateTimeSchema,
    economicDate: isoDateSchema,
    targetAccountId: uuidSchema,
    targetKind: z.enum(["bank", "cash"]),
  })
  .strict();

export const collectabilityStatusSchema = z.enum([
  "collectible",
  "doubtful",
  "waived",
  "closed",
]);

export type CounterpartyCreate = z.infer<typeof counterpartyCreateSchema>;
export type SharedExpenseCreate = z.infer<typeof sharedExpenseCreateSchema>;
export type ReceivableSettlementRequest = z.infer<
  typeof receivableSettlementRequestSchema
>;
