import { describe, expect, test } from "vitest";
import { createApplicationLogger } from "../../../src/server/observability/logger.ts";
import { createProblemResponse } from "../../../src/server/observability/problem-response.ts";

describe("B009 problem details correlation", () => {
  test("uses the same request id in response and log metadata", () => {
    const requestId = "018f6f4e-7f35-7e34-8000-000000000011";
    const response = createProblemResponse({
      status: 422,
      code: "validation_error",
      title: "Request fields are invalid",
      requestId,
    });
    const logger = createApplicationLogger({
      environment: "test",
      destination: { write: () => true },
    });
    const event = logger.info({
      event: "request.rejected",
      request_id: requestId,
      outcome: "expected_error",
      error_class: "validation_error",
    });

    expect(response.headers["x-request-id"]).toBe(requestId);
    expect(response.body.request_id).toBe(requestId);
    expect(event.request_id).toBe(requestId);
  });

  test("rejects invalid request ids instead of leaking caller values", () => {
    expect(() =>
      createProblemResponse({
        status: 403,
        code: "forbidden",
        title: "Resource is unavailable",
        requestId: "person@example.test",
      }),
    ).toThrow(/request_id/);
  });
});
