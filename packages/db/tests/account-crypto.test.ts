import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptAccountName,
  encryptAccountName,
  type AccountNameKeyring,
} from "../src/account-crypto.ts";

const activeKey = randomBytes(32);
const legacyKey = randomBytes(32);
const keyring: AccountNameKeyring = {
  activeKeyId: "local-v2",
  keys: new Map([
    ["local-v1", legacyKey],
    ["local-v2", activeKey],
  ]),
};

describe("P0-A1 account-name AEAD envelope", () => {
  it("encrypts with the active key and decrypts with owned AAD", () => {
    const userId = randomUUID();
    const accountId = randomUUID();
    const envelope = encryptAccountName(
      "Sentetik Ana Hesap",
      userId,
      accountId,
      keyring,
    );
    expect(envelope.keyId).toBe("local-v2");
    expect(envelope.algorithm).toBe("AEAD_AES_256_GCM");
    expect(envelope.nonce).toHaveLength(12);
    expect(envelope.authTag).toHaveLength(16);
    expect(Buffer.from(envelope.ciphertext).toString("utf8")).not.toContain(
      "Sentetik Ana Hesap",
    );
    expect(decryptAccountName(envelope, userId, accountId, keyring)).toBe(
      "Sentetik Ana Hesap",
    );
  });

  it("fails closed for another owner or tampered ciphertext", () => {
    const userId = randomUUID();
    const accountId = randomUUID();
    const envelope = encryptAccountName("Sentetik", userId, accountId, keyring);
    expect(() =>
      decryptAccountName(envelope, randomUUID(), accountId, keyring),
    ).toThrow();
    const tampered = {
      ...envelope,
      ciphertext: Uint8Array.from(envelope.ciphertext, (value, index) =>
        index === 0 ? value ^ 1 : value,
      ),
    };
    expect(() =>
      decryptAccountName(tampered, userId, accountId, keyring),
    ).toThrow();
  });

  it("keeps legacy key ids readable during rotation", () => {
    const userId = randomUUID();
    const accountId = randomUUID();
    const legacyKeyring: AccountNameKeyring = {
      activeKeyId: "local-v1",
      keys: keyring.keys,
    };
    const legacyEnvelope = encryptAccountName(
      "Sentetik Eski Hesap",
      userId,
      accountId,
      legacyKeyring,
    );
    expect(decryptAccountName(legacyEnvelope, userId, accountId, keyring)).toBe(
      "Sentetik Eski Hesap",
    );
  });
});
