import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./primitives.js";
import { monthlyPeriodSchema } from "./monthly-report.js";

export const monthlyReviewChecklistSchema = z
  .object({
    report: z.boolean(),
    budget: z.boolean(),
    goals: z.boolean(),
    investments: z.boolean(),
    recommendations: z.boolean(),
  })
  .strict();
export const monthlyReviewCreateSchema = z
  .object({
    period: monthlyPeriodSchema,
    reportVersionId: uuidSchema,
    investableRunId: uuidSchema,
    checklist: monthlyReviewChecklistSchema,
    decision: z.enum([
      "hold",
      "adjust_budget",
      "adjust_goal",
      "review_investment",
    ]),
  })
  .strict();
export const monthlyReviewSchema = monthlyReviewCreateSchema
  .extend({
    id: uuidSchema,
    reviewVersion: z.literal("monthly-review-1.0.0"),
    completedAt: isoDateTimeSchema,
  })
  .strict();
export type MonthlyReviewCreate = z.infer<typeof monthlyReviewCreateSchema>;
export type MonthlyReview = z.infer<typeof monthlyReviewSchema>;
