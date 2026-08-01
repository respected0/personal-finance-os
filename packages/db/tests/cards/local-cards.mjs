import { randomBytes, randomUUID } from "node:crypto";
import {
  commitLedgerTransaction,
  createCategory,
  createCreditCardProfile,
  createCreditCardStatement,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  getFinancialAccount,
  listCreditCardProfiles,
  listCreditCardStatements,
  listInstallmentPlans,
  listTransactions,
  provisionSystemLedgerAccounts,
  StatementAllocationError,
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
  activeKeyId: "local-card-test-key-v1",
  keys: new Map([["local-card-test-key-v1", randomBytes(32)]]),
};
const common = {
  currency: "TRY",
  occurredAt: "2026-08-01T12:00:00+03:00",
  economicDate: "2026-08-01",
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

async function commit(command, idempotencyKey = randomUUID()) {
  return commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey,
    requestId: randomUUID(),
    actorSessionId: randomUUID(),
    command,
  });
}

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
      (${userA}::uuid, ${`p0-a2-card-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-a2-card-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);

  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Kart Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const expenseCategory = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Kart Harcaması",
    categoryType: "expense",
  });
  const bank = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik Ödeme Hesabı",
    accountType: "bank",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });
  const card = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik Test Kartı",
    accountType: "credit_card",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });
  const otherCard = await createFinancialAccount(sql, keyring, {
    userId: userB,
    name: "Sentetik Diğer Kullanıcı Kartı",
    accountType: "credit_card",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });

  await createCreditCardProfile(sql, {
    userId: userA,
    accountId: card.id,
    creditLimit: "25000.00",
    statementDay: 20,
    dueDay: 30,
    minimumPaymentRule: {
      type: "percentage",
      rate: "0.20",
      minimumAmount: "100.00",
    },
    requestId: randomUUID(),
  });
  const profiles = await listCreditCardProfiles(sql, userA);
  assert(
    profiles.length === 1 && profiles[0]?.creditLimit === "25000.0000",
    "B037 exact credit-card profile was not persisted.",
  );
  assert(
    (await listCreditCardProfiles(sql, userB)).length === 0,
    "B037 profile list leaked another user's card.",
  );
  await expectRejection(
    () =>
      createCreditCardProfile(sql, {
        userId: userA,
        accountId: otherCard.id,
        creditLimit: "1.00",
        statementDay: 1,
        dueDay: 10,
        minimumPaymentRule: { type: "fixed", amount: "1.00" },
        requestId: randomUUID(),
      }),
    "B037 owner injection",
  );

  await commit({
    ...common,
    type: "opening_balance",
    amount: "5000.00",
    accountId: bank.id,
    accountKind: "bank",
  });
  const bankBeforeExpense = await getFinancialAccount(
    sql,
    keyring,
    userA,
    bank.id,
  );
  const cardExpense = await commit({
    ...common,
    type: "expense",
    amount: "427.50",
    sourceAccountId: card.id,
    sourceKind: "card",
    categoryId: expenseCategory.id,
  });
  const bankAfterExpense = await getFinancialAccount(
    sql,
    keyring,
    userA,
    bank.id,
  );
  const cardAfterExpense = await getFinancialAccount(
    sql,
    keyring,
    userA,
    card.id,
  );
  assert(
    cardExpense.effects.personalExpenseDelta === "427.50" &&
      bankAfterExpense?.balance.calculatedOriginal ===
        bankBeforeExpense?.balance.calculatedOriginal &&
      cardAfterExpense?.balance.calculatedOriginal === "427.5000",
    "UAT03 card expense did not create expense plus card debt without changing bank.",
  );

  const statement = await createCreditCardStatement(sql, {
    userId: userA,
    cardAccountId: card.id,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-20",
    closingBalance: "427.50",
    minimumDue: "100.00",
    dueDate: "2026-08-30",
    requestId: randomUUID(),
  });
  const payment = await commit({
    ...common,
    type: "card_payment",
    amount: "200.00",
    bankAccountId: bank.id,
    cardAccountId: card.id,
    statementAllocations: [{ statementId: statement.id, amount: "200.00" }],
  });
  const bankAfterPayment = await getFinancialAccount(
    sql,
    keyring,
    userA,
    bank.id,
  );
  const cardAfterPayment = await getFinancialAccount(
    sql,
    keyring,
    userA,
    card.id,
  );
  const statements = await listCreditCardStatements(sql, userA, card.id);
  assert(
    payment.effects.personalExpenseDelta === "0.00" &&
      payment.effects.normalIncomeDelta === "0.00" &&
      payment.effects.netWorthDelta === "0.00" &&
      bankAfterPayment?.balance.calculatedOriginal === "4800.0000" &&
      cardAfterPayment?.balance.calculatedOriginal === "227.5000" &&
      statements[0]?.paidAmount === "200.0000" &&
      statements[0]?.outstandingAmount === "227.5000",
    "UAT04 card payment was not expense-neutral or statement-linked.",
  );
  await expectRejection(
    () =>
      commit({
        ...common,
        type: "card_payment",
        amount: "228.00",
        bankAccountId: bank.id,
        cardAccountId: card.id,
        statementAllocations: [{ statementId: statement.id, amount: "228.00" }],
      }),
    "B040 over-allocation",
    (error) => error instanceof StatementAllocationError,
  );

  const installment = await commit({
    ...common,
    type: "expense",
    amount: "1000.01",
    sourceAccountId: card.id,
    sourceKind: "card",
    categoryId: expenseCategory.id,
    installmentCount: 3,
    firstInstallmentDate: "2026-09-20",
  });
  const plans = await listInstallmentPlans(sql, userA, card.id);
  const installmentSum = plans[0]?.items.reduce(
    (sum, item) => sum + BigInt(item.cashFlowAmount.replace(".", "")),
    0n,
  );
  assert(
    installment.effects.personalExpenseDelta === "1000.01" &&
      plans[0]?.purchaseTotal === "1000.0100" &&
      plans[0]?.installmentCount === 3 &&
      plans[0]?.items.length === 3 &&
      installmentSum === 10000100n,
    "B041 installment schedule did not preserve full-at-purchase recognition and exact sum.",
  );

  const period = await listTransactions(sql, {
    userId: userA,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    limit: 25,
  });
  assert(
    period.aggregate.personalExpense === "1427.5100" &&
      period.aggregate.normalIncome === "0.0000",
    `B038/B039/B041 report classification mismatch: ${JSON.stringify(period.aggregate)}.`,
  );
  const creditLimitRows = await sql`
    select coalesce(sum(lp.amount_base), 0)::numeric(19,4)::text as ledger_value
      from app_private.ledger_postings lp
     where lp.user_id = ${userA}::uuid
  `;
  assert(
    creditLimitRows[0]?.ledger_value !== "25000.0000",
    "B037 credit limit leaked into ledger/net worth.",
  );

  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userA}, true)`;
    await tx`set local role pfos_runtime`;
    const rows = await tx`
      select count(*)::text as count
        from app_private.credit_card_profiles
       where account_id = ${otherCard.id}::uuid
    `;
    assert(rows[0]?.count === "0", "B037 forced RLS exposed user B card.");
  });

  const versionRows = await sql`
    select current_setting('server_version') as version
  `;
  console.log(`PostgreSQL server version: ${versionRows[0]?.version}`);
  console.log("P0-A2 B037 credit-card profile/limit/RLS: PASS");
  console.log(
    "P0-A2 UAT03 card expense bank delta 0, expense/debt exact: PASS",
  );
  console.log("P0-A2 UAT04 payment expense delta 0, bank/debt down: PASS");
  console.log("P0-A2 B040 statement partial allocation/over-allocation: PASS");
  console.log("P0-A2 B041 full-at-purchase and exact installment total: PASS");
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
  }
}
