import { describe, expect, test } from "vitest";
import {
  evaluateAal2Session,
  hasFreshSensitiveActionProof,
  sessionPolicy,
} from "../../../src/server/auth/policy.ts";

describe("B007 session policy", () => {
  const now = 1_800_000_000_000;

  test("allows a valid AAL2 session without repeating TOTP", () => {
    expect(
      evaluateAal2Session({
        aal: "aal2",
        establishedAtMs: now - sessionPolicy.absoluteAal2AgeMs + 1,
        lastActivityAtMs: now - sessionPolicy.idleTimeoutMs + 1,
        nowMs: now,
      }),
    ).toEqual({ allowed: true, reason: "valid_aal2" });
  });

  test("rejects AAL1, 30-minute idle, and 12-hour absolute boundaries", () => {
    expect(
      evaluateAal2Session({
        aal: "aal1",
        establishedAtMs: now,
        lastActivityAtMs: now,
        nowMs: now,
      }).reason,
    ).toBe("mfa_required");
    expect(
      evaluateAal2Session({
        aal: "aal2",
        establishedAtMs: now - 1,
        lastActivityAtMs: now - sessionPolicy.idleTimeoutMs,
        nowMs: now,
      }).reason,
    ).toBe("idle_timeout");
    expect(
      evaluateAal2Session({
        aal: "aal2",
        establishedAtMs: now - sessionPolicy.absoluteAal2AgeMs,
        lastActivityAtMs: now,
        nowMs: now,
      }).reason,
    ).toBe("absolute_timeout");
  });

  test("requires sensitive proof to be younger than five minutes", () => {
    expect(hasFreshSensitiveActionProof(now - 299_999, now)).toBe(true);
    expect(hasFreshSensitiveActionProof(now - 300_000, now)).toBe(false);
    expect(hasFreshSensitiveActionProof(undefined, now)).toBe(false);
  });
});
