import { expect, test } from "vitest";
import { generateTotp } from "../auth/totp.mjs";

test("generates the RFC 6238 six-digit SHA-1 vector", () => {
  expect(generateTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe(
    "287082",
  );
});
