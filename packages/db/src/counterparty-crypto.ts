import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { AccountNameKeyring } from "./account-crypto.js";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_ALGORITHM = "AEAD_AES_256_GCM";
const ENCRYPTION_VERSION = 1;
const AAD_VERSION = 1;

export interface CounterpartyNameEnvelope {
  readonly ciphertext: Uint8Array;
  readonly nameSearchHash: Uint8Array;
  readonly keyId: string;
  readonly algorithm: typeof ENVELOPE_ALGORITHM;
  readonly encryptionVersion: typeof ENCRYPTION_VERSION;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly aadVersion: typeof AAD_VERSION;
}

function normalizedName(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new Error(
      "Counterparty name must contain between 1 and 120 characters.",
    );
  }
  return normalized;
}

function keyFor(keyring: AccountNameKeyring, keyId: string): Uint8Array {
  const key = keyring.keys.get(keyId);
  if (!key || key.byteLength !== 32) {
    throw new Error(
      "Counterparty-name encryption key is unavailable or invalid.",
    );
  }
  return key;
}

function aad(userId: string, counterpartyId: string): Uint8Array {
  return Buffer.from(
    `pfos:counterparty:name:v${AAD_VERSION}:${userId}:${counterpartyId}`,
    "utf8",
  );
}

export function encryptCounterpartyName(
  plaintext: string,
  userId: string,
  counterpartyId: string,
  keyring: AccountNameKeyring,
): CounterpartyNameEnvelope {
  const key = keyFor(keyring, keyring.activeKeyId);
  const normalized = normalizedName(plaintext);
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(aad(userId, counterpartyId));
  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext,
    nameSearchHash: createHmac("sha256", key)
      .update(
        `pfos:counterparty:search:v1:${normalized.toLocaleLowerCase("tr-TR")}`,
      )
      .digest(),
    keyId: keyring.activeKeyId,
    algorithm: ENVELOPE_ALGORITHM,
    encryptionVersion: ENCRYPTION_VERSION,
    nonce,
    authTag: cipher.getAuthTag(),
    aadVersion: AAD_VERSION,
  };
}

export function decryptCounterpartyName(
  envelope: Omit<CounterpartyNameEnvelope, "nameSearchHash">,
  userId: string,
  counterpartyId: string,
  keyring: AccountNameKeyring,
): string {
  if (
    envelope.algorithm !== ENVELOPE_ALGORITHM ||
    envelope.encryptionVersion !== ENCRYPTION_VERSION ||
    envelope.aadVersion !== AAD_VERSION ||
    envelope.nonce.byteLength !== 12 ||
    envelope.authTag.byteLength !== 16
  ) {
    throw new Error("Counterparty-name encryption envelope is unsupported.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFor(keyring, envelope.keyId),
    envelope.nonce,
  );
  decipher.setAAD(aad(userId, counterpartyId));
  decipher.setAuthTag(Buffer.from(envelope.authTag));
  return Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
