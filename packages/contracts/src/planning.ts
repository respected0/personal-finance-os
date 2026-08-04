import { z } from "zod";
import {
  isoDateSchema,
  moneyStringSchema,
  nonNegativeMoneyStringSchema,
  positiveMoneyStringSchema,
  uuidSchema,
} from "./primitives.js";

export const budgetPeriodSchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

export const budgetLineInputSchema = z
  .object({
    categoryId: uuidSchema,
    plannedAmount: nonNegativeMoneyStringSchema,
    rolloverPolicy: z.enum(["none", "carry_remaining"]).default("none"),
    warningThreshold: z
      .string()
      .regex(/^0\.\d{1,4}$|^1\.0{1,4}$/)
      .default("0.8000"),
  })
  .strict();

export const budgetPutSchema = z
  .object({
    status: z.enum(["draft", "active", "archived"]).default("active"),
    lines: z.array(budgetLineInputSchema).max(250),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, line] of value.lines.entries()) {
      if (ids.has(line.categoryId)) {
        context.addIssue({
          code: "custom",
          message: "A category can appear only once in a monthly budget.",
          path: ["lines", index, "categoryId"],
        });
      }
      ids.add(line.categoryId);
    }
  });

export const budgetLineSchema = budgetLineInputSchema.extend({
  id: uuidSchema,
  actualAmount: moneyStringSchema,
  remainingAmount: moneyStringSchema,
  forecastAmount: moneyStringSchema,
  thresholdReached: z.boolean(),
});

export const budgetSchema = z
  .object({
    id: uuidSchema,
    period: budgetPeriodSchema,
    status: z.enum(["draft", "active", "archived"]),
    rowVersion: z.number().int().positive(),
    actualFormula: z.literal("posted expense debits minus expense credits"),
    forecastFormula: z.literal(
      "actual / elapsed period days * total period days",
    ),
    lines: z.array(budgetLineSchema),
  })
  .strict();

export const goalCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    targetAmount: positiveMoneyStringSchema,
    targetDate: isoDateSchema,
    priority: z.number().int().min(1).max(5),
    riskLevel: z.enum(["low", "medium", "high"]),
  })
  .strict();

export const goalAllocationCreateSchema = z
  .object({
    accountId: uuidSchema,
    allocatedValue: positiveMoneyStringSchema,
    effectiveFrom: isoDateSchema,
  })
  .strict();

export const goalAllocationSchema = goalAllocationCreateSchema.extend({
  id: uuidSchema,
  effectiveTo: isoDateSchema.nullable(),
  rowVersion: z.number().int().positive(),
});

export const goalSchema = goalCreateSchema
  .omit({ title: true })
  .extend({
    id: uuidSchema,
    title: z.string().min(1).max(120),
    status: z.enum(["active", "completed", "archived"]),
    rowVersion: z.number().int().positive(),
    allocatedValue: moneyStringSchema,
    actualContributionAmount: moneyStringSchema,
    progressAmount: moneyStringSchema,
    remainingAmount: moneyStringSchema,
    ledgerPostingCount: z.literal(0),
    allocations: z.array(goalAllocationSchema),
  })
  .strict();

export type BudgetPut = z.infer<typeof budgetPutSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type GoalCreate = z.infer<typeof goalCreateSchema>;
export type GoalAllocationCreate = z.infer<typeof goalAllocationCreateSchema>;
export type Goal = z.infer<typeof goalSchema>;
