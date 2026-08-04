import { randomBytes, randomUUID } from "node:crypto";
import {
  commitLedgerTransaction,
  createCategory,
  createFinancialAccount,
  createExpectedPayment,
  createInvestableRun,
  createCounterparty,
  createManualReceivable,
  createGoal,
  createGoalAllocation,
  createInstitution,
  createLedgerSql,
  getBudget,
  getFinancialAccount,
  listGoals,
  listExpectedPayments,
  provisionSystemLedgerAccounts,
  putBudget,
  realizeExpectedPayment,
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
  activeKeyId: "local-planning-key-v1",
  keys: new Map([["local-planning-key-v1", randomBytes(32)]]),
};
let stackStarted = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
      (${userA}::uuid, ${`p0-b1-planning-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-b1-planning-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);
  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Planlama Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const bank = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik Planlama Hesabı",
    accountType: "bank",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });
  const expense = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Planlama Gideri",
    categoryType: "expense",
    sortOrder: 1,
    requestId: randomUUID(),
  });
  const common = {
    currency: "TRY",
    occurredAt: "2026-08-04T12:00:00+03:00",
    economicDate: "2026-08-04",
  };
  await commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      ...common,
      type: "opening_balance",
      amount: "1000.0000",
      accountId: bank.id,
      accountKind: "bank",
    },
  });
  await commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      ...common,
      type: "expense",
      amount: "100.0000",
      sourceAccountId: bank.id,
      sourceKind: "bank",
      categoryId: expense.id,
    },
  });

  const budget = await putBudget(sql, {
    userId: userA,
    period: "2026-08",
    expectedVersion: 0,
    budget: {
      status: "active",
      lines: [
        {
          categoryId: expense.id,
          plannedAmount: "250.0000",
          rolloverPolicy: "none",
          warningThreshold: "0.8000",
        },
      ],
    },
  });
  assert(
    budget.lines[0]?.actualAmount === "100.0000" &&
      budget.lines[0]?.plannedAmount === "250.0000",
    "B062/B063 budget actual was not derived exactly from posted expense roles.",
  );
  const postingCountBefore = await sql`
    select count(*)::integer as count from app_private.ledger_postings
     where user_id = ${userA}::uuid
  `;
  await putBudget(sql, {
    userId: userA,
    period: "2026-08",
    expectedVersion: budget.rowVersion,
    budget: {
      status: "active",
      lines: [
        {
          categoryId: expense.id,
          plannedAmount: "300.0000",
          rolloverPolicy: "none",
          warningThreshold: "0.8000",
        },
      ],
    },
  });
  assert(
    (await getBudget(sql, userA, "2026-08"))?.lines[0]?.actualAmount ===
      "100.0000",
    "B064 budget projection changed its ledger-derived actual.",
  );

  const createSyntheticGoal = (title) =>
    createGoal(sql, keyring, {
      userId: userA,
      title,
      targetAmount: "2000.0000",
      targetDate: "2026-12-31",
      priority: 1,
      riskLevel: "low",
    });
  const [goalOne, goalTwo] = await Promise.all([
    createSyntheticGoal("Sentetik Hedef Bir"),
    createSyntheticGoal("Sentetik Hedef İki"),
  ]);
  const beforeAllocation = await getFinancialAccount(
    sql,
    keyring,
    userA,
    bank.id,
  );
  const outcomes = await Promise.allSettled([
    createGoalAllocation(sql, keyring, {
      userId: userA,
      goalId: goalOne.id,
      expectedVersion: goalOne.rowVersion,
      accountId: bank.id,
      allocatedValue: "700.0000",
      effectiveFrom: "2026-08-04",
    }),
    createGoalAllocation(sql, keyring, {
      userId: userA,
      goalId: goalTwo.id,
      expectedVersion: goalTwo.rowVersion,
      accountId: bank.id,
      allocatedValue: "700.0000",
      effectiveFrom: "2026-08-04",
    }),
  ]);
  assert(
    outcomes.filter(({ status }) => status === "fulfilled").length === 1 &&
      outcomes.filter(({ status }) => status === "rejected").length === 1,
    "INV-07 concurrent allocations did not produce exactly one bounded winner.",
  );
  const afterAllocation = await getFinancialAccount(
    sql,
    keyring,
    userA,
    bank.id,
  );
  const postingCountAfter = await sql`
    select count(*)::integer as count from app_private.ledger_postings
     where user_id = ${userA}::uuid
  `;
  const goals = await listGoals(sql, keyring, userA);
  assert(
    beforeAllocation?.balance.calculatedBase ===
      afterAllocation?.balance.calculatedBase &&
      postingCountBefore[0]?.count === postingCountAfter[0]?.count &&
      goals.reduce((sum, goal) => sum + Number(goal.ledgerPostingCount), 0) ===
        0,
    "UAT-11 virtual allocation changed the balance, net-worth source, or ledger.",
  );
  assert(
    goals.filter((goal) => goal.allocatedValue === "700.0000").length === 1 &&
      goals.every((goal) => goal.progressAmount === goal.allocatedValue),
    "B067 goal progress did not use the canonical non-duplicated allocation projection.",
  );
  assert(
    (await listGoals(sql, keyring, userB)).length === 0 &&
      (await getBudget(sql, userB, "2026-08")) === null,
    "Planning data crossed the RLS user boundary.",
  );
  const plaintext = await sql`
    select count(*)::integer as count from app_private.goals
     where position(encode(convert_to('Sentetik Hedef', 'UTF8'), 'hex')
       in encode(title_enc, 'hex')) > 0
  `;
  assert(plaintext[0]?.count === 0, "Goal title was stored as plaintext.");

  const expected = await createExpectedPayment(sql, keyring, {
    userId: userA,
    source: "Sentetik beklenen ödeme",
    expectedAmount: "5000.0000",
    expectedDate: "2026-08-10",
    certaintyLevel: "likely",
  });
  const person = await createCounterparty(sql, keyring, {
    userId: userA,
    type: "person",
    name: "Sentetik şüpheli borçlu",
    requestId: randomUUID(),
  });
  await createManualReceivable(sql, {
    userId: userA,
    personId: person.id,
    currency: "TRY",
    nominalAmount: "10000.0000",
    estimatedCollectibleAmount: "0.0000",
    collectabilityStatus: "doubtful",
    includeInNetWorth: false,
    includeInPlanning: false,
    requestId: randomUUID(),
  });
  const postingCountBeforeExpected = (
    await sql`
    select count(*)::integer count from app_private.ledger_postings where user_id = ${userA}::uuid
  `
  )[0]?.count;
  const run = await createInvestableRun(sql, {
    userId: userA,
    asOf: "2026-08-04",
    operatingBufferAmount: "100.0000",
  });
  assert(
    run.liquidVerifiedAmount === "900.0000" &&
      run.committedOutflowAmount === "200.0000" &&
      run.excludedExpectedAmount === "5000.0000" &&
      run.excludedDoubtfulReceivableAmount === "10000.0000" &&
      run.canonicalInvestableAmount === "600.0000" &&
      run.evidence.expected.includedAmount === "0.0000" &&
      run.evidence.doubtfulReceivable.includedAmount === "0.0000",
    "B070 canonical investable result included expected/doubtful money or used a non-binding source.",
  );
  assert(
    (
      await sql`select count(*)::integer count from app_private.ledger_postings where user_id = ${userA}::uuid`
    )[0]?.count === postingCountBeforeExpected,
    "B068 expected payment or B070 investable run wrote a ledger posting.",
  );
  const realizationKey = randomUUID();
  const realization = {
    userId: userA,
    expectedPaymentId: expected.id,
    idempotencyKey: realizationKey,
    requestId: randomUUID(),
    targetAccountId: bank.id,
    targetKind: "bank",
    currency: "TRY",
    occurredAt: "2026-08-10T09:00:00.000Z",
    economicDate: "2026-08-10",
  };
  const firstRealization = await realizeExpectedPayment(sql, realization);
  const replay = await realizeExpectedPayment(sql, {
    ...realization,
    requestId: randomUUID(),
  });
  assert(
    firstRealization.replayed === false &&
      replay.replayed === true &&
      replay.transactionId === firstRealization.transactionId,
    "B069 idempotent replay did not return the sole realization.",
  );
  const second = await Promise.allSettled([
    realizeExpectedPayment(sql, {
      ...realization,
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
    }),
    realizeExpectedPayment(sql, {
      ...realization,
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
    }),
  ]);
  assert(
    second.every(
      (result) =>
        result.status === "rejected" &&
        result.reason?.code === "already_realized",
    ),
    "B069 concurrent/different-key duplicate realization was not rejected with 409 semantics.",
  );
  const realized = (await listExpectedPayments(sql, keyring, userA)).find(
    (item) => item.id === expected.id,
  );
  assert(
    realized?.status === "received" &&
      realized.realizedTransactionId === firstRealization.transactionId,
    "B069 expected payment did not link exactly one posted income transaction.",
  );
  assert(
    (await listExpectedPayments(sql, keyring, userB)).length === 0,
    "Expected payments crossed the RLS user boundary.",
  );
  const expectedPlaintext =
    await sql`select count(*)::integer count from app_private.expected_payments where position(encode(convert_to('Sentetik beklenen ödeme', 'UTF8'), 'hex') in encode(source_enc, 'hex')) > 0`;
  assert(
    expectedPlaintext[0]?.count === 0,
    "Expected-payment source was stored as plaintext.",
  );

  console.log("P0-B1 B062-B067 budget/goal PostgreSQL acceptance: PASS");
  console.log("UAT-11 SERIALIZABLE/FOR UPDATE allocation concurrency: PASS");
  console.log(
    "P0-B1 B068-B072 expected/investable PostgreSQL acceptance: PASS",
  );
  console.log("UAT-09 exactly-once expected-payment realization: PASS");
  console.log(
    "G5 expected/doubtful planning effect 0 and canonical formula: PASS",
  );
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
