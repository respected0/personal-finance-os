import { z } from "zod";

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.date();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const canonicalDecimalStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)\.\d+$/);
export const moneyStringSchema = canonicalDecimalStringSchema;

export type CanonicalDecimalString = z.infer<
  typeof canonicalDecimalStringSchema
>;
export type MoneyString = z.infer<typeof moneyStringSchema>;
