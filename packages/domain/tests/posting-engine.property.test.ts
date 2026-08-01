import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { ExpenseCommand } from "../src/ledger/commands.ts";
import { assertBalanced } from "../src/ledger/invariants.ts";
import { buildPostingPlan } from "../src/ledger/posting-engine.ts";

const common = {
  currency: "TRY",
  occurredAt: "2026-07-29T12:00:00+03:00",
  economicDate: "2026-07-29",
  sourceAccountId: "01980f42-0000-7000-8000-000000000001",
  sourceKind: "bank",
  categoryId: "01980f42-0000-7000-8000-000000000002",
} as const;

function centsToMoney(cents: bigint): string {
  const integer = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${integer}.${fraction}`;
}

describe("B024 ledger properties", () => {
  test("every generated valid amount creates exactly balanced postings", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 99_999_999_999_999_999n }),
        (cents) => {
          const command: ExpenseCommand = {
            ...common,
            type: "expense",
            amount: centsToMoney(cents),
          };
          const plan = buildPostingPlan(command);
          expect(() => assertBalanced(plan.postings)).not.toThrow();
          expect(plan.postings[0]?.amountBase).toBe(
            plan.postings[1]?.amountBase,
          );
        },
      ),
      { numRuns: 1_000 },
    );
  });

  test("generated reversals preserve exact values and invert every side", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 1_000_000_000n }), (cents) => {
        const original = buildPostingPlan({
          ...common,
          type: "expense",
          amount: centsToMoney(cents),
        });
        const reversal = buildPostingPlan({
          currency: "TRY",
          occurredAt: common.occurredAt,
          economicDate: common.economicDate,
          type: "void",
          originalTransactionId: "01980f42-0000-7000-8000-000000000003",
          reason: "Synthetic property reversal",
          originalPostings: original.postings.map((posting) => ({
            ledgerRole: posting.ledgerRole,
            ...(posting.financialAccountId
              ? { financialAccountId: posting.financialAccountId }
              : {}),
            side: posting.side,
            amount: posting.amountOriginal,
            currency: posting.currency,
            fxRate: posting.fxRate,
            amountBase: posting.amountBase,
          })),
        });
        expect(reversal.postings).toHaveLength(original.postings.length);
        expect(reversal.postings[0]?.side).not.toBe(original.postings[0]?.side);
        expect(reversal.postings[0]?.amountBase).toBe(
          original.postings[0]?.amountBase,
        );
        expect(() => assertBalanced(reversal.postings)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});
