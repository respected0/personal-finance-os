import { describe, expect, test } from "vitest";
import {
  createRequestContext,
  elapsedMilliseconds,
} from "../../../src/server/observability/request-context.ts";

describe("B009 request context", () => {
  test("propagates a valid request id", () => {
    const requestId = "018f6f4e-7f35-7e34-8000-000000000010";
    const context = createRequestContext({ get: () => requestId }, 1_000);

    expect(context.request_id).toBe(requestId);
    expect(elapsedMilliseconds(context, 1_025)).toBe(25);
  });

  test("replaces invalid caller input with a UUID", () => {
    const context = createRequestContext({ get: () => "email@example.test" });
    expect(context.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
