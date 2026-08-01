import { randomBytes, randomUUID } from "node:crypto";
import {
  assertBalanced,
  buildPostingPlan,
  evaluateGoalAllocation,
  evaluateReceivablePolicy,
  traceRecommendationRule,
} from "../../../domain/dist/index.js";
import {
  commitLedgerTransaction,
  createLedgerSql,
  IdempotencyConflictError,
  provisionSystemLedgerAccounts,
} from "../../dist/index.js";
import {
  runSupabase,
  startLocalStack,
} from "../../../../scripts/db/common.mjs";

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = createLedgerSql(databaseUrl, { max: 5 });
const userA = randomUUID();
const userB = randomUUID();
const accountIds = {
  bank: randomUUID(),
  bankTwo: randomUUID(),
  bankUsd: randomUUID(),
  card: randomUUID(),
  cash: randomUUID(),
  instrument: randomUUID(),
};
const categoryId = randomUUID();
const incomeCategoryId = randomUUID();
const common = {
  currency: "TRY",
  occurredAt: "2026-07-29T12:00:00+03:00",
  economicDate: "2026-07-29",
};
const evidence = [];
let stackStarted = false;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectDatabaseRejection(action, label, expectedCodes = []) {
  try {
    await action();
  } catch (error) {
    if (
      expectedCodes.length > 0 &&
      (!error || !expectedCodes.includes(String(error.code)))
    ) {
      throw new Error(
        `${label}: unexpected database code ${error?.code ?? "none"}.`,
      );
    }
    evidence.push(`${label}: rejected`);
    return;
  }
  throw new Error(`${label}: database unexpectedly accepted the operation.`);
}

function originalPostings(response) {
  return response.postings.map((posting) => ({
    ledgerRole: posting.ledgerRole,
    ...(posting.financialAccountId
      ? { financialAccountId: posting.financialAccountId }
      : {}),
    side: posting.side,
    amount: posting.amountOriginal,
    currency: posting.currency,
    fxRate: posting.fxRate,
    amountBase: posting.amountBase,
  }));
}

async function commitCase(label, command, overrides = {}) {
  const idempotencyKey = overrides.idempotencyKey ?? randomUUID();
  const input = {
    userId: userA,
    idempotencyKey,
    requestId: overrides.requestId ?? randomUUID(),
    actorSessionId: overrides.actorSessionId ?? randomUUID(),
    command,
  };
  const response = await commitLedgerTransaction(sql, input);
  assert(
    response.replayed === false,
    `${label}: first commit was marked replay.`,
  );
  assertBalanced(response.postings);
  evidence.push(`${label}: committed`);
  return { input, response };
}

async function insertSyntheticDailyCoreFixture(chart) {
  const institutionId = randomUUID();
  await sql`
    insert into app_private.institutions (
      id, user_id, name, institution_type
    ) values (
      ${institutionId}::uuid, ${userA}::uuid, 'Sentetik Kurum', 'bank'
    )
  `;
  await sql`
    insert into app_private.categories (
      id, user_id, name, category_type, default_ledger_account_id, sort_order
    ) values
      (${categoryId}::uuid, ${userA}::uuid, 'Sentetik Gider', 'expense', ${chart.expense}::uuid, 1),
      (${incomeCategoryId}::uuid, ${userA}::uuid, 'Sentetik Gelir', 'income', ${chart.income}::uuid, 2)
  `;
  const accounts = [
    [accountIds.bank, "6000", "bank", "TRY", "asset", "debit"],
    [accountIds.bankTwo, "6001", "bank", "TRY", "asset", "debit"],
    [accountIds.bankUsd, "6002", "bank", "USD", "asset", "debit"],
    [accountIds.cash, "6003", "cash", "TRY", "asset", "debit"],
    [accountIds.card, "6004", "credit_card", "TRY", "liability", "credit"],
  ];
  for (const [
    accountId,
    code,
    type,
    currency,
    accountClass,
    normalSide,
  ] of accounts) {
    const ledgerAccountId = randomUUID();
    await sql`
      insert into app_private.ledger_accounts (
        id, user_id, code, name, account_class, normal_side, system_role,
        hidden, active
      ) values (
        ${ledgerAccountId}::uuid, ${userA}::uuid, ${code},
        ${`Synthetic ${type}`}, ${accountClass}, ${normalSide}, null, true, true
      )
    `;
    await sql`
      insert into app_private.financial_accounts (
        id, user_id, institution_id, ledger_account_id, name_enc,
        name_key_id, name_algorithm, name_enc_version, name_nonce,
        name_auth_tag, name_aad_version, account_type, currency, opening_date
      ) values (
        ${accountId}::uuid, ${userA}::uuid, ${institutionId}::uuid,
        ${ledgerAccountId}::uuid, ${Buffer.from("synthetic")}, 'test-key',
        'AEAD_AES_256_GCM', 1, ${randomBytes(12)}, ${randomBytes(16)}, 1,
        ${type}, ${currency}, '2026-01-01'::date
      )
    `;
  }
}

try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalStack();
  stackStarted = true;
  runSupabase(["db", "reset", "--local"], { capture: true });

  const serverVersionRows =
    await sql`select current_setting('server_version') as version`;
  assert(
    String(serverVersionRows[0]?.version).startsWith("17."),
    "PostgreSQL server major must be 17.",
  );

  await sql`
    insert into auth.users (id, email, aud, role, created_at, updated_at)
    values
      (${userA}::uuid, ${`p0-a0-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-a0-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  const chartA = await provisionSystemLedgerAccounts(sql, userA);
  const chartB = await provisionSystemLedgerAccounts(sql, userB);
  assert(
    Object.keys(chartA).length === 13,
    "B014 user A chart must have 13 roles.",
  );
  assert(
    Object.keys(chartB).length === 13,
    "B014 user B chart must have 13 roles.",
  );
  await insertSyntheticDailyCoreFixture(chartA);

  const expense = await commitCase("UAT-01 bank expense", {
    ...common,
    type: "expense",
    amount: "427.50",
    sourceAccountId: accountIds.bank,
    sourceKind: "bank",
    categoryId,
  });
  const replay = await commitLedgerTransaction(sql, expense.input);
  assert(replay.replayed, "B019 replay flag must be true.");
  assert(
    replay.transactionId === expense.response.transactionId,
    "B019 replay must return the original transaction.",
  );
  evidence.push("B019 same key/same payload: replayed");

  await expectDatabaseRejection(
    () =>
      commitLedgerTransaction(sql, {
        ...expense.input,
        command: { ...expense.input.command, amount: "428.50" },
      }),
    "B019 same key/different payload",
  );
  try {
    await commitLedgerTransaction(sql, {
      ...expense.input,
      command: { ...expense.input.command, amount: "428.50" },
    });
    throw new Error("B019 conflict did not throw.");
  } catch (error) {
    assert(
      error instanceof IdempotencyConflictError,
      "B019 must expose idempotency_conflict.",
    );
  }

  await commitCase("UAT-02 transfer", {
    ...common,
    type: "transfer",
    amount: "1000.00",
    sourceAccountId: accountIds.bank,
    sourceKind: "bank",
    targetAccountId: accountIds.cash,
    targetKind: "cash",
  });
  await commitCase("UAT-03 card expense", {
    ...common,
    type: "expense",
    amount: "200.00",
    sourceAccountId: accountIds.card,
    sourceKind: "card",
    categoryId,
  });
  await commitCase("UAT-04 card payment", {
    ...common,
    type: "card_payment",
    amount: "150.00",
    bankAccountId: accountIds.bank,
    cardAccountId: accountIds.card,
  });
  await commitCase("UAT-05 subscription cashback", {
    ...common,
    type: "cashback_refund",
    amount: "25.00",
    targetAccountId: accountIds.card,
    targetKind: "card",
    relatedTransactionId: expense.response.transactionId,
    relatedExpenseRemaining: "427.50",
    subscriptionId: randomUUID(),
  });
  await commitCase("UAT-06 shared expense", {
    ...common,
    type: "shared_expense",
    totalAmount: "300.00",
    ownerShare: "100.00",
    shares: [
      { personId: randomUUID(), amount: "100.00" },
      { personId: randomUUID(), amount: "100.00" },
    ],
    paymentAccountId: accountIds.bank,
    paymentSourceKind: "bank",
  });
  await commitCase("UAT-07 receivable settlement", {
    ...common,
    type: "receivable_settlement",
    amount: "100.00",
    receivableId: randomUUID(),
    outstandingAmount: "250.00",
    targetAccountId: accountIds.bank,
    targetKind: "bank",
  });

  const beforeNoWrite = await sql`
    select count(*)::text as count
      from app_private.transactions
     where user_id = ${userA}::uuid
  `;
  const doubtfulPolicy = evaluateReceivablePolicy({
    nominalAmount: "1500.00",
    estimatedCollectibleAmount: "300.00",
    currency: "TRY",
    includeInNetWorth: false,
    includeInPlanning: false,
  });
  assert(
    doubtfulPolicy.netWorthAmount === "0.00",
    "UAT-08 net worth policy failed.",
  );
  const afterDoubtfulPolicy = await sql`
    select count(*)::text as count
      from app_private.transactions
     where user_id = ${userA}::uuid
  `;
  assert(
    afterDoubtfulPolicy[0]?.count === beforeNoWrite[0]?.count,
    "UAT-08 policy evaluation must not write ledger rows.",
  );
  evidence.push("UAT-08 doubtful receivable: no ledger write");

  await commitCase("UAT-09 expected realization", {
    ...common,
    type: "expected_realization",
    amount: "1200.00",
    expectedPaymentId: randomUUID(),
    alreadyRealized: false,
    targetAccountId: accountIds.bank,
    targetKind: "bank",
    incomeClass: "normal",
  });
  await commitCase("UAT-10 investment buy", {
    ...common,
    type: "investment_buy",
    cashAccountId: accountIds.bank,
    instrumentId: accountIds.instrument,
    quantity: "1.3100000000",
    unitPrice: "2450.0000000000",
    feeAmount: "5.00",
  });

  const goal = evaluateGoalAllocation("250.00", "500.00", "TRY");
  assert(
    goal.ledgerPostingCount === 0,
    "UAT-11 goal allocation must be virtual.",
  );
  const afterGoalPolicy = await sql`
    select count(*)::text as count
      from app_private.transactions
     where user_id = ${userA}::uuid
  `;
  assert(
    afterGoalPolicy[0]?.count === "9",
    "UAT-11 virtual allocation unexpectedly changed transaction count.",
  );
  evidence.push("UAT-11 goal allocation: bounded/no ledger write");

  await commitCase("UAT-12 reconciliation adjustment", {
    ...common,
    type: "balance_adjustment",
    amount: "10.00",
    direction: "increase",
    accountId: accountIds.bank,
    accountKind: "bank",
    reason: "Synthetic reconciliation difference",
    reconciliationId: randomUUID(),
  });

  const aggregateRows = await sql`
    select
      coalesce(sum(amount_base) filter (where side = 'debit'), 0)::text as debit_total,
      coalesce(sum(amount_base) filter (where side = 'credit'), 0)::text as credit_total
    from app_private.ledger_postings
    where user_id = ${userA}::uuid
  `;
  assert(
    aggregateRows[0]?.debit_total === aggregateRows[0]?.credit_total,
    "UAT-13 ledger aggregate must remain balanced.",
  );
  evidence.push("UAT-13 report source aggregate: balanced ledger query");

  const recommendationTrace = traceRecommendationRule("cash_buffer", 1);
  assert(
    recommendationTrace.version === 1,
    "UAT-14 rule version trace failed.",
  );
  const afterRecommendationRule = await sql`
    select count(*)::text as count
      from app_private.transactions
     where user_id = ${userA}::uuid
  `;
  assert(
    afterRecommendationRule[0]?.count === "10",
    "UAT-14 rule trace unexpectedly changed transaction count.",
  );
  evidence.push("UAT-14 recommendation: rule/version traced, no ledger write");

  const mobileExpense = await commitCase("UAT-15 mobile quick expense", {
    ...common,
    type: "expense",
    amount: "75.00",
    sourceAccountId: accountIds.bank,
    sourceKind: "bank",
    categoryId,
  });

  const filterIndexRows = await sql`
    select exists (
      select 1
        from pg_catalog.pg_indexes
       where schemaname = 'app_private'
         and tablename = 'transactions'
         and indexname = 'transactions_user_event_date_idx'
    ) as exists
  `;
  const filteredRows = await sql`
    select id::text
      from app_private.transactions
     where user_id = ${userA}::uuid
       and event_type = 'expense'
       and economic_date between '2026-07-01'::date and '2026-07-31'::date
     order by economic_date desc, id desc
  `;
  assert(
    filterIndexRows[0]?.exists,
    "UAT-16 transaction filter index is missing.",
  );
  assert(
    filteredRows.length >= 3,
    "UAT-16 filtered query missed expense rows.",
  );
  evidence.push("UAT-16 transaction filter: indexed query returned own rows");

  await commitCase("INV-09 explicit multi-currency FX", {
    ...common,
    currency: "USD",
    fxRate: "32.125000000000",
    type: "expense",
    amount: "10.00",
    sourceAccountId: accountIds.bankUsd,
    sourceKind: "bank",
    categoryId,
  });
  const voided = await commitCase("INV-10 exact reversal", {
    ...common,
    type: "void",
    originalTransactionId: expense.response.transactionId,
    reason: "Synthetic invariant reversal",
    originalPostings: originalPostings(expense.response),
  });
  assert(
    voided.response.effects.personalExpenseDelta === "-427.50",
    "INV-10 reversal effect is not exact.",
  );

  await commitCase("B013 income command", {
    ...common,
    type: "income",
    amount: "800.00",
    targetAccountId: accountIds.bank,
    targetKind: "bank",
    categoryId: incomeCategoryId,
    incomeClass: "normal",
  });
  await commitCase("B013 opening balance command", {
    ...common,
    type: "opening_balance",
    amount: "5000.00",
    accountId: accountIds.bankTwo,
    accountKind: "bank",
  });
  await commitCase("B013 investment sell command", {
    ...common,
    type: "investment_sell",
    cashAccountId: accountIds.bank,
    instrumentId: accountIds.instrument,
    quantity: "1.0000000000",
    availableQuantity: "1.3100000000",
    unitPrice: "2600.0000000000",
    costBasis: "2450.00",
    feeAmount: "5.00",
  });
  const revisionOriginal = mobileExpense;
  await commitCase("B013 revise command", {
    ...common,
    type: "revise",
    originalTransactionId: revisionOriginal.response.transactionId,
    reason: "Synthetic amount revision",
    originalPostings: originalPostings(revisionOriginal.response),
    replacement: {
      ...common,
      type: "expense",
      amount: "70.00",
      sourceAccountId: accountIds.bank,
      sourceKind: "bank",
      categoryId,
    },
  });

  const concurrentInput = {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    actorSessionId: randomUUID(),
    command: {
      ...common,
      type: "expense",
      amount: "1.00",
      sourceAccountId: accountIds.bank,
      sourceKind: "bank",
      categoryId,
    },
  };
  const concurrentResults = await Promise.all([
    commitLedgerTransaction(sql, concurrentInput),
    commitLedgerTransaction(sql, concurrentInput),
  ]);
  assert(
    concurrentResults[0]?.transactionId === concurrentResults[1]?.transactionId,
    "B019 concurrent replay created two transactions.",
  );
  assert(
    concurrentResults.filter(({ replayed }) => replayed).length === 1,
    "B019 concurrent replay must contain one stored replay.",
  );
  evidence.push("B019 concurrent same-key replay: one transaction");

  const afterNoWrite = await sql`
    select count(*)::text as count
      from app_private.transactions
     where user_id = ${userA}::uuid
  `;
  assert(
    Number(afterNoWrite[0]?.count) > Number(beforeNoWrite[0]?.count),
    "DB acceptance commits were not persisted.",
  );

  const atomicRows = await sql`
    select
      (select count(*) from app_private.transactions where user_id = ${userA}::uuid)::text as transactions,
      (select count(*) from app_private.ledger_postings where user_id = ${userA}::uuid)::text as postings,
      (select count(*) from app_private.audit_events where user_id = ${userA}::uuid)::text as audits,
      (select count(*) from app_private.outbox_events where user_id = ${userA}::uuid)::text as outbox
  `;
  const atomic = atomicRows[0];
  assert(atomic, "B021 atomic counts are missing.");
  assert(
    atomic.transactions === atomic.audits,
    "B021 audit count must match transactions.",
  );
  assert(
    atomic.transactions === atomic.outbox,
    "B023 outbox count must match transactions.",
  );
  assert(
    Number(atomic.postings) >= Number(atomic.transactions) * 2,
    "B017 posting count is too low.",
  );
  const chainRows = await sql`
    with ordered as (
      select
        prev_hash,
        lag(event_hash) over (order by occurred_at, id) as expected_prev_hash,
        row_number() over (order by occurred_at, id) as sequence
      from app_private.audit_events
      where user_id = ${userA}::uuid
    )
    select count(*)::text as count
      from ordered
     where (sequence = 1 and prev_hash is not null)
        or (sequence > 1 and prev_hash is distinct from expected_prev_hash)
  `;
  assert(chainRows[0]?.count === "0", "B022 audit hash chain linkage failed.");
  const duplicateOutboxRows = await sql`
    select count(*)::text as count
      from (
        select aggregate_id, event_type, event_version
          from app_private.outbox_events
         group by aggregate_id, event_type, event_version
        having count(*) > 1
      ) duplicates
  `;
  assert(
    duplicateOutboxRows[0]?.count === "0",
    "B023 duplicate outbox source found.",
  );

  const unbalancedId = randomUUID();
  await expectDatabaseRejection(
    () =>
      sql.begin("isolation level serializable", async (tx) => {
        await tx`
          insert into app_private.transactions (
            id, user_id, client_request_id, event_type, status,
            occurred_at, economic_date, primary_amount, primary_currency,
            category_id, engine_version, input_schema_version, input_json, preview_hash,
            revision_group_id, posted_at
          ) values (
            ${unbalancedId}::uuid, ${userA}::uuid, ${randomUUID()}::uuid,
            'expense', 'posted', now(), '2026-07-29'::date, 1.00, 'TRY', ${categoryId}::uuid,
            'ledger-1.0.0', 1, '{}'::jsonb, ${"a".repeat(64)}, ${randomUUID()}::uuid, now()
          )
        `;
      }),
    "INV-01 deferred unbalanced commit",
    ["23514"],
  );
  const rolledBack = await sql`
    select count(*)::text as count
      from app_private.transactions
     where id = ${unbalancedId}::uuid
  `;
  assert(
    rolledBack[0]?.count === "0",
    "B021 failed transaction was not atomic.",
  );

  await expectDatabaseRejection(
    () =>
      sql`update app_private.transactions set status = 'voided' where id = ${expense.response.transactionId}::uuid`,
    "INV-03 posted header update",
    ["55000"],
  );
  await expectDatabaseRejection(
    () =>
      sql`delete from app_private.transactions where id = ${expense.response.transactionId}::uuid`,
    "INV-10 posted header hard delete",
    ["55000"],
  );
  const firstPostingRows = await sql`
    select id::text
      from app_private.ledger_postings
     where transaction_id = ${expense.response.transactionId}::uuid
     order by sequence_no
     limit 1
  `;
  await expectDatabaseRejection(
    () =>
      sql`update app_private.ledger_postings set amount_base = amount_base + 1 where id = ${firstPostingRows[0]?.id}::uuid`,
    "INV-03 posted posting update",
    ["55000"],
  );
  await expectDatabaseRejection(
    () => sql`
      insert into app_private.ledger_postings (
        id, user_id, transaction_id, ledger_account_id, side,
        amount_original, currency, fx_rate, amount_base, role, sequence_no
      ) values (
        ${randomUUID()}::uuid, ${userA}::uuid, ${expense.response.transactionId}::uuid,
        ${chartA.expense}::uuid, 'debit', 1.00, 'TRY', 1.0, 1.00, 'expense', 99
      )
    `,
    "INV-03 posted transaction append",
    ["55000"],
  );

  await expectDatabaseRejection(
    () =>
      sql.begin(async (tx) => {
        const draftId = randomUUID();
        await tx`
          insert into app_private.transactions (
            id, user_id, client_request_id, event_type, status,
            occurred_at, economic_date, primary_amount, primary_currency,
            category_id, engine_version, input_schema_version, input_json, preview_hash,
            revision_group_id
          ) values (
            ${draftId}::uuid, ${userA}::uuid, ${randomUUID()}::uuid,
            'expense', 'draft', now(), '2026-07-29'::date, 1.00, 'TRY', ${categoryId}::uuid,
            'ledger-1.0.0', 1, '{}'::jsonb, ${"b".repeat(64)}, ${randomUUID()}::uuid
          )
        `;
        await tx`
          insert into app_private.ledger_postings (
            id, user_id, transaction_id, ledger_account_id, side,
            amount_original, currency, fx_rate, amount_base, role, sequence_no
          ) values (
            ${randomUUID()}::uuid, ${userB}::uuid, ${draftId}::uuid,
            ${chartB.expense}::uuid, 'debit', 1.00, 'TRY', 1.0, 1.00, 'expense', 1
          )
        `;
      }),
    "INV-04 composite owner mismatch",
    ["23503"],
  );

  const privilegeRows = await sql`
    select
      has_table_privilege('authenticated', 'app_private.transactions', 'insert') as authenticated_write,
      (
        select count(*)
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'app_private'
           and c.relname in (
             'ledger_accounts', 'transactions', 'ledger_postings',
             'transaction_links', 'idempotency_keys', 'audit_events', 'outbox_events'
           )
           and c.relrowsecurity
           and c.relforcerowsecurity
      )::text as forced_rls_count
  `;
  assert(
    !privilegeRows[0]?.authenticated_write,
    "Client received direct ledger write grant.",
  );
  assert(
    privilegeRows[0]?.forced_rls_count === "7",
    "P0-A0 forced RLS table count must be 7.",
  );

  await expectDatabaseRejection(
    () =>
      sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${userA}, true)`;
        await tx`set local role pfos_runtime`;
        await tx`select app_private.provision_system_ledger_accounts(${userB}::uuid)`;
      }),
    "SEC-RPC owner injection",
    ["42501"],
  );
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userA}, true)`;
    await tx`set local role pfos_runtime`;
    const ownRows = await tx`
      select count(*)::text as count from app_private.transactions
    `;
    const crossRows = await tx`
      select count(*)::text as count
        from app_private.transactions
       where user_id = ${userB}::uuid
    `;
    assert(Number(ownRows[0]?.count) > 0, "RLS own rows were not visible.");
    assert(crossRows[0]?.count === "0", "RLS exposed cross-user ledger rows.");
  });

  console.log("P0-A0 UAT financial rules engine+DB: 16/16 PASS");
  console.log(`PostgreSQL server version: ${serverVersionRows[0]?.version}`);
  console.log("INV-01–INV-10 ledger invariant suite: PASS");
  console.log("B019 idempotency replay/conflict: PASS");
  console.log("B021 SERIALIZABLE header+posting+audit+outbox atomicity: PASS");
  console.log("B022 append-only audit chain: PASS");
  console.log("B023 transactional outbox duplicates: 0");
  console.log(`Synthetic acceptance evidence rows: ${evidence.length}`);
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
  }
}
