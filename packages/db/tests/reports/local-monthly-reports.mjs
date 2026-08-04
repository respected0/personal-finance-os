import { randomBytes, randomUUID } from "node:crypto";
import {
  commitLedgerTransaction,
  createCategory,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  createMonthlyReportVersion,
  getMonthlyReport,
  MonthlyReportNotFoundError,
  provisionSystemLedgerAccounts,
} from "../../dist/index.js";
import {
  runSupabase,
  startLocalStack,
} from "../../../../scripts/db/common.mjs";

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = createLedgerSql(databaseUrl, { max: 8 });
const userA = randomUUID();
const userB = randomUUID();
const period = "2026-08";
const keyring = {
  activeKeyId: "local-monthly-report-key-v1",
  keys: new Map([["local-monthly-report-key-v1", randomBytes(32)]]),
};
let stackStarted = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectRejection(action, label, predicate = () => true) {
  try {
    await action();
  } catch (error) {
    if (!predicate(error)) {
      throw new Error(`${label}: unexpected rejection ${error?.message}.`);
    }
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded.`);
}

async function commit(command) {
  return commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command,
  });
}

const common = {
  currency: "TRY",
  occurredAt: "2026-08-04T12:00:00+03:00",
  economicDate: "2026-08-04",
};

try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalStack();
  stackStarted = true;
  runSupabase(["db", "reset", "--local"], { capture: true });

  await sql`
    insert into auth.users (id, email, aud, role, created_at, updated_at)
    values
      (${userA}::uuid, ${`p0-a3-report-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-a3-report-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);
  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Rapor Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const createAccount = (name, accountType) =>
    createFinancialAccount(sql, keyring, {
      userId: userA,
      institutionId: institution.id,
      name,
      accountType,
      currency: "TRY",
      openingDate: "2026-08-01",
      requestId: randomUUID(),
    });
  const bank = await createAccount("Sentetik Rapor Banka", "bank");
  const cash = await createAccount("Sentetik Rapor Nakit", "cash");
  const card = await createAccount("Sentetik Rapor Kart", "credit_card");
  const expenseCategory = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Rapor Gider",
    categoryType: "expense",
    sortOrder: 1,
    requestId: randomUUID(),
  });
  const incomeCategory = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Rapor Gelir",
    categoryType: "income",
    sortOrder: 2,
    requestId: randomUUID(),
  });

  await commit({
    ...common,
    type: "opening_balance",
    amount: "10000.00",
    accountId: bank.id,
    accountKind: "bank",
  });
  await commit({
    ...common,
    type: "income",
    amount: "5000.00",
    targetAccountId: bank.id,
    targetKind: "bank",
    categoryId: incomeCategory.id,
    incomeClass: "normal",
  });
  const bankExpense = await commit({
    ...common,
    type: "expense",
    amount: "100.00",
    sourceAccountId: bank.id,
    sourceKind: "bank",
    categoryId: expenseCategory.id,
  });
  await commit({
    ...common,
    type: "expense",
    amount: "200.00",
    sourceAccountId: card.id,
    sourceKind: "card",
    categoryId: expenseCategory.id,
  });
  await commit({
    ...common,
    type: "transfer",
    amount: "1000.00",
    feeAmount: "10.00",
    sourceAccountId: bank.id,
    sourceKind: "bank",
    targetAccountId: cash.id,
    targetKind: "cash",
  });
  await commit({
    ...common,
    type: "card_payment",
    amount: "50.00",
    bankAccountId: bank.id,
    cardAccountId: card.id,
  });
  await commit({
    ...common,
    type: "investment_buy",
    cashAccountId: bank.id,
    instrumentId: randomUUID(),
    quantity: "1.0000000000",
    unitPrice: "500.0000000000",
    feeAmount: "5.00",
  });
  await commit({
    ...common,
    type: "cashback_refund",
    amount: "25.00",
    targetAccountId: bank.id,
    targetKind: "bank",
    relatedTransactionId: bankExpense.transactionId,
    relatedExpenseRemaining: "100.00",
  });

  const live = await getMonthlyReport(sql, {
    userId: userA,
    period,
    version: "latest",
  });
  assert(
    live.source === "live" &&
      live.metrics.income === "5000.0000" &&
      live.metrics.grossExpense === "310.0000" &&
      live.metrics.refunds === "25.0000" &&
      live.metrics.netExpense === "285.0000" &&
      live.metrics.outflow === "285.0000" &&
      live.metrics.savings === "4715.0000",
    `B054 exact monthly definitions failed: ${JSON.stringify(live.metrics)}.`,
  );
  assert(
    live.metrics.trend.length === 1 && live.metrics.breakdown.length === 3,
    "B055 trend/category breakdown is incomplete.",
  );
  const bankFiltered = await getMonthlyReport(sql, {
    userId: userA,
    period,
    version: "latest",
    accountId: bank.id,
  });
  assert(
    bankFiltered.metrics.income === "5000.0000" &&
      bankFiltered.metrics.netExpense === "85.0000",
    "B055 account filter did not preserve ledger-role classification.",
  );

  const reason = "Sentetik ay kapanış kanıtı";
  const versionOne = await createMonthlyReportVersion(sql, keyring, {
    userId: userA,
    period,
    reason,
  });
  assert(
    versionOne.version === 1 &&
      versionOne.source === "version" &&
      versionOne.metrics.netExpense === "285.0000",
    "B056 first immutable report version failed.",
  );
  const plaintextRows = await sql`
    select count(*)::text as count
      from app_private.monthly_report_versions
     where position(
       encode(convert_to(${reason}, 'UTF8'), 'hex')
       in encode(generation_reason_enc, 'hex')
     ) > 0
  `;
  assert(
    plaintextRows[0]?.count === "0",
    "B056 version reason was stored as plaintext.",
  );

  await commit({
    ...common,
    occurredAt: "2026-08-05T12:00:00+03:00",
    economicDate: "2026-08-05",
    type: "expense",
    amount: "20.00",
    sourceAccountId: bank.id,
    sourceKind: "bank",
    categoryId: expenseCategory.id,
  });
  const staleOne = await getMonthlyReport(sql, {
    userId: userA,
    period,
    version: 1,
  });
  const latestAfterChange = await getMonthlyReport(sql, {
    userId: userA,
    period,
    version: "latest",
  });
  assert(
    staleOne.staleAt !== null &&
      staleOne.metrics.netExpense === "285.0000" &&
      latestAfterChange.source === "live" &&
      latestAfterChange.metrics.netExpense === "305.0000",
    "B056 source change did not preserve stale v1 and expose new live metrics.",
  );
  const versionTwo = await createMonthlyReportVersion(sql, keyring, {
    userId: userA,
    period,
    reason: "Sentetik değişiklik sonrası yeniden hesaplama",
  });
  const latestVersion = await getMonthlyReport(sql, {
    userId: userA,
    period,
    version: "latest",
  });
  assert(
    versionTwo.version === 2 &&
      versionTwo.metrics.netExpense === "305.0000" &&
      latestVersion.id === versionTwo.id &&
      latestVersion.checksum === versionTwo.checksum,
    "B056 new version/latest valid selection failed.",
  );
  await expectRejection(
    () =>
      getMonthlyReport(sql, {
        userId: userB,
        period,
        version: 1,
      }),
    "B056 cross-user stored report",
    (error) => error instanceof MonthlyReportNotFoundError,
  );
  await expectRejection(
    () =>
      sql`delete from app_private.monthly_report_versions where id = ${versionOne.id}::uuid`,
    "B056 hard delete",
    (error) => String(error?.code) === "55000",
  );

  const serverRows =
    await sql`select current_setting('server_version') as version`;
  console.log(`PostgreSQL server version: ${serverRows[0]?.version}`);
  console.log("P0-A3 B054 UAT-13 canonical monthly ledger aggregates: PASS");
  console.log("P0-A3 B055 account/category breakdown and trend: PASS");
  console.log("P0-A3 B056 watermark/stale/new immutable versions: PASS");
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
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
