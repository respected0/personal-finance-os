import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AccountNameKeyring } from "./account-crypto.js";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_ALGORITHM = "AEAD_AES_256_GCM";
const ENCRYPTION_VERSION = 1;
const AAD_VERSION = 1;

export interface ProtectedTextEnvelope {
  readonly ciphertext: Uint8Array;
  readonly keyId: string;
  readonly algorithm: typeof ENVELOPE_ALGORITHM;
  readonly encryptionVersion: typeof ENCRYPTION_VERSION;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly aadVersion: typeof AAD_VERSION;
}

function keyFor(keyring: AccountNameKeyring, keyId: string): Uint8Array {
  const key = keyring.keys.get(keyId);
  if (!key || key.byteLength !== 32) {
    throw new Error("Protected-text encryption key is unavailable or invalid.");
  }
  return key;
}

function aad(userId: string, entityId: string, purpose: string): Uint8Array {
  return Buffer.from(
    `pfos:protected-text:${purpose}:v${AAD_VERSION}:${userId}:${entityId}`,
    "utf8",
  );
}

export function encryptProtectedText(
  plaintext: string,
  userId: string,
  entityId: string,
  purpose: string,
  keyring: AccountNameKeyring,
): ProtectedTextEnvelope {
  const normalized = plaintext.trim();
  if (normalized.length === 0 || normalized.length > 500) {
    throw new Error(
      "Protected text must contain between 1 and 500 characters.",
    );
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    ALGORITHM,
    keyFor(keyring, keyring.activeKeyId),
    nonce,
  );
  cipher.setAAD(aad(userId, entityId, purpose));
  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext,
    keyId: keyring.activeKeyId,
    algorithm: ENVELOPE_ALGORITHM,
    encryptionVersion: ENCRYPTION_VERSION,
    nonce,
    authTag: cipher.getAuthTag(),
    aadVersion: AAD_VERSION,
  };
}

export function decryptProtectedText(
  envelope: ProtectedTextEnvelope,
  userId: string,
  entityId: string,
  purpose: string,
  keyring: AccountNameKeyring,
): string {
  if (
    envelope.algorithm !== ENVELOPE_ALGORITHM ||
    envelope.encryptionVersion !== ENCRYPTION_VERSION ||
    envelope.aadVersion !== AAD_VERSION ||
    envelope.nonce.byteLength !== 12 ||
    envelope.authTag.byteLength !== 16
  ) {
    throw new Error("Protected-text encryption envelope is unsupported.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFor(keyring, envelope.keyId),
    envelope.nonce,
  );
  decipher.setAAD(aad(userId, entityId, purpose));
  decipher.setAuthTag(Buffer.from(envelope.authTag));
  return Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
