const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeNamePattern = /^[a-z][a-z0-9_.:-]{1,95}$/;

export const forbiddenLogFields = [
  "authorization",
  "body",
  "cookie",
  "description",
  "email",
  "headers",
  "key",
  "amount",
  "query",
  "raw",
  "secret",
  "token",
  "totp",
] as const;

export interface UnsafeLogEvent {
  event?: unknown;
  request_id?: unknown;
  outcome?: unknown;
  error_class?: unknown;
  duration_ms?: unknown;
  [key: string]: unknown;
}

export interface SafeLogEvent {
  event: string;
  request_id: string;
  outcome: "success" | "expected_error" | "server_error";
  error_class?: string;
  duration_ms?: number;
}

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && requestIdPattern.test(value);
}

function safeName(value: unknown, fallback: string) {
  return typeof value === "string" && safeNamePattern.test(value)
    ? value
    : fallback;
}

function safeOutcome(value: unknown): SafeLogEvent["outcome"] {
  return value === "success" ||
    value === "expected_error" ||
    value === "server_error"
    ? value
    : "server_error";
}

export function sanitizeLogEvent(input: UnsafeLogEvent): SafeLogEvent {
  const record: SafeLogEvent = {
    event: safeName(input.event, "request.failed"),
    request_id: isRequestId(input.request_id)
      ? input.request_id
      : "00000000-0000-4000-8000-000000000000",
    outcome: safeOutcome(input.outcome),
  };

  if (input.error_class !== undefined) {
    record.error_class = safeName(input.error_class, "redacted_error");
  }
  if (
    typeof input.duration_ms === "number" &&
    Number.isFinite(input.duration_ms) &&
    input.duration_ms >= 0
  ) {
    record.duration_ms = Math.round(input.duration_ms);
  }

  return record;
}
