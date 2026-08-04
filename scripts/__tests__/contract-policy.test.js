import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  canonicalDecimalStringSchema,
  problemDetailsSchema,
} from "../../packages/contracts/src/index.ts";

describe("B005/P0-B1 contract boundary", () => {
  test("exposes only approved foundation through planning paths", async () => {
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
    const subscriptionComponents = await readFile(
      "packages/contracts/openapi/components/subscriptions.yaml",
      "utf8",
    );
    const sharingComponents = await readFile(
      "packages/contracts/openapi/components/sharing.yaml",
      "utf8",
    );
    const reconciliationComponents = await readFile(
      "packages/contracts/openapi/components/reconciliation.yaml",
      "utf8",
    );
    const monthlyReportComponents = await readFile(
      "packages/contracts/openapi/components/monthly-reports.yaml",
      "utf8",
    );
    const dataLifecycleComponents = await readFile(
      "packages/contracts/openapi/components/data-lifecycle.yaml",
      "utf8",
    );
    const planningComponents = await readFile(
      "packages/contracts/openapi/components/planning.yaml",
      "utf8",
    );
    const investmentComponents = await readFile(
      "packages/contracts/openapi/components/investment.yaml",
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
      "/api/v1/accounts/{accountId}/snapshots",
      "/api/v1/reconciliations",
      "/api/v1/reconciliations/{reconciliationId}/resolve",
      "/api/v1/reports/monthly/{period}",
      "/api/v1/reports/monthly/{period}/versions",
      "/api/v1/categories",
      "/api/v1/cards",
      "/api/v1/cards/{cardId}/statements",
      "/api/v1/cards/{cardId}/payments/preview",
      "/api/v1/subscriptions",
      "/api/v1/subscription-cycles/{cycleId}/charge",
      "/api/v1/subscription-cycles/{cycleId}/cashback",
      "/api/v1/counterparties",
      "/api/v1/shared-expenses/preview",
      "/api/v1/shared-expenses",
      "/api/v1/receivables",
      "/api/v1/receivables/{receivableId}/settlements",
      "/api/v1/auth/step-up",
      "/api/v1/exports",
      "/api/v1/exports/{exportId}",
      "/api/v1/restores/validate",
      "/api/v1/restores/{validationId}/apply",
      "/api/v1/account/deletion-requests",
      "/api/v1/account/deletion-requests/{deletionRequestId}",
      "/api/v1/budgets/{period}",
      "/api/v1/goals",
      "/api/v1/goals/{goalId}/allocations",
      "/api/v1/expected-payments",
      "/api/v1/expected-payments/{expectedPaymentId}/realize",
      "/api/v1/planning/investable-runs",
      "/api/v1/recommendations",
      "/api/v1/recommendation-settings/{rule}",
      "/api/v1/recommendations/{recommendationId}/feedback",
      "/api/v1/monthly-reviews",
      "/api/v1/market-prices",
      "/api/v1/investment-trades/preview",
      "/api/v1/investment-trades",
      "/api/v1/portfolio",
    ]);
    expect(specification).not.toMatch(
      /\/api\/v1\/(investments|ledger)(?:\/|:)/u,
    );
    expect(ledgerComponents).not.toMatch(
      /\b(userId|user_id|originalPostings|outstandingAmount|availableQuantity|costBasis|alreadyRealized)\b/u,
    );
    expect(dailyCoreComponents).not.toMatch(
      /\b(userId|user_id|name_enc|name_key_id|name_nonce|name_auth_tag)\b/u,
    );
    expect(cardComponents).not.toMatch(/\b(userId|user_id)\b/u);
    expect(subscriptionComponents).not.toMatch(/\b(userId|user_id)\b/u);
    expect(sharingComponents).not.toMatch(
      /\b(userId|user_id|name_enc|name_key_id|name_nonce|name_auth_tag)\b/u,
    );
    expect(reconciliationComponents).not.toMatch(
      /\b(userId|user_id|reason_enc|note_enc|originalPostings)\b/u,
    );
    expect(monthlyReportComponents).not.toMatch(
      /\b(userId|user_id|generation_reason_enc|generation_reason_key_id)\b/u,
    );
    expect(dataLifecycleComponents).not.toMatch(
      /\b(userId|user_id|archive_ciphertext|confirmation_token_hash|subject_hash)\b/u,
    );
    expect(dataLifecycleComponents).toContain("Argon2id");
    expect(dataLifecycleComponents).toContain("AES-256-GCM");
    expect(planningComponents).not.toMatch(
      /\b(userId|user_id|title_enc|title_key_id|title_nonce|title_auth_tag)\b/u,
    );
    expect(investmentComponents).not.toMatch(
      /\b(userId|user_id|ownerId|owner_id)\b/u,
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
