import { z } from "zod";

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.date();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const canonicalDecimalStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)\.\d+$/);
export const moneyStringSchema = canonicalDecimalStringSchema;
export const positiveMoneyStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,14})\.\d{1,4}$/)
  .refine((value) => !/^0\.0+$/u.test(value), "Amount must be positive");
export const nonNegativeMoneyStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,14})\.\d{1,4}$/);
export const unsignedDecimalStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})$/);
export const positiveDecimalStringSchema = unsignedDecimalStringSchema.refine(
  (value) => !/^0(?:\.0+)?$/u.test(value),
  "Value must be positive",
);
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export type CanonicalDecimalString = z.infer<
  typeof canonicalDecimalStringSchema
>;
export type MoneyString = z.infer<typeof moneyStringSchema>;
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
