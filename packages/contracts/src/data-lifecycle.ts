import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./primitives.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const sensitiveStepUpSchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();

export const dataExportCreateSchema = z
  .object({
    format: z.enum(["csv", "full_fidelity"]),
    scope: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
    passphrase: z.string().min(12).max(256).optional(),
  })
  .strict()
  .refine((value) => value.format === "csv" || value.passphrase !== undefined, {
    message: "Full-fidelity export requires a recovery passphrase",
    path: ["passphrase"],
  });

export const dataExportSchema = z
  .object({
    id: uuidSchema,
    format: z.enum(["csv", "full_fidelity"]),
    status: z.enum(["completed", "expired"]),
    scope: z.array(z.string()),
    snapshotWatermark: isoDateTimeSchema,
    schemaVersion: z.literal(17),
    checksum: sha256Schema,
    expiresAt: isoDateTimeSchema,
    contentBase64: z.string().nullable(),
    encryption: z
      .object({
        scheme: z.literal("AES-256-GCM"),
        kdf: z.literal("Argon2id"),
        keysetReference: z.string().min(1),
        parameters: z
          .object({
            memoryKiB: z.literal(65_536),
            iterations: z.literal(3),
            parallelism: z.literal(1),
          })
          .strict(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const restoreValidateSchema = z
  .object({
    archiveBase64: z.string().min(1),
    checksum: sha256Schema,
    passphrase: z.string().min(12).max(256),
  })
  .strict();

export const restoreApplySchema = z
  .object({ confirmationToken: z.string().min(20).max(200) })
  .strict();

export const accountDeletionCreateSchema = z
  .object({ confirmation: z.literal("HESABIMI SIL") })
  .strict();

export const accountDeletionSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(["pending", "cancelled"]),
    requestedAt: isoDateTimeSchema,
    scheduledFor: isoDateTimeSchema,
    backupExpiresAt: isoDateTimeSchema,
  })
  .strict();

export type DataExportCreate = z.infer<typeof dataExportCreateSchema>;
export type DataExport = z.infer<typeof dataExportSchema>;
export type RestoreValidate = z.infer<typeof restoreValidateSchema>;
export type AccountDeletion = z.infer<typeof accountDeletionSchema>;
