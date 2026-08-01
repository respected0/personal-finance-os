import { randomBytes, randomUUID } from "node:crypto";
import {
  archiveFinancialAccount,
  commitLedgerTransaction,
  createCategory,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  getFinancialAccount,
  getTransactionDetail,
  LedgerReferenceError,
  listCategories,
  listFinancialAccounts,
  listInstitutions,
  listTransactions,
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
const keyring = {
  activeKeyId: "local-test-key-v1",
  keys: new Map([["local-test-key-v1", randomBytes(32)]]),
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
    actorSessionId: randomUUID(),
    command,
  });
}

const common = {
  currency: "TRY",
  occurredAt: "2026-08-01T12:00:00+03:00",
  economicDate: "2026-08-01",
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
      (${userA}::uuid, ${`p0-a1-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-a1-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  const profileRows = await sql`
    select count(*)::text as count
      from app_identity.profiles
     where id in (${userA}::uuid, ${userB}::uuid)
  `;
  assert(
    profileRows[0]?.count === "2",
    "Binding auth.users to profiles bootstrap did not create both owners.",
  );
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);

  const institutionA = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Banka A",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const institutionB = await createInstitution(sql, {
    userId: userB,
    name: "Sentetik Banka B",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const expenseCategory = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Market",
    categoryType: "expense",
  });
  const incomeCategory = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Maaş",
    categoryType: "income",
  });
  await createCategory(sql, {
    userId: userB,
    name: "Sentetik Kullanıcı B Gider",
    categoryType: "expense",
  });

  const bank = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institutionA.id,
    name: "Sentetik Ana Hesap",
    accountType: "bank",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });
  const cash = await createFinancialAccount(sql, keyring, {
    userId: userA,
    name: "Sentetik Nakit",
    accountType: "cash",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });
  for (const [name, accountType] of [
    ["Sentetik Cüzdan", "wallet"],
    ["Sentetik Kart", "credit_card"],
    ["Sentetik Yatırım", "investment"],
  ]) {
    await createFinancialAccount(sql, keyring, {
      userId: userA,
      institutionId: institutionA.id,
      name,
      accountType,
      currency: "TRY",
      openingDate: "2026-08-01",
      requestId: randomUUID(),
    });
  }
  const userBAccount = await createFinancialAccount(sql, keyring, {
    userId: userB,
    institutionId: institutionB.id,
    name: "Sentetik Kullanıcı B Hesabı",
    accountType: "bank",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });

  const encryptedRows = await sql`
    select name_enc from app_private.financial_accounts
     where id = ${bank.id}::uuid
  `;
  assert(
    !Buffer.from(encryptedRows[0]?.name_enc ?? []).includes(
      Buffer.from("Sentetik Ana Hesap", "utf8"),
    ),
    "B025 account name was stored as plaintext.",
  );
  assert(
    (await listInstitutions(sql, userA)).length === 1,
    "B025 institution list leaked or missed rows.",
  );
  assert(
    (await listCategories(sql, userA)).length === 2,
    "Daily categories were not owned and listed.",
  );

  const opening = await commit({
    ...common,
    type: "opening_balance",
    amount: "20000.00",
    accountId: bank.id,
    accountKind: "bank",
  });
  assert(
    opening.effects.personalExpenseDelta === "0.00" &&
      opening.effects.normalIncomeDelta === "0.00",
    "B026 opening balance changed period income or expense.",
  );
  await expectRejection(
    () =>
      commit({
        ...common,
        type: "opening_balance",
        amount: "1.00",
        accountId: bank.id,
        accountKind: "bank",
      }),
    "B026 duplicate opening balance",
  );

  const expense = await commit({
    ...common,
    type: "expense",
    amount: "427.50",
    sourceAccountId: bank.id,
    sourceKind: "bank",
    categoryId: expenseCategory.id,
  });
  assert(
    expense.effects.personalExpenseDelta === "427.50",
    "B028 free amount was not exact.",
  );
  const income = await commit({
    ...common,
    type: "income",
    amount: "800.00",
    targetAccountId: bank.id,
    targetKind: "bank",
    categoryId: incomeCategory.id,
    incomeClass: "normal",
  });
  assert(
    income.effects.normalIncomeDelta === "800.00",
    "B027 income effect was not exact.",
  );
  const transfer = await commit({
    ...common,
    type: "transfer",
    amount: "1000.00",
    feeAmount: "2.50",
    sourceAccountId: bank.id,
    sourceKind: "bank",
    targetAccountId: cash.id,
    targetKind: "cash",
  });
  assert(
    transfer.effects.personalExpenseDelta === "2.50" &&
      transfer.effects.normalIncomeDelta === "0.00" &&
      transfer.effects.netWorthDelta === "-2.50",
    "B029 transfer principal/fee classification failed.",
  );

  const bankAfter = await getFinancialAccount(sql, keyring, userA, bank.id);
  const cashAfter = await getFinancialAccount(sql, keyring, userA, cash.id);
  assert(
    bankAfter?.balance.calculatedOriginal === "19370.0000",
    `B034 bank balance mismatch: ${bankAfter?.balance.calculatedOriginal}.`,
  );
  assert(
    cashAfter?.balance.calculatedOriginal === "1000.0000",
    `B034 cash balance mismatch: ${cashAfter?.balance.calculatedOriginal}.`,
  );
  const history = await listTransactions(sql, {
    userId: userA,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    limit: 2,
  });
  assert(
    history.items.length === 2 && history.nextCursor,
    "B032 cursor page failed.",
  );
  const historyNext = await listTransactions(sql, {
    userId: userA,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    cursor: history.nextCursor ?? undefined,
    limit: 10,
  });
  assert(historyNext.items.length === 2, "B032 cursor continuation failed.");
  const allHistory = await listTransactions(sql, {
    userId: userA,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    limit: 10,
  });
  assert(
    allHistory.aggregate.personalExpense === "430.0000" &&
      allHistory.aggregate.normalIncome === "800.0000" &&
      allHistory.aggregate.net === "370.0000",
    `B032 aggregate mismatch: ${JSON.stringify(allHistory.aggregate)}.`,
  );
  const filtered = await listTransactions(sql, {
    userId: userA,
    accountId: bank.id,
    categoryId: expenseCategory.id,
    type: "expense",
  });
  assert(
    filtered.items.length === 1 && filtered.items[0]?.amount === "427.5000",
    "B032 account/type/category filter failed.",
  );
  const detail = await getTransactionDetail(sql, userA, expense.transactionId);
  assert(
    detail?.postings.length === 2 && detail.audit.eventCount === 1,
    "B032 transaction detail/posting/audit projection failed.",
  );

  const listedAccountTypes = (
    await listFinancialAccounts(sql, keyring, userA)
  ).map(({ accountType }) => accountType);
  assert(
    listedAccountTypes.length === 5 &&
      ["bank", "cash", "wallet", "credit_card", "investment"].every((type) =>
        listedAccountTypes.includes(type),
      ),
    "B025 account list missed a bound account type or leaked another owner.",
  );
  assert(
    (await getFinancialAccount(sql, keyring, userA, userBAccount.id)) === null,
    "B025 cross-user account read was visible.",
  );
  await expectRejection(
    () =>
      commitLedgerTransaction(sql, {
        userId: userA,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
        command: {
          ...common,
          type: "expense",
          amount: "1.00",
          sourceAccountId: userBAccount.id,
          sourceKind: "bank",
          categoryId: expenseCategory.id,
        },
      }),
    "B025 cross-user account commit",
    (error) => error instanceof LedgerReferenceError,
  );

  const archivedVersion = await archiveFinancialAccount(sql, {
    userId: userA,
    accountId: cash.id,
    rowVersion: cashAfter?.rowVersion ?? 1,
    requestId: randomUUID(),
  });
  assert(archivedVersion === 2, "B025 archive row version did not advance.");
  await expectRejection(
    () =>
      commit({
        ...common,
        type: "transfer",
        amount: "1.00",
        sourceAccountId: bank.id,
        sourceKind: "bank",
        targetAccountId: cash.id,
        targetKind: "cash",
      }),
    "B025 archived account posting",
    (error) => error instanceof LedgerReferenceError,
  );
  await expectRejection(
    () =>
      sql`delete from app_private.financial_accounts where id = ${cash.id}::uuid`,
    "B025 hard delete",
    (error) => String(error?.code) === "55000",
  );

  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userA}, true)`;
    await tx`set local role pfos_runtime`;
    const profileScope = await tx`
      select count(*)::text as count
        from app_identity.profiles
       where id in (${userA}::uuid, ${userB}::uuid)
    `;
    assert(
      profileScope[0]?.count === "1",
      "Profile forced RLS exposed a different user.",
    );
    const crossRows = await tx`
      select count(*)::text as count
        from app_private.financial_accounts
       where id = ${userBAccount.id}::uuid
    `;
    assert(
      crossRows[0]?.count === "0",
      "B025 forced RLS exposed user B account.",
    );
  });
  const injectedLedgerAccountId = randomUUID();
  await sql`
    insert into app_private.ledger_accounts (
      id, user_id, code, name, account_class, normal_side, system_role,
      hidden, active
    ) values (
      ${injectedLedgerAccountId}::uuid, ${userA}::uuid, '6999',
      'Synthetic owner mismatch', 'asset', 'debit', null, true, true
    )
  `;
  await expectRejection(
    () => sql`
      insert into app_private.financial_accounts (
        id, user_id, institution_id, ledger_account_id, name_enc,
        name_key_id, name_nonce, name_auth_tag, account_type, currency, opening_date
      ) values (
        ${randomUUID()}::uuid, ${userA}::uuid, ${institutionB.id}::uuid,
        ${injectedLedgerAccountId}::uuid, ${Buffer.from("synthetic")}, 'test',
        ${randomBytes(12)}, ${randomBytes(16)}, 'bank', 'TRY', '2026-08-01'
      )
    `,
    "B025 composite owner injection",
    (error) => String(error?.code) === "23503",
  );

  const auditLeakRows = await sql`
    select count(*)::text as count
      from app_private.audit_events
     where after_json::text ilike '%Sentetik Ana Hesap%'
  `;
  assert(
    auditLeakRows[0]?.count === "0",
    "Account name leaked into audit JSON.",
  );

  const versionRows = await sql`
    select current_setting('server_version') as version
  `;
  console.log(`PostgreSQL server version: ${versionRows[0]?.version}`);
  console.log("P0-A1 B025 account/RLS/archive/encryption: PASS");
  console.log("P0-A1 B026 opening balance income/expense delta: 0");
  console.log("P0-A1 B027/B028 income and 427.50 expense: PASS");
  console.log("P0-A1 B029 transfer principal neutral, fee 2.50 expense: PASS");
  console.log("P0-A1 B032 cursor/detail/filter/aggregate: PASS");
  console.log("P0-A1 B034 account/history ledger projection difference: 0");
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
  }
}
