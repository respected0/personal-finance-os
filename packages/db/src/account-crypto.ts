import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_ALGORITHM = "AEAD_AES_256_GCM";
const ENCRYPTION_VERSION = 1;
const AAD_VERSION = 1;

export interface AccountNameEnvelope {
  readonly ciphertext: Uint8Array;
  readonly keyId: string;
  readonly algorithm: typeof ENVELOPE_ALGORITHM;
  readonly encryptionVersion: typeof ENCRYPTION_VERSION;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly aadVersion: typeof AAD_VERSION;
}

export interface AccountNameKeyring {
  readonly activeKeyId: string;
  readonly keys: ReadonlyMap<string, Uint8Array>;
}

function keyFor(keyring: AccountNameKeyring, keyId: string): Uint8Array {
  const key = keyring.keys.get(keyId);
  if (!key || key.byteLength !== 32) {
    throw new Error("Account-name encryption key is unavailable or invalid.");
  }
  return key;
}

function aad(userId: string, accountId: string): Uint8Array {
  return Buffer.from(
    `pfos:financial-account:name:v${AAD_VERSION}:${userId}:${accountId}`,
    "utf8",
  );
}

export function encryptAccountName(
  plaintext: string,
  userId: string,
  accountId: string,
  keyring: AccountNameKeyring,
): AccountNameEnvelope {
  const normalized = plaintext.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new Error("Account name must contain between 1 and 120 characters.");
  }

  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    ALGORITHM,
    keyFor(keyring, keyring.activeKeyId),
    nonce,
  );
  cipher.setAAD(aad(userId, accountId));
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

export function decryptAccountName(
  envelope: AccountNameEnvelope,
  userId: string,
  accountId: string,
  keyring: AccountNameKeyring,
): string {
  if (
    envelope.algorithm !== ENVELOPE_ALGORITHM ||
    envelope.encryptionVersion !== ENCRYPTION_VERSION ||
    envelope.aadVersion !== AAD_VERSION ||
    envelope.nonce.byteLength !== 12 ||
    envelope.authTag.byteLength !== 16
  ) {
    throw new Error("Account-name encryption envelope is unsupported.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    keyFor(keyring, envelope.keyId),
    envelope.nonce,
  );
  decipher.setAAD(aad(userId, accountId));
  decipher.setAuthTag(Buffer.from(envelope.authTag));
  return Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
