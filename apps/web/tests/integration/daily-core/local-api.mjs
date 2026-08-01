import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  runSupabase,
  startLocalAuthStack,
} from "../../../../../scripts/db/common.mjs";
import { generateTotp } from "../../../../../scripts/auth/totp.mjs";

const webRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const nextCli = path.join(
  webRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const port = 3107;
const webUrl = `http://127.0.0.1:${port}`;
const syntheticEmail = `p0-a1-api-${Date.now()}@example.test`;
const syntheticPassword = "Local-Only!DailyApi42";
const authOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
};
let stackStarted = false;
let webProcess;
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
  { cookie, method = "GET", body, idempotencyKey, crossSite = false } = {},
) {
  const headers = {
    ...(cookie ? { cookie } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    ...(method === "GET"
      ? {}
      : {
          origin: crossSite ? "https://attacker.example.test" : webUrl,
          "sec-fetch-site": crossSite ? "cross-site" : "same-origin",
        }),
  };
  const response = await fetch(`${webUrl}${pathname}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  return { response, payload };
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
    user_metadata: { fixture: "P0-A1-local-api-synthetic" },
  });
  if (created.error || !created.data.user) {
    throw (
      created.error ?? new Error("Sentetik API kullanıcısı oluşturulamadı.")
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
      signedIn.error ?? new Error("Sentetik API kullanıcısı login olamadı.")
    );
  }
  const aal1Cookie = await cookieHeaderForSession(
    apiUrl,
    anonKey,
    signedIn.data.session,
  );

  const enrolled = await userClient.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "P0-A1 local API synthetic factor",
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

  const key = randomBytes(32).toString("base64");
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
        ACCOUNT_NAME_ACTIVE_KEY_ID: "p0-a1-local-api-v1",
        ACCOUNT_NAME_KEY_B64: key,
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

  const aal1Write = await api("/api/v1/institutions", {
    cookie: aal1Cookie,
    method: "POST",
    body: { name: "Sentetik AAL1 Banka", institutionType: "bank" },
  });
  assert(
    aal1Write.response.status === 403 &&
      aal1Write.payload.code === "mfa_required",
    `Normal finance write AAL1 ile doğru reddedilmedi: ${aal1Write.response.status} ${JSON.stringify(aal1Write.payload)}.`,
  );

  const institutionResult = await api("/api/v1/institutions", {
    cookie: aal2Cookie,
    method: "POST",
    body: { name: "Sentetik API Banka", institutionType: "bank" },
  });
  assert(
    institutionResult.response.status === 201,
    "Institution API create başarısız.",
  );
  const institutionId = institutionResult.payload.id;

  const injectedOwner = await api("/api/v1/accounts", {
    cookie: aal2Cookie,
    method: "POST",
    body: {
      userId: syntheticUserId,
      name: "Injected",
      accountType: "bank",
      currency: "TRY",
      openingDate: "2026-08-01",
    },
  });
  assert(
    injectedOwner.response.status === 422,
    "Client-supplied owner field API sözleşmesinde reddedilmedi.",
  );

  const accountResult = await api("/api/v1/accounts", {
    cookie: aal2Cookie,
    method: "POST",
    body: {
      institutionId,
      name: "Sentetik API Ana Hesap",
      accountType: "bank",
      currency: "TRY",
      openingDate: "2026-08-01",
    },
  });
  assert(
    accountResult.response.status === 201,
    "Account API create başarısız.",
  );
  const accountId = accountResult.payload.id;

  const categoryResult = await api("/api/v1/categories", {
    cookie: aal2Cookie,
    method: "POST",
    body: { name: "Sentetik API Market", categoryType: "expense" },
  });
  assert(
    categoryResult.response.status === 201,
    "Category API create başarısız.",
  );
  const categoryId = categoryResult.payload.id;

  const openingResult = await api(
    `/api/v1/accounts/${accountId}/opening-balance`,
    {
      cookie: aal2Cookie,
      method: "POST",
      idempotencyKey: randomUUID(),
      body: { amount: "20000.00", currency: "TRY", date: "2026-08-01" },
    },
  );
  assert(
    openingResult.response.status === 201 &&
      openingResult.payload.effects.normalIncomeDelta === "0.00" &&
      openingResult.payload.effects.personalExpenseDelta === "0.00",
    "Opening balance API period metriclerini değiştirdi.",
  );

  const expenseCommand = {
    type: "expense",
    amount: "427.50",
    currency: "TRY",
    occurredAt: "2026-08-01T12:00:00+03:00",
    economicDate: "2026-08-01",
    sourceAccountId: accountId,
    sourceKind: "bank",
    categoryId,
  };
  const previewResult = await api("/api/v1/transactions/preview", {
    cookie: aal2Cookie,
    method: "POST",
    body: expenseCommand,
  });
  assert(
    previewResult.response.status === 200 &&
      previewResult.payload.effects.personalExpenseDelta === "427.50",
    "Transaction preview API exact etki üretmedi.",
  );

  const crossSite = await api("/api/v1/transactions", {
    cookie: aal2Cookie,
    method: "POST",
    crossSite: true,
    idempotencyKey: randomUUID(),
    body: { command: expenseCommand },
  });
  assert(
    crossSite.response.status === 403,
    "Cross-site finance write reddedilmedi.",
  );

  const commitResult = await api("/api/v1/transactions", {
    cookie: aal2Cookie,
    method: "POST",
    idempotencyKey: randomUUID(),
    body: {
      command: expenseCommand,
      previewHash: previewResult.payload.previewHash,
    },
  });
  assert(
    commitResult.response.status === 201,
    "Transaction commit API başarısız.",
  );

  const historyResult = await api(
    `/api/v1/transactions?period_from=2026-08-01&period_to=2026-08-31&account=${accountId}&type=expense&category=${categoryId}`,
    { cookie: aal2Cookie },
  );
  assert(
    historyResult.response.status === 200 &&
      historyResult.payload.items.length === 1 &&
      historyResult.payload.aggregate.personalExpense === "427.5000",
    "Transaction history API filter/aggregate sonucu hatalı.",
  );

  const balanceResult = await api(`/api/v1/accounts/${accountId}/balance`, {
    cookie: aal2Cookie,
  });
  assert(
    balanceResult.response.status === 200 &&
      balanceResult.payload.calculatedOriginal === "19572.5000",
    "Account balance API ledger projection sonucu hatalı.",
  );

  console.log("P0-A1 BFF AAL1 write rejection / AAL2 write: PASS");
  console.log("P0-A1 BFF owner injection / cross-site rejection: PASS");
  console.log("P0-A1 BFF account/opening/preview/commit/history/balance: PASS");
} finally {
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
