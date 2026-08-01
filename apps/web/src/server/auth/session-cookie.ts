export const authCookiePolicy = Object.freeze({
  name: "pfos_session",
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
});

export function assertSecureAuthCookieOptions(options: {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string | boolean;
}) {
  if (
    options.httpOnly !== true ||
    options.secure !== true ||
    (options.sameSite !== "lax" && options.sameSite !== "strict")
  ) {
    throw new Error("Auth cookie HttpOnly, Secure ve SameSite olmalı.");
  }
}
