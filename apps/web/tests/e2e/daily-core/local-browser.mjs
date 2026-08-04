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
  const cardAccountId = await createAccount(
    "Sentetik Tarayıcı Kartı",
    "credit_card",
  );

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

  const goldPrice = await api("/api/v1/market-prices", {
    cookie,
    method: "POST",
    body: {
      instrument: {
        symbol: "XAU-UAT-10",
        name: "Sentetik 1.31 g banka altını",
        instrumentType: "bank_gold",
        unit: "gram",
        currency: "TRY",
      },
      price: "1000.0000000000",
      priceAt: "2026-08-04T12:00:00.000Z",
      sourceType: "reference_fixture",
      isEstimated: false,
    },
  });
  assert(
    goldPrice.response.status === 201,
    "UAT-10 sentetik banka altını fiyatı oluşturulamadı.",
  );

  const cardProfile = await api("/api/v1/cards", {
    cookie,
    method: "POST",
    body: {
      accountId: cardAccountId,
      creditLimit: "25000.00",
      statementDay: 20,
      dueDay: 30,
      minimumPaymentRule: {
        type: "percentage",
        rate: "0.20",
        minimumAmount: "100.00",
      },
    },
  });
  assert(
    cardProfile.response.status === 201,
    "Kart profili fixture oluşturulamadı.",
  );

  const subscription = await api("/api/v1/subscriptions", {
    cookie,
    method: "POST",
    body: {
      name: "Sentetik Tarayıcı Aboneliği",
      billingDay: 12,
      paymentAccountId: cardAccountId,
      expectedGross: "500.00",
      cashbackRate: "0.10",
      cashbackCap: "50.00",
    },
  });
  assert(
    subscription.response.status === 201 && subscription.payload.cycles[0]?.id,
    "Abonelik fixture oluşturulamadı.",
  );

  return {
    bankAccountId,
    cashAccountId,
    cardAccountId,
    expenseCategoryId,
    subscriptionCycleId: subscription.payload.cycles[0].id,
    goldInstrumentId: goldPrice.payload.instrument.id,
  };
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
  await page.getByLabel("Tutar", { exact: true }).fill("427,50");
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
  await page.getByLabel("Tutar", { exact: true }).fill("1.000,00");
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

  const cardSummary = page.getByTestId("card-summary");
  await expect(cardSummary).toContainText("Sentetik Tarayıcı Kartı");
  await expect(cardSummary).toContainText("Limit 25.000,00 TRY");
  const expenseForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Kart harcaması" }) });
  const cardStartedAt = Date.now();
  await expenseForm
    .getByLabel("Harcama kartı")
    .selectOption(fixture.cardAccountId);
  await expenseForm
    .getByLabel("Harcama kategorisi")
    .selectOption(fixture.expenseCategoryId);
  await expenseForm.getByLabel("Harcama tutarı").fill("300,10");
  await expenseForm.getByRole("button", { name: "Etkiyi göster" }).click();
  await expect(expenseForm.getByTestId("card-effect-summary")).toContainText(
    "Gider 300,10 TRY",
  );
  await expect(expenseForm.getByTestId("card-effect-summary")).toContainText(
    "Net servet -300,10 TRY",
  );
  assert(
    Date.now() - cardStartedAt < 20_000,
    "Kart harcaması önizleme akışı 20 saniyelik kabul hedefini aştı.",
  );
  await expenseForm.getByRole("button", { name: "Harcamayı kaydet" }).click();
  await expect(
    page.locator(".card-workspace").getByRole("status"),
  ).toContainText("banka değişmedi");
  await expect(page.getByTestId("net-worth")).toHaveText("19.269,90 TRY");
  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "Sentetik Tarayıcı Ana Hesap" }),
  ).toContainText("18.570,00 TRY");
  await expect(
    page.locator(".account-row").filter({ hasText: "Sentetik Tarayıcı Kartı" }),
  ).toContainText("300,10 TRY");

  const paymentForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Kart ödemesi" }) });
  await paymentForm
    .getByLabel("Ödeme banka hesabı")
    .selectOption(fixture.bankAccountId);
  await paymentForm
    .getByLabel("Ödeme kartı")
    .selectOption(fixture.cardAccountId);
  await paymentForm.getByLabel("Ödeme tutarı").fill("100,00");
  await paymentForm.getByRole("button", { name: "Etkiyi göster" }).click();
  await expect(paymentForm.getByTestId("card-effect-summary")).toContainText(
    "Gider 0,00 TRY",
  );
  await expect(paymentForm.getByTestId("card-effect-summary")).toContainText(
    "Net servet 0,00 TRY",
  );
  await paymentForm.getByRole("button", { name: "Ödemeyi kaydet" }).click();
  await expect(
    page.locator(".card-workspace").getByRole("status"),
  ).toContainText("ikinci gider oluşmadı");
  await expect(page.getByTestId("net-worth")).toHaveText("19.269,90 TRY");
  await expect(page.getByTestId("period-expense")).toHaveText("730,10 TRY");
  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "Sentetik Tarayıcı Ana Hesap" }),
  ).toContainText("18.470,00 TRY");
  await expect(
    page.locator(".account-row").filter({ hasText: "Sentetik Tarayıcı Kartı" }),
  ).toContainText("200,10 TRY");

  const subscriptionSummary = page.getByTestId("subscription-summary");
  await expect(subscriptionSummary).toContainText(
    "Sentetik Tarayıcı Aboneliği",
  );
  await expect(subscriptionSummary).toContainText("Beklenen net 450,00 TRY");
  await expect(subscriptionSummary).toContainText("Yenileme 2026-08-12");
  const subscriptionWorkspace = page.locator(".subscription-workspace");
  const chargeForm = subscriptionWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Brüt tahsilatı kaydet" }),
  });
  await chargeForm
    .getByLabel("Tahsilat döngüsü")
    .selectOption(fixture.subscriptionCycleId);
  await chargeForm
    .getByLabel("Tahsilat kategorisi")
    .selectOption(fixture.expenseCategoryId);
  await chargeForm.getByLabel("Brüt tahsilat").fill("500,00");
  await chargeForm.getByRole("button", { name: "Tahsilatı kaydet" }).click();
  await expect(subscriptionWorkspace.getByRole("status")).toContainText(
    "brüt gider",
  );
  await expect(page.getByTestId("period-expense")).toHaveText("1.230,10 TRY");
  await expect(page.getByTestId("net-worth")).toHaveText("18.769,90 TRY");

  const cashbackForm = subscriptionWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Cashback kaydet" }),
  });
  await cashbackForm
    .getByLabel("Cashback döngüsü")
    .selectOption(fixture.subscriptionCycleId);
  await cashbackForm
    .getByLabel("Cashback hedefi")
    .selectOption(fixture.cardAccountId);
  await cashbackForm.getByLabel("Cashback tutarı").fill("50,00");
  await cashbackForm.getByRole("button", { name: "Cashback kaydet" }).click();
  await expect(subscriptionWorkspace.getByRole("status")).toContainText(
    "normal gelir 0",
  );
  await expect(subscriptionSummary).toContainText("Gerçek net 450,00 TRY");
  await expect(subscriptionSummary).toContainText(
    "Tahsilat ve cashback bağlantısı aktif",
  );
  await expect(page.getByTestId("period-expense")).toHaveText("1.180,10 TRY");
  await expect(page.getByTestId("period-income")).toHaveText("0,00 TRY");
  await expect(page.getByTestId("net-worth")).toHaveText("18.819,90 TRY");

  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "Sentetik Tarayıcı Ana Hesap" }),
  ).toContainText("18.470,00 TRY");
  await expect(
    page.locator(".account-row").filter({ hasText: "Sentetik Tarayıcı Nakit" }),
  ).toContainText("1.000,00 TRY");

  const receivablesWorkspace = page.locator(".receivables-workspace");
  const personForm = receivablesWorkspace
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Kişi ekle" }) });
  for (const personName of [
    "Sentetik Ortak Kişi Bir",
    "Sentetik Ortak Kişi İki",
  ]) {
    await personForm.getByLabel("Ad").fill(personName);
    await personForm.getByRole("button", { name: "Kişiyi kaydet" }).click();
    await expect(receivablesWorkspace.getByRole("status")).toContainText(
      "şifreli ad",
    );
  }
  const sharedForm = receivablesWorkspace
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Ortak harcama" }) });
  await sharedForm
    .getByLabel("Ödeme hesabı")
    .selectOption(fixture.bankAccountId);
  await sharedForm.getByLabel("Toplam").fill("100,00");
  await sharedForm.getByLabel("Sahip payı").fill("33,33");
  await sharedForm.getByLabel("Yuvarlama").fill("0,01");
  await sharedForm.getByRole("button", { name: "+ Kişi payı" }).click();
  await sharedForm.getByRole("button", { name: "+ Kişi payı" }).click();
  await sharedForm
    .getByLabel("Kişi 1")
    .selectOption({ label: "Sentetik Ortak Kişi Bir" });
  await sharedForm.getByLabel("Pay 1").fill("33,33");
  await sharedForm
    .getByLabel("Kişi 2")
    .selectOption({ label: "Sentetik Ortak Kişi İki" });
  await sharedForm.getByLabel("Pay 2").fill("33,33");
  await sharedForm.getByRole("button", { name: "Etkiyi göster" }).click();
  await expect(sharedForm.getByTestId("shared-effect-summary")).toContainText(
    "Kişisel gider 33,34 TRY",
  );
  await sharedForm
    .getByRole("button", { name: "Ortak harcamayı kaydet" })
    .click();
  await expect(receivablesWorkspace.getByRole("status")).toContainText(
    "Tek ödeme",
  );
  const receivableRows = page
    .getByTestId("receivable-list")
    .locator(".receivable-row");
  await expect(receivableRows).toHaveCount(2);
  await expect(receivableRows.first()).toContainText("Nominal 33,33 TRY");
  await expect(page.getByTestId("period-expense")).toHaveText("1.213,44 TRY");
  await expect(page.getByTestId("net-worth")).toHaveText("18.719,90 TRY");
  await receivablesWorkspace
    .getByLabel("Tahsilat hesabı")
    .selectOption(fixture.bankAccountId);
  const firstReceivable = receivableRows.filter({
    hasText: "Sentetik Ortak Kişi Bir",
  });
  await firstReceivable
    .getByLabel("Sentetik Ortak Kişi Bir tahsilat tutarı")
    .fill("10,00");
  await firstReceivable.getByRole("button", { name: "Tahsil et" }).click();
  await expect(receivablesWorkspace.getByRole("status")).toContainText(
    "normal gelir 0",
  );
  await expect(firstReceivable).toContainText("Kalan 23,33 TRY");
  await expect(page.getByTestId("period-income")).toHaveText("0,00 TRY");
  await firstReceivable
    .getByLabel("Sentetik Ortak Kişi Bir tahsilat tutarı")
    .fill("23,34");
  await firstReceivable.getByRole("button", { name: "Tahsil et" }).click();
  await expect(receivablesWorkspace.getByRole("alert")).toBeVisible();

  const reconciliationWorkspace = page.locator(".reconciliation-workspace");
  const snapshotForm = reconciliationWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Bakiye karşılaştır" }),
  });
  await snapshotForm.getByLabel("Hesap").selectOption(fixture.bankAccountId);
  await snapshotForm.getByLabel("Belirtilen bakiye").fill("19.000,00");
  await snapshotForm.getByRole("button", { name: "Farkı hesapla" }).click();
  await expect(snapshotForm.locator(".reconciliation-result")).toContainText(
    "Fark:",
  );
  await snapshotForm.getByRole("button", { name: "Mutabakat başlat" }).click();
  const resolutionForm = reconciliationWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Farkı çöz" }),
  });
  await resolutionForm.getByLabel("Çözüm").selectOption("accepted");
  await resolutionForm
    .getByLabel("Zorunlu gerekçe")
    .fill("Sentetik tarayıcı ekstresi kabulü");
  await resolutionForm.getByRole("button", { name: "Çözümü kaydet" }).click();
  await expect(reconciliationWorkspace.getByRole("status")).toContainText(
    "Mutabakat gerekçesi",
  );
  const dashboardExpense = await page.getByTestId("period-expense").innerText();
  await expect(page.getByTestId("report-expense")).toHaveText(dashboardExpense);
  await expect(firstReceivable).toContainText("Kalan 23,33 TRY");

  const planningWorkspace = page.locator(".planning-workspace");
  const netWorthBeforeAllocation = await page
    .getByTestId("net-worth")
    .innerText();
  await planningWorkspace
    .getByLabel("Sentetik Tarayıcı Market limiti")
    .fill("1500,0000");
  await planningWorkspace
    .getByRole("button", { name: "Bütçeyi kaydet" })
    .click();
  await expect(planningWorkspace.getByRole("status")).toContainText(
    "exact decimal",
  );
  await expect(page.getByTestId("budget-projection")).toContainText(
    "Gerçekleşen",
  );
  const goalForm = planningWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Hedef oluştur" }),
  });
  await goalForm.getByLabel("Hedef adı").fill("Sentetik Acil Durum Hedefi");
  await goalForm.getByLabel("Hedef tutarı").fill("5000,0000");
  await goalForm.getByLabel("Hedef tarihi").fill("2026-12-31");
  await goalForm.getByRole("button", { name: "Hedef ekle" }).click();
  await expect(planningWorkspace.getByRole("status")).toContainText(
    "net servet değişmedi",
  );
  const allocationForm = planningWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Sanal tahsis" }),
  });
  await allocationForm
    .getByLabel("Hedef")
    .selectOption({ label: "Sentetik Acil Durum Hedefi" });
  await allocationForm
    .getByLabel("Tahsis kaynak hesabı")
    .selectOption(fixture.bankAccountId);
  await allocationForm.getByLabel("Tahsis değeri").fill("1000,0000");
  await allocationForm.getByRole("button", { name: "Tahsis et" }).click();
  await expect(planningWorkspace.getByRole("status")).toContainText(
    "ledger 0, bakiye 0, net servet 0",
  );
  await expect(page.getByTestId("goal-progress")).toContainText(
    "İlerleme 1.000,00 TRY",
  );
  await expect(page.getByTestId("net-worth")).toHaveText(
    netWorthBeforeAllocation,
  );
  const expectedForm = planningWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Beklenen ödeme" }),
  });
  await expectedForm
    .getByLabel("Beklenen ödeme kaynağı")
    .fill("Sentetik tarayıcı beklenen ödemesi");
  await expectedForm.getByLabel("Beklenen ödeme tutarı").fill("5000,0000");
  await expectedForm.getByLabel("Beklenen ödeme tarihi").fill("2026-08-10");
  await expectedForm
    .getByRole("button", { name: "Beklenen ödemeyi ekle" })
    .click();
  await expect(planningWorkspace.getByRole("status")).toContainText(
    "yatırılabilir tutar etkisi 0",
  );
  await expect(page.getByTestId("expected-payments")).toContainText(
    "Gelir 0.0000 · net servet 0.0000 · yatırım 0.0000",
  );
  const investableForm = planningWorkspace.locator("form").filter({
    has: page.getByRole("heading", { name: "Yatırılabilir tutar" }),
  });
  await investableForm.getByLabel("İşletme tamponu").fill("1000,0000");
  await investableForm
    .getByRole("button", { name: "Kanonik tutarı hesapla" })
    .click();
  await expect(page.getByTestId("investable-evidence")).toContainText(
    "investable-formula-1.0.0",
  );
  await page
    .getByTestId("expected-payments")
    .getByLabel("Gerçekleşme hesabı")
    .selectOption(fixture.bankAccountId);
  await page
    .getByTestId("expected-payments")
    .getByRole("button", { name: "Gelir olarak gerçekleştir" })
    .click();
  await expect(planningWorkspace.getByRole("status")).toContainText(
    "bir kez gelir",
  );

  const investmentWorkspace = page.locator(".investment-workspace");
  const expenseBeforeInvestment = await page
    .getByTestId("report-expense")
    .innerText();
  const netWorthBeforeInvestment = await page
    .getByTestId("net-worth")
    .innerText();
  await investmentWorkspace
    .getByLabel("Nakit hesabı")
    .selectOption(fixture.bankAccountId);
  await investmentWorkspace
    .getByLabel("Yatırım aracı")
    .selectOption(fixture.goldInstrumentId);
  await investmentWorkspace.getByLabel("Miktar").fill("1,3100000000");
  await investmentWorkspace.getByLabel("Birim fiyat").fill("1000,0000000000");
  await investmentWorkspace.getByLabel("Ücret").fill("10,0000");
  await expect(page.getByTestId("investment-cash-total")).toContainText(
    "1.320,00 TRY",
  );
  await investmentWorkspace
    .getByRole("button", { name: "Yatırım işlemini kaydet" })
    .click();
  await expect(investmentWorkspace.getByRole("status")).toContainText(
    "tüketim gideri 0",
  );
  const goldPosition = page
    .getByTestId("portfolio-list")
    .locator(".portfolio-position")
    .filter({ hasText: "XAU-UAT-10" });
  await expect(goldPosition).toContainText("1.3100000000 g");
  await expect(goldPosition).toContainText("Maliyet1.320,00 TRY");
  await expect(goldPosition).toContainText("Değer1.310,00 TRY");
  await expect(goldPosition).toContainText("Gerçekleşmemiş K/Z-10,00 TRY");
  await expect(goldPosition).toContainText("%100.0000");
  await expect(goldPosition).toContainText("Referans fiyat");
  await expect(page.getByTestId("period-expense")).toHaveText(
    expenseBeforeInvestment,
  );
  await expect(page.getByTestId("report-expense")).toHaveText(
    expenseBeforeInvestment,
  );
  await expect(page.getByTestId("net-worth")).toHaveText(
    netWorthBeforeInvestment,
  );

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
  await expect(page.getByTestId("period-expense")).toHaveText("1.213,44 TRY");

  await context.close();
}

async function runMobile(cookie, fixture) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies(browserCookies(cookie));
  const page = await context.newPage();
  await page.goto(webUrl);
  await expect(page.getByTestId("net-worth")).toHaveText("23.729,90 TRY");
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
  await page.getByLabel("Tutar", { exact: true }).fill("12,34");
  await page.getByLabel("Kaynak hesap").selectOption(fixture.bankAccountId);
  await page.locator("#entry-category").selectOption(fixture.expenseCategoryId);
  const effect = page.getByTestId("effect-summary");
  await expect(effect).toContainText("23.367,66 TRY");
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
  await expect(page.getByTestId("net-worth")).toHaveText("23.717,56 TRY");
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
  console.log("P0-A2 UAT-03/04 card expense/payment browser evidence: PASS");
  console.log(
    "P0-A2 UAT-05 subscription/cashback linked browser evidence: PASS",
  );
  console.log(
    "P0-A2 UAT-06/07 shared expense and partial settlement browser evidence: PASS",
  );
  console.log("P0-A3 UAT-12 reconciliation desktop browser evidence: PASS");
  console.log("P0-A3 UAT-13 dashboard/monthly report zero difference: PASS");
  console.log("P0-B1 B064/B065/UAT-11 budget-goal browser evidence: PASS");
  console.log("P0-B1 B068-B072/UAT-09 planning browser evidence: PASS");
  console.log(
    "P0-B2 B078-B080/B082 UAT-10 exact trade form, 1.31 g portfolio and report evidence: PASS",
  );
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
