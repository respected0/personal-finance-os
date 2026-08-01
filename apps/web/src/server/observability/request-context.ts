import { isRequestId } from "./redaction.js";

export interface HeaderReader {
  get(name: string): string | null;
}

export interface RequestContext {
  request_id: string;
  started_at_ms: number;
}

function newRequestId() {
  return globalThis.crypto.randomUUID();
}

export function createRequestContext(
  headers?: HeaderReader,
  now = Date.now(),
): RequestContext {
  const candidate = headers?.get("x-request-id");
  return {
    request_id: isRequestId(candidate) ? candidate : newRequestId(),
    started_at_ms: now,
  };
}

export function elapsedMilliseconds(context: RequestContext, now = Date.now()) {
  return Math.max(0, now - context.started_at_ms);
}
