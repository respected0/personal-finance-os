import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  canonicalDecimalStringSchema,
  problemDetailsSchema,
} from "../../packages/contracts/src/index.ts";

describe("B005/P0-A2 contract boundary", () => {
  test("exposes only approved foundation, ledger, daily-core and card paths", async () => {
    const specification = await readFile(
      "packages/contracts/openapi/openapi.yaml",
      "utf8",
    );
    const ledgerComponents = await readFile(
      "packages/contracts/openapi/components/ledger.yaml",
      "utf8",
    );
    const dailyCoreComponents = await readFile(
      "packages/contracts/openapi/components/daily-core.yaml",
      "utf8",
    );
    const cardComponents = await readFile(
      "packages/contracts/openapi/components/cards.yaml",
      "utf8",
    );

    expect(specification).toContain("openapi: 3.1.0");
    expect(specification).toContain("/api/v1/health:");
    expect(specification).toContain("application/problem+json");
    expect(specification).toContain("request_id");
    const paths = [...specification.matchAll(/^  (\/api\/v1\/[^:]+):$/gmu)].map(
      ([, path]) => path,
    );
    expect(paths).toEqual([
      "/api/v1/health",
      "/api/v1/transactions/preview",
      "/api/v1/transactions",
      "/api/v1/transactions/{transactionId}/void",
      "/api/v1/transactions/{transactionId}",
      "/api/v1/transactions/{transactionId}/revise",
      "/api/v1/institutions",
      "/api/v1/accounts",
      "/api/v1/accounts/{accountId}/opening-balance",
      "/api/v1/accounts/{accountId}",
      "/api/v1/accounts/{accountId}/balance",
      "/api/v1/categories",
      "/api/v1/cards",
      "/api/v1/cards/{cardId}/statements",
      "/api/v1/cards/{cardId}/payments/preview",
    ]);
    expect(specification).not.toMatch(
      /\/api\/v1\/(budgets|investments|ledger|reconciliations|reports)/u,
    );
    expect(ledgerComponents).not.toMatch(
      /\b(userId|user_id|originalPostings|outstandingAmount|availableQuantity|costBasis|alreadyRealized)\b/u,
    );
    expect(dailyCoreComponents).not.toMatch(
      /\b(userId|user_id|name_enc|name_key_id|name_nonce|name_auth_tag)\b/u,
    );
    expect(cardComponents).not.toMatch(/\b(userId|user_id)\b/u);
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
