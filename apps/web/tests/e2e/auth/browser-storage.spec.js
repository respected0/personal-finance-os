import { expect, test } from "@playwright/test";

test("auth foundation exposes no browser token storage", async ({
  context,
  page,
}) => {
  await page.goto("/auth");
  await expect(
    page.getByRole("heading", { name: "Authentication foundation" }),
  ).toBeVisible();

  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    visibleCookie: document.cookie,
  }));
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(storage.visibleCookie).not.toMatch(/(?:access|refresh|service.role)/i);

  const authCookies = (await context.cookies()).filter((cookie) =>
    /^(?:sb-|pfos_session)/.test(cookie.name),
  );
  expect(authCookies).toEqual([]);
});
