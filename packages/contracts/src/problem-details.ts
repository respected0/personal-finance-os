import { z } from "zod";
import { uuidSchema } from "./primitives.js";

const problemFieldSchema = z
  .object({
    field: z.string().min(1).max(120),
    code: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  })
  .strict();

export const problemDetailsSchema = z
  .object({
    type: z.string().min(1).default("about:blank"),
    title: z.string().min(1).max(160),
    status: z.number().int().min(400).max(599),
    detail: z.string().min(1).max(500).optional(),
    instance: z.string().min(1).optional(),
    code: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    request_id: uuidSchema,
    errors: z.array(problemFieldSchema).max(50).optional(),
  })
  .strict();

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
