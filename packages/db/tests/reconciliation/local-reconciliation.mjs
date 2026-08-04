import { randomBytes, randomUUID } from "node:crypto";
import {
  commitLedgerTransaction,
  commitRevisedTransaction,
  commitVoidTransaction,
  createBalanceSnapshot,
  createCategory,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  createReconciliationSession,
  provisionSystemLedgerAccounts,
  ReconciliationNotFoundError,
  ReconciliationStateError,
  resolveReconciliationItem,
} from "../../dist/index.js";
import {
  runSupabase,
  startLocalStack,
} from "../../../../scripts/db/common.mjs";

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = createLedgerSql(databaseUrl, { max: 10 });
const userA = randomUUID();
const userB = randomUUID();
const keyring = {
  activeKeyId: "local-reconciliation-key-v1",
  keys: new Map([["local-reconciliation-key-v1", randomBytes(32)]]),
};
const economicDate = "2026-08-04";
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

async function createSnapshot(accountId, statedBalance, second) {
  return createBalanceSnapshot(sql, {
    userId: userA,
    accountId,
    observedAt: `2026-08-04T23:59:${String(second).padStart(2, "0")}+03:00`,
    statedBalance,
    requestId: randomUUID(),
  });
}

async function createSession(accountId, snapshot) {
  return createReconciliationSession(sql, {
    userId: userA,
    accountId,
    periodStart: economicDate,
    periodEnd: economicDate,
    snapshotIds: [snapshot.id],
    requestId: randomUUID(),
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
      (${userA}::uuid, ${`p0-a3-reconciliation-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-a3-reconciliation-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);
  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Mutabakat Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const account = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik Mutabakat Hesabı",
    accountType: "bank",
    currency: "TRY",
    openingDate: economicDate,
    requestId: randomUUID(),
  });
  const category = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Mutabakat Gideri",
    categoryType: "expense",
    sortOrder: 1,
    requestId: randomUUID(),
  });
  await commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      type: "opening_balance",
      amount: "1000.00",
      accountId: account.id,
      accountKind: "bank",
      currency: "TRY",
      occurredAt: "2026-08-04T09:00:00+03:00",
      economicDate,
    },
  });

  const acceptedSnapshot = await createSnapshot(account.id, "1005.00", 1);
  assert(
    acceptedSnapshot.calculatedBalance === "1000.0000" &&
      acceptedSnapshot.difference === "5.0000",
    "B051 stated-calculated exact snapshot difference failed.",
  );
  await expectRejection(
    () =>
      createReconciliationSession(sql, {
        userId: userB,
        accountId: account.id,
        periodStart: economicDate,
        periodEnd: economicDate,
        snapshotIds: [acceptedSnapshot.id],
        requestId: randomUUID(),
      }),
    "B051 cross-user session",
    (error) => error instanceof ReconciliationStateError,
  );
  const acceptedSession = await createSession(account.id, acceptedSnapshot);
  const beforeAccepted = await sql`
    select count(*)::text as count from app_private.transactions
     where user_id = ${userA}::uuid
  `;
  const acceptedReason = "Sentetik açıklama: banka ekstresi esas alındı";
  const accepted = await resolveReconciliationItem(sql, keyring, {
    userId: userA,
    sessionId: acceptedSession.id,
    itemId: acceptedSession.items[0].id,
    resolutionType: "accepted",
    reason: acceptedReason,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
  });
  const afterAccepted = await sql`
    select count(*)::text as count from app_private.transactions
     where user_id = ${userA}::uuid
  `;
  const plaintextRows = await sql`
    select count(*)::text as count
      from app_private.reconciliation_items
     where position(
       encode(convert_to(${acceptedReason}, 'UTF8'), 'hex')
       in encode(reason_enc, 'hex')
     ) > 0
  `;
  assert(
    accepted.session.status === "resolved" &&
      accepted.session.items[0].snapshot.status === "ignored" &&
      accepted.transaction === null &&
      beforeAccepted[0]?.count === afterAccepted[0]?.count &&
      plaintextRows[0]?.count === "0",
    "B052 accepted difference must retain encrypted evidence without a ledger write.",
  );

  const adjustmentSnapshot = await createSnapshot(account.id, "1025.00", 2);
  const adjustmentSession = await createSession(account.id, adjustmentSnapshot);
  const adjusted = await resolveReconciliationItem(sql, keyring, {
    userId: userA,
    sessionId: adjustmentSession.id,
    itemId: adjustmentSession.items[0].id,
    resolutionType: "adjustment",
    reason: "Sentetik sayım farkı düzeltmesi",
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
  });
  assert(
    adjusted.transaction?.postings.some(
      (posting) =>
        posting.financialAccountId === account.id &&
        posting.side === "debit" &&
        posting.amountOriginal === "25.00",
    ) &&
      adjusted.session.items[0].transactionId ===
        adjusted.transaction.transactionId &&
      adjusted.session.items[0].snapshot.status === "resolved",
    `UAT-12 adjustment did not exactly close and link the difference: ${JSON.stringify(adjusted)}.`,
  );

  const missingSnapshot = await createSnapshot(account.id, "1015.00", 3);
  const missingSession = await createSession(account.id, missingSnapshot);
  const missing = await resolveReconciliationItem(sql, keyring, {
    userId: userA,
    sessionId: missingSession.id,
    itemId: missingSession.items[0].id,
    resolutionType: "missing_transaction",
    reason: "Sentetik eksik market işlemi",
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      type: "expense",
      amount: "10.00",
      sourceAccountId: account.id,
      sourceKind: "bank",
      categoryId: category.id,
      currency: "TRY",
      occurredAt: "2026-08-04T20:00:00+03:00",
      economicDate,
    },
  });
  assert(
    missing.transaction?.effects.personalExpenseDelta === "10.00" &&
      missing.session.status === "resolved",
    "UAT-12 missing transaction resolution failed.",
  );

  const concurrentSnapshot = await createSnapshot(account.id, "1016.00", 4);
  const concurrentSession = await createSession(account.id, concurrentSnapshot);
  const concurrent = await Promise.allSettled(
    ["bir", "iki"].map((suffix) =>
      resolveReconciliationItem(sql, keyring, {
        userId: userA,
        sessionId: concurrentSession.id,
        itemId: concurrentSession.items[0].id,
        resolutionType: "accepted",
        reason: `Sentetik eşzamanlı kabul ${suffix}`,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
      }),
    ),
  );
  assert(
    concurrent.filter(({ status }) => status === "fulfilled").length === 1 &&
      concurrent.filter(({ status }) => status === "rejected").length === 1,
    "B052 FOR UPDATE/SERIALIZABLE concurrent resolution allowed two winners.",
  );
  const concurrentRows = await sql`
    select session.unresolved_count, session.status,
           count(*) filter (where item.resolved_at is not null)::text as resolved
      from app_private.reconciliation_sessions as session
      join app_private.reconciliation_items as item
        on item.user_id = session.user_id and item.session_id = session.id
     where session.user_id = ${userA}::uuid
       and session.id = ${concurrentSession.id}::uuid
     group by session.id
  `;
  assert(
    concurrentRows[0]?.unresolved_count === 0 &&
      concurrentRows[0]?.status === "resolved" &&
      concurrentRows[0]?.resolved === "1",
    "B052 concurrent resolution final state is not exact.",
  );

  const original = await commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      type: "expense",
      amount: "20.00",
      sourceAccountId: account.id,
      sourceKind: "bank",
      categoryId: category.id,
      currency: "TRY",
      occurredAt: "2026-08-04T21:00:00+03:00",
      economicDate,
    },
  });
  const originalBefore = await sql`
    select row_to_json(transaction)::text as header,
           (select jsonb_agg(to_jsonb(posting) order by posting.sequence_no)::text
              from app_private.ledger_postings as posting
             where posting.transaction_id = transaction.id) as postings
      from app_private.transactions as transaction
     where transaction.id = ${original.transactionId}::uuid
  `;
  const voided = await commitVoidTransaction(sql, {
    userId: userA,
    transactionId: original.transactionId,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    reason: "Sentetik tam ters kayıt",
  });
  assert(
    voided.effects.personalExpenseDelta === "-20.00",
    "B053 void did not exactly reverse the original financial effect.",
  );
  const originalAfter = await sql`
    select row_to_json(transaction)::text as header,
           (select jsonb_agg(to_jsonb(posting) order by posting.sequence_no)::text
              from app_private.ledger_postings as posting
             where posting.transaction_id = transaction.id) as postings
      from app_private.transactions as transaction
     where transaction.id = ${original.transactionId}::uuid
  `;
  assert(
    originalBefore[0]?.header === originalAfter[0]?.header &&
      originalBefore[0]?.postings === originalAfter[0]?.postings,
    "B053 void mutated immutable original evidence.",
  );

  const reviseOriginal = await commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      type: "expense",
      amount: "30.00",
      sourceAccountId: account.id,
      sourceKind: "bank",
      categoryId: category.id,
      currency: "TRY",
      occurredAt: "2026-08-04T21:30:00+03:00",
      economicDate,
    },
  });
  const revised = await commitRevisedTransaction(sql, {
    userId: userA,
    transactionId: reviseOriginal.transactionId,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    reason: "Sentetik tutar revizyonu",
    replacement: {
      type: "expense",
      amount: "35.00",
      sourceAccountId: account.id,
      sourceKind: "bank",
      categoryId: category.id,
      currency: "TRY",
      occurredAt: "2026-08-04T21:31:00+03:00",
      economicDate,
    },
  });
  assert(
    revised.effects.personalExpenseDelta === "5.00" &&
      revised.postings.length === reviseOriginal.postings.length * 2,
    "B053 revise must reverse the original then post one replacement.",
  );

  const injectionTarget = await commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      type: "expense",
      amount: "40.00",
      sourceAccountId: account.id,
      sourceKind: "bank",
      categoryId: category.id,
      currency: "TRY",
      occurredAt: "2026-08-04T21:45:00+03:00",
      economicDate,
    },
  });
  const maliciousOriginalPostings = injectionTarget.postings.map((posting) => ({
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
  for (let index = 0; index < maliciousOriginalPostings.length; index += 1) {
    maliciousOriginalPostings[index] = {
      ...maliciousOriginalPostings[index],
      amount: "39.00",
      amountBase: "39.00",
    };
  }
  await expectRejection(
    () =>
      commitLedgerTransaction(sql, {
        userId: userA,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
        command: {
          type: "void",
          originalTransactionId: injectionTarget.transactionId,
          originalPostings: maliciousOriginalPostings,
          reason: "Sentetik istemci posting enjeksiyonu",
          currency: "TRY",
          occurredAt: "2026-08-04T22:00:00+03:00",
          economicDate,
        },
      }),
    "B053 database exact-reversal invariant",
    (error) => String(error?.code) === "23514",
  );

  const serverRows =
    await sql`select current_setting('server_version') as version`;
  console.log(`PostgreSQL server version: ${serverRows[0]?.version}`);
  console.log(
    "P0-A3 B051 exact snapshot/difference and cross-user isolation: PASS",
  );
  console.log("P0-A3 B052 UAT-12 resolutions, encryption, atomicity: PASS");
  console.log("P0-A3 B052 FOR UPDATE/SERIALIZABLE concurrency: PASS");
  console.log("P0-A3 B053 immutable exact void/revise and DB negative: PASS");
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
  }
}
