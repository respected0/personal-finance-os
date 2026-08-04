import { z } from "zod";
import {
  expenseCommandSchema,
  incomeCommandSchema,
  transferCommandSchema,
} from "./transaction-command.js";
import {
  isoDateSchema,
  isoDateTimeSchema,
  moneyStringSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives.js";

export const balanceSnapshotCreateSchema = z
  .object({
    observedAt: isoDateTimeSchema,
    statedBalance: moneyStringSchema,
  })
  .strict();

export const balanceSnapshotSchema = balanceSnapshotCreateSchema
  .omit({ statedBalance: true })
  .extend({
    id: uuidSchema,
    accountId: uuidSchema,
    statedBalance: moneyStringSchema,
    calculatedBalance: moneyStringSchema,
    difference: moneyStringSchema,
    status: z.enum(["open", "resolved", "ignored"]),
  })
  .strict();

export const reconciliationCreateSchema = z
  .object({
    accountId: uuidSchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    snapshotIds: z.array(uuidSchema).min(1).max(366),
  })
  .strict()
  .refine((value) => value.periodStart <= value.periodEnd, {
    path: ["periodEnd"],
    message: "periodEnd must not be before periodStart",
  });

export const reconciliationMissingCommandSchema = z.discriminatedUnion("type", [
  expenseCommandSchema,
  incomeCommandSchema,
  transferCommandSchema,
]);

const resolutionBase = {
  itemId: uuidSchema,
  reason: z.string().trim().min(1).max(500),
};

export const reconciliationResolutionSchema = z.discriminatedUnion(
  "resolutionType",
  [
    z
      .object({
        ...resolutionBase,
        resolutionType: z.literal("accepted"),
      })
      .strict(),
    z
      .object({
        ...resolutionBase,
        resolutionType: z.literal("adjustment"),
        fxRate: positiveDecimalStringSchema.optional(),
      })
      .strict(),
    z
      .object({
        ...resolutionBase,
        resolutionType: z.literal("missing_transaction"),
        command: reconciliationMissingCommandSchema,
      })
      .strict(),
  ],
);

export const reconciliationItemSchema = z
  .object({
    id: uuidSchema,
    snapshot: balanceSnapshotSchema,
    resolutionType: z
      .enum(["missing_transaction", "adjustment", "accepted"])
      .nullable(),
    transactionId: uuidSchema.nullable(),
    resolvedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const reconciliationSessionSchema = z
  .object({
    id: uuidSchema,
    accountId: uuidSchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    status: z.enum(["open", "resolved"]),
    unresolvedCount: z.number().int().nonnegative(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
    items: z.array(reconciliationItemSchema),
  })
  .strict();

export type BalanceSnapshotCreate = z.infer<typeof balanceSnapshotCreateSchema>;
export type ReconciliationCreate = z.infer<typeof reconciliationCreateSchema>;
export type ReconciliationResolution = z.infer<
  typeof reconciliationResolutionSchema
>;
