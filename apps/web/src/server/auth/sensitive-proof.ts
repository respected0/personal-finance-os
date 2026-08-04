import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hasFreshSensitiveActionProof, sessionPolicy } from "./policy";

export const sensitiveProofCookieName = "pfos_sensitive_proof";

interface SensitiveProofPayload {
  readonly userId: string;
  readonly verifiedAtMs: number;
  readonly nonce: string;
}

function signature(payload: string, key: Uint8Array): Buffer {
  return createHmac("sha256", key)
    .update(`pfos:sensitive-proof:v1:${payload}`)
    .digest();
}

export function createSensitiveProof(
  userId: string,
  verifiedAtMs: number,
  key: Uint8Array,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      verifiedAtMs,
      nonce: randomBytes(16).toString("base64url"),
    }),
    "utf8",
  ).toString("base64url");
  return `v1.${payload}.${signature(payload, key).toString("base64url")}`;
}

export function verifySensitiveProof(
  value: string | undefined,
  userId: string,
  nowMs: number,
  key: Uint8Array,
): boolean {
  const [version, encodedPayload, encodedSignature] = value?.split(".") ?? [];
  if (version !== "v1" || !encodedPayload || !encodedSignature) return false;
  try {
    const expected = signature(encodedPayload, key);
    const actual = Buffer.from(encodedSignature, "base64url");
    if (
      actual.byteLength !== expected.byteLength ||
      !timingSafeEqual(actual, expected)
    ) {
      return false;
    }
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SensitiveProofPayload;
    return (
      payload.userId === userId &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 20 &&
      hasFreshSensitiveActionProof(payload.verifiedAtMs, nowMs)
    );
  } catch {
    return false;
  }
}

export const sensitiveProofCookieOptions = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: Math.floor(sessionPolicy.sensitiveActionProofAgeMs / 1_000),
});
