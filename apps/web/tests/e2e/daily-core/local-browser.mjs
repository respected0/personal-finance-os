import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { generateTotp } from "../../../../../scripts/auth/totp.mjs";
import {
  runSupabase,
  startLocalAuthStack,
} from "../../../../../scripts/db/common.mjs";

const webRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const nextCli = path.join(
  webRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const port = 3108;
const webUrl = `http://127.0.0.1:${port}`;
const syntheticEmail = `p0-a1-browser-${Date.now()}@example.test`;
const syntheticPassword = "Local-Only!DailyBrowser42";
const authOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
};

let stackStarted = false;
let webProcess;
let browser;
let adminClient;
let syntheticUserId;
let serverOutput = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredStatusValue(status, key) {
  const value = status[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Supabase local status ${key} alanını üretmedi.`);
  }
  return value;
}

async function cookieHeaderForSession(apiUrl, anonKey, session) {
  const jar = new Map();
  const client = createServerClient(apiUrl, anonKey, {
    cookieOptions: { name: "pfos_session" },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (updates) => {
        for (const { name, value } of updates) jar.set(name, value);
      },
    },
  });
  const { error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function browserCookies(cookieHeader) {
  return cookieHeader.split("; ").map((item) => {
    const separator = item.indexOf("=");
    return {
      name: item.slice(0, separator),
      value: item.slice(separator + 1),
      url: webUrl,
      httpOnly: true,
      sameSite: "Lax",
    };
  });
}

async function waitForWeb() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (webProcess?.exitCode !== null) {
      throw new Error(`Next server erken kapandı.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${webUrl}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // The local server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next server hazır olmadı.\n${serverOutput}`);
}

async function api(
  pathname,
  { cookie, method = "GET", body, idempotencyKey } = {},
) {
  const response = await fetch(`${webUrl}${pathname}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...(method === "GET"
        ? {}
        : { origin: webUrl, "sec-fetch-site": "same-origin" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  return { response, payload };
}

async function createFixture(cookie) {
  const institution = await api("/api/v1/institutions", {
    cookie,
    method: "POST",
    body: { name: "Sentetik Tarayıcı Bankası", institutionType: "bank" },
  });
  assert(institution.response.status === 201, "Kurum fixture oluşturulamadı.");

  const createAccount = async (name, accountType) => {
    const result = await api("/api/v1/accounts", {
      cookie,
      method: "POST",
      body: {
        institutionId: institution.payload.id,
        name,
        accountType,
        currency: "TRY",
        openingDate: "2026-08-01",
      },
    });
    assert(result.response.status === 201, `${name} fixture oluşturulamadı.`);
    return result.payload.id;
  };
  const bankAccountId = await createAccount(
    "Sentetik Tarayıcı Ana Hesap",
    "bank",
  );
  const cashAccountId = await createAccount("Sentetik Tarayıcı Nakit", "cash");

  const createCategory = async (name, categoryType) => {
    const result = await api("/api/v1/categories", {
      cookie,
      method: "POST",
      body: { name, categoryType },
    });
    assert(result.response.status === 201, `${name} fixture oluşturulamadı.`);
    return result.payload.id;
  };
  const expenseCategoryId = await createCategory(
    "Sentetik Tarayıcı Market",
    "expense",
  );
  await createCategory("Sentetik Tarayıcı Maaş", "income");

  const opening = await api(
    `/api/v1/accounts/${bankAccountId}/opening-balance`,
    {
      cookie,
      method: "POST",
      idempotencyKey: randomUUID(),
      body: { amount: "20000.00", currency: "TRY", date: "2026-08-01" },
    },
  );
  assert(
    opening.response.status === 201 &&
      opening.payload.effects.normalIncomeDelta === "0.00" &&
      opening.payload.effects.personalExpenseDelta === "0.00",
    "Açılış bakiyesi fixture metrikleri değiştirdi.",
  );

  return { bankAccountId, cashAccountId, expenseCategoryId };
}

async function runDesktop(cookie, fixture) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  await context.addCookies(browserCookies(cookie));
  const page = await context.newPage();
  await page.goto(webUrl);
  await expect(
    page.getByRole("heading", { name: "Bugünün finans görünümü" }),
  ).toBeVisible();
  await expect(page.getByTestId("net-worth")).toHaveText("20.000,00 TRY");

  await page.getByRole("button", { name: "+ İşlem", exact: true }).click();
  await page.getByRole("button", { name: "İşlemi kaydet" }).click();
  await expect(page.getByRole("alert")).toContainText(["Tutar gerekli."]);
  await page.getByLabel("Tutar").fill("427,50");
  await page.getByRole("button", { name: "İşlemi kaydet" }).click();
  await expect(page.getByRole("alert")).toContainText([
    "Kaynak hesap seçin.",
    "Kategori seçin.",
  ]);
  await page.getByLabel("Kaynak hesap").selectOption(fixture.bankAccountId);
  await page.locator("#entry-category").selectOption(fixture.expenseCategoryId);
  const expenseEffect = page.getByTestId("effect-summary");
  await expect(expenseEffect).toContainText("19.572,50 TRY");
  await expect(expenseEffect).toContainText("Gider etkisi427,50 TRY");
  await page.getByRole("button", { name: "İşlemi kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Gider kaydedildi.");
  await expect(page.getByTestId("net-worth")).toHaveText("19.572,50 TRY");

  await page.getByRole("button", { name: "+ İşlem", exact: true }).click();
  await page.getByLabel("Transfer", { exact: true }).check();
  await page.getByLabel("Tutar").fill("1.000,00");
  await page.getByLabel("Kaynak hesap").selectOption(fixture.bankAccountId);
  await page.getByLabel("Hedef hesap").selectOption(fixture.cashAccountId);
  await page.getByLabel("Transfer ücreti İsteğe bağlı").fill("2,50");
  const transferEffect = page.getByTestId("effect-summary");
  await expect(transferEffect).toContainText("18.570,00 TRY");
  await expect(transferEffect).toContainText("1.000,00 TRY");
  await expect(transferEffect).toContainText("Gider etkisi2,50 TRY");
  await expect(transferEffect).toContainText("Net servet etkisi-2,50 TRY");
  await page.getByRole("button", { name: "İşlemi kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Transfer kaydedildi.");
  await expect(page.getByTestId("net-worth")).toHaveText("19.570,00 TRY");
  await expect(page.getByTestId("period-expense")).toHaveText("430,00 TRY");

  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "Sentetik Tarayıcı Ana Hesap" }),
  ).toContainText("18.570,00 TRY");
  await expect(
    page.locator(".account-row").filter({ hasText: "Sentetik Tarayıcı Nakit" }),
  ).toContainText("1.000,00 TRY");

  await page
    .locator("#history-account-filter")
    .selectOption(fixture.bankAccountId);
  await page.waitForURL(
    (url) => url.searchParams.get("account") === fixture.bankAccountId,
  );
  await page.locator("#history-type-filter").selectOption("expense");
  await page.waitForURL((url) => url.searchParams.get("type") === "expense");
  await page
    .locator("#history-category-filter")
    .selectOption(fixture.expenseCategoryId);
  await page.waitForURL(
    (url) => url.searchParams.get("category") === fixture.expenseCategoryId,
  );
  await expect(
    page.getByTestId("history-list").locator(".history-row"),
  ).toHaveCount(1);
  await expect(page.getByTestId("history-list")).toContainText("427,50 TRY");
  await expect(page.getByTestId("history-aggregate")).toContainText(
    "Gider 427,50 TRY",
  );
  await expect(page.getByTestId("period-expense")).toHaveText("430,00 TRY");

  await context.close();
}

async function runMobile(cookie, fixture) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies(browserCookies(cookie));
  const page = await context.newPage();
  await page.goto(webUrl);
  await expect(page.getByTestId("net-worth")).toHaveText("19.570,00 TRY");
  const noInitialOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  assert(noInitialOverflow, "390×844 başlangıç görünümünde yatay taşma var.");

  const primary = page.getByRole("button", { name: "+ İşlem", exact: true });
  const primaryBox = await primary.boundingBox();
  assert(
    primaryBox && primaryBox.height >= 44 && primaryBox.width >= 44,
    "Mobil birincil işlem hedefi 44×44 pikselden küçük.",
  );
  const startedAt = Date.now();
  await primary.click();
  await page.getByLabel("Tutar").fill("12,34");
  await page.getByLabel("Kaynak hesap").selectOption(fixture.bankAccountId);
  await page.locator("#entry-category").selectOption(fixture.expenseCategoryId);
  const effect = page.getByTestId("effect-summary");
  await expect(effect).toContainText("18.557,66 TRY");
  await expect(effect).toContainText("Gider etkisi12,34 TRY");
  assert(
    Date.now() - startedAt < 20_000,
    "Mobil sık gider akışı 20 saniyelik kabul hedefini aştı.",
  );
  await effect.scrollIntoViewIfNeeded();
  const effectRowsFit = await effect
    .locator(".impact-row")
    .evaluateAll((rows) =>
      rows.every((row) => row.scrollWidth <= row.clientWidth + 1),
    );
  assert(effectRowsFit, "Mobil etki özeti satırlarında kırpılan içerik var.");
  const noEntryOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  assert(noEntryOverflow, "390×844 işlem görünümünde yatay taşma var.");
  await page.getByRole("button", { name: "İşlemi kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Gider kaydedildi.");
  await expect(page.getByTestId("net-worth")).toHaveText("19.557,66 TRY");
  await context.close();
}

try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalAuthStack();
  stackStarted = true;

  const status = JSON.parse(
    runSupabase(["status", "--output", "json"], { capture: true }).stdout,
  );
  const apiUrl = requiredStatusValue(status, "API_URL");
  const anonKey = requiredStatusValue(status, "ANON_KEY");
  const localAdminKey = requiredStatusValue(status, "SERVICE_ROLE_KEY");
  const databaseUrl = requiredStatusValue(status, "DB_URL");

  adminClient = createClient(apiUrl, localAdminKey, { auth: authOptions });
  const created = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password: syntheticPassword,
    email_confirm: true,
    user_metadata: { fixture: "P0-A1-local-browser-synthetic" },
  });
  if (created.error || !created.data.user) {
    throw (
      created.error ??
      new Error("Sentetik tarayıcı kullanıcısı oluşturulamadı.")
    );
  }
  syntheticUserId = created.data.user.id;

  const userClient = createClient(apiUrl, anonKey, { auth: authOptions });
  const signedIn = await userClient.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword,
  });
  if (signedIn.error || !signedIn.data.session) {
    throw (
      signedIn.error ??
      new Error("Sentetik tarayıcı kullanıcısı login olamadı.")
    );
  }
  const enrolled = await userClient.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "P0-A1 local browser synthetic factor",
  });
  const factorId = enrolled.data?.id;
  const secret = enrolled.data?.totp?.secret;
  if (enrolled.error || !factorId || !secret) {
    throw enrolled.error ?? new Error("Sentetik TOTP enroll edilemedi.");
  }
  const verified = await userClient.auth.mfa.challengeAndVerify({
    factorId,
    code: generateTotp(secret),
  });
  if (verified.error || !verified.data) {
    throw verified.error ?? new Error("Sentetik TOTP doğrulanamadı.");
  }
  const aal2Cookie = await cookieHeaderForSession(
    apiUrl,
    anonKey,
    verified.data,
  );

  webProcess = spawn(
    process.execPath,
    [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: apiUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
        DATABASE_URL: databaseUrl,
        ACCOUNT_NAME_ACTIVE_KEY_ID: "p0-a1-local-browser-v1",
        ACCOUNT_NAME_KEY_B64: randomBytes(32).toString("base64"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [webProcess.stdout, webProcess.stderr]) {
    stream?.on("data", (chunk) => {
      serverOutput = `${serverOutput}${String(chunk)}`.slice(-20_000);
    });
  }
  await waitForWeb();
  const fixture = await createFixture(aal2Cookie);
  browser = await chromium.launch({ headless: true });
  await runDesktop(aal2Cookie, fixture);
  await runMobile(aal2Cookie, fixture);

  console.log(
    "P0-A1 desktop preview/commit/history/account/report consistency: PASS",
  );
  console.log("P0-A1 390x844 no-overflow/effect/44px/under-20s flow: PASS");
  console.log("P0-A1 UAT-01/02/15/16 synthetic browser evidence: PASS");
} finally {
  await browser?.close();
  if (webProcess && webProcess.exitCode === null) {
    webProcess.kill("SIGTERM");
    await new Promise((resolve) => webProcess.once("exit", resolve));
  }
  if (adminClient && syntheticUserId) {
    await adminClient.auth.admin.deleteUser(syntheticUserId);
  }
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      {
        allowFailure: true,
        capture: true,
      },
    );
  }
}
