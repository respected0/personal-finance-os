export const sessionPolicy = Object.freeze({
  idleTimeoutMs: 30 * 60 * 1_000,
  absoluteAal2AgeMs: 12 * 60 * 60 * 1_000,
  sensitiveActionProofAgeMs: 5 * 60 * 1_000,
});

export interface Aal2SessionEvidence {
  aal: "aal1" | "aal2";
  establishedAtMs: number;
  lastActivityAtMs: number;
  nowMs: number;
}

export type SessionDecision =
  | { allowed: true; reason: "valid_aal2" }
  | {
      allowed: false;
      reason: "mfa_required" | "idle_timeout" | "absolute_timeout";
    };

export function evaluateAal2Session(
  evidence: Aal2SessionEvidence,
): SessionDecision {
  if (evidence.aal !== "aal2") {
    return { allowed: false, reason: "mfa_required" };
  }
  if (
    evidence.nowMs - evidence.establishedAtMs >=
    sessionPolicy.absoluteAal2AgeMs
  ) {
    return { allowed: false, reason: "absolute_timeout" };
  }
  if (
    evidence.nowMs - evidence.lastActivityAtMs >=
    sessionPolicy.idleTimeoutMs
  ) {
    return { allowed: false, reason: "idle_timeout" };
  }
  return { allowed: true, reason: "valid_aal2" };
}

export function hasFreshSensitiveActionProof(
  lastTotpVerifiedAtMs: number | undefined,
  nowMs: number,
) {
  return (
    lastTotpVerifiedAtMs !== undefined &&
    nowMs - lastTotpVerifiedAtMs >= 0 &&
    nowMs - lastTotpVerifiedAtMs < sessionPolicy.sensitiveActionProofAgeMs
  );
}
