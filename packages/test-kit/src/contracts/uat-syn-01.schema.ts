import { z } from "zod";

const canonicalPositiveDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.\d+$/u);

const fixedDateSchema = z.iso.date();
const fixedDateTimeSchema = z.iso.datetime({ offset: true });

export const uatSyn01Schema = z
  .object({
    fixture_id: z.literal("UAT-SYN-01"),
    schema_version: z.literal("1.0.0"),
    timezone: z.literal("Europe/Istanbul"),
    as_of_date: fixedDateSchema,
    fixed_at: fixedDateTimeSchema,
    owner: z
      .object({
        id: z.uuid(),
        label: z.literal("Synthetic UAT owner"),
      })
      .strict(),
    assets: z.array(
      z
        .object({
          id: z.uuid(),
          owner_id: z.uuid(),
          asset_type: z.literal("gold"),
          custody: z.enum(["bank", "physical"]),
          active: z.boolean(),
          quantity_grams: canonicalPositiveDecimalSchema,
          unit_price_try: canonicalPositiveDecimalSchema,
          price_date: fixedDateSchema,
          price_source: z.literal("synthetic-reference"),
        })
        .strict(),
    ),
    receivables: z.array(
      z
        .object({
          id: z.uuid(),
          owner_id: z.uuid(),
          status: z.literal("doubtful"),
          nominal_amount_try: canonicalPositiveDecimalSchema,
          include_in_net_worth: z.boolean(),
          include_in_planning: z.boolean(),
          as_of_date: fixedDateSchema,
        })
        .strict(),
    ),
    goals: z.array(
      z
        .object({
          id: z.uuid(),
          owner_id: z.uuid(),
          linked_asset_id: z.uuid().nullable(),
          target_amount_try: canonicalPositiveDecimalSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type UatSyn01Fixture = z.infer<typeof uatSyn01Schema>;
