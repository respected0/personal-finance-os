import { z } from "zod";
import {
  isoDateSchema,
  isoDateTimeSchema,
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

export const expectedPaymentCreateSchema = z
  .object({
    source: z.string().trim().min(1).max(120),
    expectedAmount: positiveMoneyStringSchema,
    expectedDate: isoDateSchema,
    certaintyLevel: z.enum(["certain", "likely", "uncertain"]),
  })
  .strict();

export const expectedPaymentSchema = expectedPaymentCreateSchema
  .omit({ source: true })
  .extend({
    id: uuidSchema,
    source: z.string().min(1).max(120),
    status: z.enum(["expected", "overdue", "received", "cancelled"]),
    realizedTransactionId: uuidSchema.nullable(),
    rowVersion: z.number().int().positive(),
    accountingEffect: z
      .object({
        beforeRealizationIncome: z.literal("0.0000"),
        beforeRealizationNetWorth: z.literal("0.0000"),
        beforeRealizationInvestable: z.literal("0.0000"),
      })
      .strict(),
  })
  .strict();

export const expectedPaymentRealizeSchema = z
  .object({
    targetAccountId: uuidSchema,
    targetKind: z.enum(["bank", "cash"]),
    currency: z.literal("TRY"),
    occurredAt: isoDateTimeSchema,
    economicDate: isoDateSchema,
  })
  .strict();

export const investableRunCreateSchema = z
  .object({
    asOf: isoDateSchema,
    operatingBufferAmount: nonNegativeMoneyStringSchema,
  })
  .strict();

export const investableRunSchema = z
  .object({
    id: uuidSchema,
    asOf: isoDateSchema,
    sourceWatermark: isoDateTimeSchema,
    formulaVersion: z.literal("investable-formula-1.0.0"),
    policyVersion: z.literal("planning-policy-1.0.0"),
    liquidVerifiedAmount: moneyStringSchema,
    committedOutflowAmount: moneyStringSchema,
    operatingBufferAmount: moneyStringSchema,
    nearTermGoalReserveAmount: moneyStringSchema,
    excludedExpectedAmount: moneyStringSchema,
    excludedDoubtfulReceivableAmount: moneyStringSchema,
    canonicalInvestableAmount: moneyStringSchema,
    evidence: z
      .object({
        formula: z.literal(
          "max(0, liquid_verified - committed_outflow - operating_buffer - near_term_goal_reserve)",
        ),
        liquidSource: z.literal("posted active bank/cash/wallet balances"),
        committedOutflowSource: z.literal(
          "active budget remaining planned expense",
        ),
        goalReserveSource: z.literal(
          "active allocations for goals due within 90 days",
        ),
        expected: z
          .object({
            trackedAmount: moneyStringSchema,
            includedAmount: z.literal("0.0000"),
            reason: z.literal("not realized"),
          })
          .strict(),
        doubtfulReceivable: z
          .object({
            trackedAmount: moneyStringSchema,
            includedAmount: z.literal("0.0000"),
            reason: z.literal("planning policy excludes doubtful receivables"),
          })
          .strict(),
      })
      .strict(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export type ExpectedPaymentCreate = z.infer<typeof expectedPaymentCreateSchema>;
export type ExpectedPayment = z.infer<typeof expectedPaymentSchema>;
export type ExpectedPaymentRealize = z.infer<
  typeof expectedPaymentRealizeSchema
>;
export type InvestableRunCreate = z.infer<typeof investableRunCreateSchema>;
export type InvestableRun = z.infer<typeof investableRunSchema>;
