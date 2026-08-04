import { z } from "zod";
import {
  isoDateSchema,
  isoDateTimeSchema,
  moneyStringSchema,
  uuidSchema,
} from "./primitives.js";

export const monthlyPeriodSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

export const monthlyReportQuerySchema = z
  .object({
    version: z
      .union([z.literal("latest"), z.number().int().positive()])
      .default("latest"),
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.version === "latest" || (!value.accountId && !value.categoryId),
    {
      message: "Stored versions are canonical unfiltered monthly reports",
      path: ["version"],
    },
  );

export const monthlyReportVersionCreateSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

const breakdownSchema = z
  .object({
    categoryId: uuidSchema.nullable(),
    income: moneyStringSchema,
    grossExpense: moneyStringSchema,
    refunds: moneyStringSchema,
    netExpense: moneyStringSchema,
  })
  .strict();

const trendSchema = z
  .object({
    date: isoDateSchema,
    income: moneyStringSchema,
    grossExpense: moneyStringSchema,
    refunds: moneyStringSchema,
    netExpense: moneyStringSchema,
    savings: moneyStringSchema,
  })
  .strict();

export const monthlyReportSchema = z
  .object({
    id: uuidSchema.nullable(),
    period: monthlyPeriodSchema,
    version: z.number().int().positive().nullable(),
    source: z.enum(["live", "version"]),
    sourceHighWatermark: isoDateTimeSchema,
    engineVersion: z.literal("monthly-report-1.0.0"),
    ruleVersion: z.literal("monthly-rules-1.0.0"),
    generatedAt: isoDateTimeSchema,
    staleAt: isoDateTimeSchema.nullable(),
    staleReason: z.string().nullable(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    filters: z
      .object({
        accountId: uuidSchema.nullable(),
        categoryId: uuidSchema.nullable(),
      })
      .strict(),
    metrics: z
      .object({
        income: moneyStringSchema,
        grossExpense: moneyStringSchema,
        refunds: moneyStringSchema,
        netExpense: moneyStringSchema,
        outflow: moneyStringSchema,
        savings: moneyStringSchema,
        breakdown: z.array(breakdownSchema),
        trend: z.array(trendSchema),
      })
      .strict(),
  })
  .strict();

export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;
