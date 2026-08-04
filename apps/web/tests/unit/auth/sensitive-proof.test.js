import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSensitiveProof,
  verifySensitiveProof,
} from "../../../src/server/auth/sensitive-proof";

describe("fresh sensitive-action proof", () => {
  it("accepts only an untampered same-user proof younger than five minutes", () => {
    const key = randomBytes(32);
    const userId = randomUUID();
    const now = Date.now();
    const proof = createSensitiveProof(userId, now, key);

    expect(verifySensitiveProof(proof, userId, now + 299_999, key)).toBe(true);
    expect(verifySensitiveProof(proof, userId, now + 300_000, key)).toBe(false);
    expect(verifySensitiveProof(proof, randomUUID(), now, key)).toBe(false);
    expect(verifySensitiveProof(`${proof}x`, userId, now, key)).toBe(false);
    expect(verifySensitiveProof(proof, userId, now, randomBytes(32))).toBe(
      false,
    );
  });
});
