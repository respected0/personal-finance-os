import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateTimeSchema,
  positiveDecimalStringSchema,
  uuidSchema,
} from "./primitives.js";

export const investmentInstrumentInputSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Z0-9._-]{1,24}$/),
    name: z.string().trim().min(1).max(120),
    instrumentType: z.enum([
      "fund",
      "stock",
      "bond",
      "bank_gold",
      "crypto",
      "other",
    ]),
    unit: z.enum(["unit", "gram"]),
    currency: currencyCodeSchema,
  })
  .strict();

export const marketPriceCreateSchema = z
  .object({
    instrument: investmentInstrumentInputSchema,
    price: positiveDecimalStringSchema,
    priceAt: isoDateTimeSchema,
    sourceType: z.enum(["manual", "reference_fixture"]).default("manual"),
    isEstimated: z.boolean().default(false),
  })
  .strict();

export const investmentInstrumentSchema = investmentInstrumentInputSchema
  .extend({ id: uuidSchema, active: z.boolean() })
  .strict();
export const marketPriceSchema = z
  .object({
    id: uuidSchema,
    instrument: investmentInstrumentSchema,
    price: positiveDecimalStringSchema,
    priceAt: isoDateTimeSchema,
    sourceType: z.enum(["manual", "reference_fixture"]),
    isEstimated: z.boolean(),
  })
  .strict();

export type MarketPriceCreate = z.infer<typeof marketPriceCreateSchema>;
export type MarketPrice = z.infer<typeof marketPriceSchema>;
