import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  canonicalDecimalStringSchema,
  problemDetailsSchema,
} from "../../packages/contracts/src/index.ts";

describe("B005 contract foundation", () => {
  test("keeps the OpenAPI surface foundation-only", async () => {
    const specification = await readFile(
      "packages/contracts/openapi/openapi.yaml",
      "utf8",
    );

    expect(specification).toContain("openapi: 3.1.0");
    expect(specification).toContain("/api/v1/health:");
    expect(specification).toContain("application/problem+json");
    expect(specification).toContain("request_id");
    expect(specification).not.toMatch(
      /\/api\/v1\/(transactions|accounts|cards|budgets|investments|ledger)/,
    );
  });

  test("accepts canonical decimal strings and rejects JSON numbers", () => {
    expect(canonicalDecimalStringSchema.parse("10000.00")).toBe("10000.00");
    expect(canonicalDecimalStringSchema.parse("1.31")).toBe("1.31");
    expect(() => canonicalDecimalStringSchema.parse(1.31)).toThrow();
    expect(() => canonicalDecimalStringSchema.parse("01.31")).toThrow();
  });

  test("requires a non-enumerating problem details request id", () => {
    const problem = problemDetailsSchema.parse({
      type: "about:blank",
      title: "Request could not be completed",
      status: 403,
      code: "forbidden",
      request_id: "018f6f4e-7f35-7e34-8000-000000000001",
    });

    expect(problem.request_id).toBe("018f6f4e-7f35-7e34-8000-000000000001");
    expect(() =>
      problemDetailsSchema.parse({
        type: "about:blank",
        title: "Forbidden for user@example.test",
        status: 403,
        code: "Forbidden",
        request_id: "not-a-uuid",
      }),
    ).toThrow();
  });
});
