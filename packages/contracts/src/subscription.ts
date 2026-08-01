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

export const canonicalRateSchema = z
  .string()
  .regex(/^(?:0(?:\.\d{1,8})?|1(?:\.0{1,8})?)$/u);

export const subscriptionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    billingDay: z.number().int().min(1).max(31),
    paymentAccountId: uuidSchema,
    expectedGross: nonNegativeMoneyStringSchema,
    cashbackRate: canonicalRateSchema,
    cashbackCap: nonNegativeMoneyStringSchema,
  })
  .strict();

export const subscriptionCycleSchema = z
  .object({
    id: uuidSchema,
    period: isoDateSchema,
    renewalDate: isoDateSchema,
    chargeTransactionId: uuidSchema.nullable(),
    chargeTotal: nonNegativeMoneyStringSchema,
    cashbackTotal: nonNegativeMoneyStringSchema,
    actualNet: nonNegativeMoneyStringSchema,
  })
  .strict();

export const subscriptionSchema = subscriptionCreateSchema
  .extend({
    id: uuidSchema,
    expectedCashback: nonNegativeMoneyStringSchema,
    expectedNet: moneyStringSchema,
    active: z.boolean(),
    rowVersion: z.number().int().positive(),
    cycles: z.array(subscriptionCycleSchema),
  })
  .strict();

const cycleEventBaseSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    currency: currencyCodeSchema,
    occurredAt: isoDateTimeSchema,
    economicDate: isoDateSchema,
  })
  .strict();

export const subscriptionChargeRequestSchema = cycleEventBaseSchema
  .extend({ categoryId: uuidSchema })
  .strict();

export const subscriptionCashbackRequestSchema = cycleEventBaseSchema
  .extend({
    targetAccountId: uuidSchema,
    targetKind: z.enum(["bank", "cash", "card"]),
  })
  .strict();

export type SubscriptionCreate = z.infer<typeof subscriptionCreateSchema>;
export type SubscriptionChargeRequest = z.infer<
  typeof subscriptionChargeRequestSchema
>;
export type SubscriptionCashbackRequest = z.infer<
  typeof subscriptionCashbackRequestSchema
>;
