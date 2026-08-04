import { z } from "zod";
import {
  isoDateSchema,
  isoDateTimeSchema,
  moneyStringSchema,
  nonNegativeMoneyStringSchema,
  uuidSchema,
} from "./primitives.js";

export const recommendationRuleCodeSchema = z
  .string()
  .regex(/^R-(?:0[1-9]|1[0-5])$/);
export const recommendationPeriodSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
export const recommendationStatusSchema = z.enum([
  "active",
  "later",
  "dismissed",
  "done",
]);
export const recommendationQuerySchema = z
  .object({
    period: recommendationPeriodSchema.optional(),
    status: recommendationStatusSchema.optional(),
  })
  .strict();
export const recommendationSettingPutSchema = z
  .object({
    enabled: z.boolean(),
    threshold: nonNegativeMoneyStringSchema,
    effectiveFrom: isoDateSchema,
    effectiveTo: isoDateSchema.nullable().optional(),
  })
  .strict();
export const recommendationSettingSchema = recommendationSettingPutSchema
  .extend({
    id: uuidSchema,
    ruleCode: recommendationRuleCodeSchema,
    ruleVersion: z.number().int().positive(),
    effectiveTo: isoDateSchema.nullable(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const recommendationSchema = z
  .object({
    id: uuidSchema,
    runId: uuidSchema,
    investableRunId: uuidSchema,
    ruleCode: recommendationRuleCodeSchema,
    ruleVersion: z.number().int().positive(),
    period: isoDateSchema,
    sourceWatermark: isoDateTimeSchema,
    engineVersion: z.literal("recommendation-engine-1.0.0"),
    usedThreshold: nonNegativeMoneyStringSchema,
    observedAmount: nonNegativeMoneyStringSchema,
    differenceAmount: moneyStringSchema,
    impactAmount: nonNegativeMoneyStringSchema,
    alternativeAmount: nonNegativeMoneyStringSchema,
    status: recommendationStatusSchema,
    cooldownUntil: isoDateTimeSchema.nullable(),
    evidence: z
      .object({
        period: isoDateSchema,
        threshold: nonNegativeMoneyStringSchema,
        observedAmount: nonNegativeMoneyStringSchema,
        differenceAmount: moneyStringSchema,
        alternativeAmount: nonNegativeMoneyStringSchema,
        investableRunId: uuidSchema,
        formula: z.literal(
          "max(0, canonical_investable_amount - scenario_reserve_amount)",
        ),
        sourceWatermark: isoDateTimeSchema,
      })
      .strict(),
  })
  .strict();

export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
export type RecommendationSettingPut = z.infer<
  typeof recommendationSettingPutSchema
>;
export type RecommendationSetting = z.infer<typeof recommendationSettingSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
