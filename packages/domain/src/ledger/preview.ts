import { createHash } from "node:crypto";
import type { TransactionCommand } from "./commands.js";
import { buildPostingPlan, type PostingPlan } from "./posting-engine.js";

export interface TransactionPreview extends PostingPlan {
  readonly previewHash: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function hashCanonicalValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function canonicalCommandJson(command: TransactionCommand): string {
  return JSON.stringify(canonicalize(command));
}

export function hashTransactionCommand(command: TransactionCommand): string {
  return hashCanonicalValue(command);
}

export function previewTransaction(
  command: TransactionCommand,
): TransactionPreview {
  const plan = buildPostingPlan(command);
  return {
    ...plan,
    previewHash: createHash("sha256")
      .update(
        JSON.stringify(
          canonicalize({ command: canonicalCommandJson(command), plan }),
        ),
      )
      .digest("hex"),
  };
}
