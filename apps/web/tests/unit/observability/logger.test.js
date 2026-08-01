import { Writable } from "node:stream";
import { describe, expect, test } from "vitest";
import {
  createApplicationLogger,
  usesPrettyOutput,
} from "../../../src/server/observability/logger.ts";
import { forbiddenLogFields } from "../../../src/server/observability/redaction.ts";

function captureLog() {
  const lines = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { destination, lines };
}

describe("B009 structured redacted logging", () => {
  test("keeps pretty output local-only", () => {
    expect(usesPrettyOutput("local")).toBe(true);
    expect(usesPrettyOutput("test")).toBe(false);
    expect(usesPrettyOutput("production")).toBe(false);
  });

  test("emits allowlisted JSON and leaks none of the sensitive canaries", () => {
    const { destination, lines } = captureLog();
    const logger = createApplicationLogger({
      environment: "test",
      destination,
    });
    const canaries = [
      "person@example.test",
      "token_canary_7gH2kLm9",
      "654321",
      "10000.00",
      "private-description-canary",
      "base64-key-material-canary",
    ];

    logger.error({
      event: "request.failed",
      request_id: "018f6f4e-7f35-7e34-8000-000000000009",
      outcome: "server_error",
      error_class: "unexpected_error",
      duration_ms: 12.4,
      email: canaries[0],
      token: canaries[1],
      totp: canaries[2],
      amount: canaries[3],
      description: canaries[4],
      key: canaries[5],
      body: { raw: canaries.join("|") },
    });

    const output = lines.join("");
    for (const canary of canaries) {
      expect(output).not.toContain(canary);
    }

    const record = JSON.parse(output);
    expect(record).toMatchObject({
      level: "error",
      event: "request.failed",
      request_id: "018f6f4e-7f35-7e34-8000-000000000009",
      outcome: "server_error",
      error_class: "unexpected_error",
      duration_ms: 12,
    });
    for (const field of forbiddenLogFields) {
      expect(record).not.toHaveProperty(field);
    }
    expect(Object.keys(record).sort()).toEqual(
      [
        "duration_ms",
        "error_class",
        "event",
        "level",
        "outcome",
        "request_id",
        "time",
      ].sort(),
    );
  });
});
