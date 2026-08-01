import { createHmac } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value) {
  const normalized = value.toUpperCase().replace(/=+$/u, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new Error("TOTP secret geçerli Base32 değil.");
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotp(
  secret,
  timestampMs = Date.now(),
  { digits = 6, periodSeconds = 30 } = {},
) {
  const counter = BigInt(Math.floor(timestampMs / 1_000 / periodSeconds));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);

  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBytes)
    .digest();
  const offset = digest.at(-1) & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}
