import { randomBytes, randomUUID } from "node:crypto";
import {
  createCounterparty,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  createManualReceivable,
  createSharedExpense,
  getFinancialAccount,
  listReceivables,
  previewSharedExpense,
  provisionSystemLedgerAccounts,
  ReceivableSettlementStateError,
  settleReceivable,
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
  activeKeyId: "local-sharing-key-v1",
  keys: new Map([["local-sharing-key-v1", randomBytes(32)]]),
};
const common = {
  currency: "TRY",
  occurredAt: "2026-08-03T12:00:00+03:00",
  economicDate: "2026-08-03",
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
      (${userA}::uuid, ${`p0-a2-sharing-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-a2-sharing-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);
  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Ortak Gider Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const bank = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik Tahsilat Hesabı",
    accountType: "bank",
    currency: "TRY",
    openingDate: "2026-08-03",
    requestId: randomUUID(),
  });
  const personOne = await createCounterparty(sql, keyring, {
    userId: userA,
    type: "person",
    name: "Sentetik Kişi Bir",
    requestId: randomUUID(),
  });
  const personTwo = await createCounterparty(sql, keyring, {
    userId: userA,
    type: "person",
    name: "Sentetik Kişi İki",
    requestId: randomUUID(),
  });
  const sharedCommand = {
    ...common,
    type: "shared_expense",
    totalAmount: "100.00",
    ownerShare: "33.33",
    roundingAmount: "0.01",
    shares: [
      { personId: personOne.id, amount: "33.33" },
      { personId: personTwo.id, amount: "33.33" },
    ],
    paymentAccountId: bank.id,
    paymentSourceKind: "bank",
  };
  const preview = await previewSharedExpense(sql, {
    userId: userA,
    command: sharedCommand,
  });
  assert(
    preview.effects.personalExpenseDelta === "33.34" &&
      preview.postings
        .filter(
          ({ ledgerRole, side }) =>
            ledgerRole === "receivable_asset" && side === "debit",
        )
        .map(({ amountOriginal }) => amountOriginal)
        .join(",") === "33.33,33.33",
    "B044 exact owner/share/rounding split preview failed.",
  );
  const sharedInput = {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    requestPayload: {
      totalAmount: sharedCommand.totalAmount,
      ownerShare: sharedCommand.ownerShare,
      roundingAmount: sharedCommand.roundingAmount,
      shares: sharedCommand.shares,
      paymentAccountId: sharedCommand.paymentAccountId,
      paymentSourceKind: sharedCommand.paymentSourceKind,
      currency: sharedCommand.currency,
      occurredAt: sharedCommand.occurredAt,
      economicDate: sharedCommand.economicDate,
    },
    command: sharedCommand,
  };
  const created = await createSharedExpense(sql, sharedInput);
  const replay = await createSharedExpense(sql, sharedInput);
  assert(
    created.transaction.effects.personalExpenseDelta === "33.34" &&
      created.sharedExpense.shares.length === 2 &&
      replay.transaction.replayed &&
      replay.sharedExpense.id === created.sharedExpense.id,
    "UAT-06 one payment / two receivables / idempotent replay failed.",
  );
  const receivables = await listReceivables(sql, keyring, { userId: userA });
  assert(
    receivables.length === 2 &&
      receivables.every((row) => row.nominalAmount === "33.3300"),
    "B045 shared payment did not create exact receivables.",
  );
  assert(
    (await listReceivables(sql, keyring, { userId: userB })).length === 0,
    "B046 receivables leaked across users.",
  );
  const doubtfulId = await createManualReceivable(sql, {
    userId: userA,
    personId: personOne.id,
    currency: "TRY",
    nominalAmount: "10000.00",
    estimatedCollectibleAmount: "0.00",
    collectabilityStatus: "doubtful",
    includeInNetWorth: false,
    includeInPlanning: false,
    requestId: randomUUID(),
  });
  const doubtful = (
    await listReceivables(sql, keyring, { userId: userA })
  ).find((row) => row.id === doubtfulId);
  assert(
    doubtful?.nominalAmount === "10000.0000" &&
      doubtful.recognizedAmount === "0.0000" &&
      !doubtful.includeInNetWorth &&
      !doubtful.includeInPlanning,
    "UAT-08 nominal visibility and zero net-worth/planning recognition failed.",
  );
  const receivable = created.sharedExpense.shares[0]?.receivableId;
  assert(receivable, "UAT-07 requires a receivable from the shared expense.");
  const beforeSettlement = await getFinancialAccount(
    sql,
    keyring,
    userA,
    bank.id,
  );
  const settlement = await settleReceivable(sql, {
    userId: userA,
    receivableId: receivable,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    requestPayload: {
      amount: "10.00",
      ...common,
      targetAccountId: bank.id,
      targetKind: "bank",
    },
    amount: "10.00",
    ...common,
    targetAccountId: bank.id,
    targetKind: "bank",
  });
  const afterSettlement = await getFinancialAccount(
    sql,
    keyring,
    userA,
    bank.id,
  );
  const partial = (await listReceivables(sql, keyring, { userId: userA })).find(
    (row) => row.id === receivable,
  );
  assert(
    settlement.effects.normalIncomeDelta === "0.00" &&
      afterSettlement?.balance.calculatedOriginal === "-90.0000" &&
      beforeSettlement?.balance.calculatedOriginal === "-100.0000" &&
      partial?.outstandingAmount === "23.3300",
    "UAT-07 partial settlement did not increase cash, reduce receivable, and keep income zero.",
  );
  await expectRejection(
    () =>
      settleReceivable(sql, {
        userId: userA,
        receivableId: receivable,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
        requestPayload: {
          amount: "23.34",
          ...common,
          targetAccountId: bank.id,
          targetKind: "bank",
        },
        amount: "23.34",
        ...common,
        targetAccountId: bank.id,
        targetKind: "bank",
      }),
    "UAT-07 overpayment",
    (error) => error instanceof ReceivableSettlementStateError,
  );
  const concurrentId = created.sharedExpense.shares[1]?.receivableId;
  assert(concurrentId, "B048 requires a second receivable.");
  const concurrent = await Promise.allSettled(
    ["20.00", "20.00"].map((amount) =>
      settleReceivable(sql, {
        userId: userA,
        receivableId: concurrentId,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
        requestPayload: {
          amount,
          ...common,
          targetAccountId: bank.id,
          targetKind: "bank",
        },
        amount,
        ...common,
        targetAccountId: bank.id,
        targetKind: "bank",
      }),
    ),
  );
  assert(
    concurrent.filter((result) => result.status === "fulfilled").length === 1 &&
      concurrent.filter((result) => result.status === "rejected").length === 1,
    "B048 concurrent settlements did not produce one valid final state.",
  );
  const concurrentFinal = (
    await listReceivables(sql, keyring, { userId: userA })
  ).find((row) => row.id === concurrentId);
  assert(
    concurrentFinal?.collectedAmount === "20.0000" &&
      concurrentFinal.outstandingAmount === "13.3300",
    "B048 FOR UPDATE/SERIALIZABLE final receivable state is not exact.",
  );
  await expectRejection(
    () =>
      sql.begin(async (tx) => {
        await tx`
          update app_private.shared_expenses
             set owner_share = 1.00
           where id = ${created.sharedExpense.id}::uuid
        `;
      }),
    "B044 immutable split",
  );
  const versionRows =
    await sql`select current_setting('server_version') as version`;
  console.log(`PostgreSQL server version: ${versionRows[0]?.version}`);
  console.log("P0-A2 B044 exact split/rounding deferred invariant: PASS");
  console.log("P0-A2 B045 UAT-06 one payment and receivables: PASS");
  console.log(
    "P0-A2 B046 UAT-08 nominal visible, net-worth/planning zero: PASS",
  );
  console.log(
    "P0-A2 B047 UAT-07 partial settlement/income zero/overpay reject: PASS",
  );
  console.log(
    "P0-A2 B048 FOR UPDATE/SERIALIZABLE concurrency final state: PASS",
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
