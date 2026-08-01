import { describe, expect, test } from "vitest";
import {
  assertSecureAuthCookieOptions,
  authCookiePolicy,
} from "../../../src/server/auth/session-cookie.ts";

describe("B007 BFF cookie policy", () => {
  test("requires HttpOnly Secure SameSite cookies", () => {
    expect(authCookiePolicy).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(() => assertSecureAuthCookieOptions(authCookiePolicy)).not.toThrow();
    expect(() =>
      assertSecureAuthCookieOptions({
        httpOnly: false,
        secure: true,
        sameSite: "lax",
      }),
    ).toThrow();
  });
});
