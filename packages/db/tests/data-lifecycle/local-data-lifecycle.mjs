import { createHash, randomBytes, randomUUID } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import {
  cancelAccountDeletion,
  commitLedgerTransaction,
  createCategory,
  createDataExport,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  createMonthlyReportVersion,
  DataLifecycleError,
  getDataExport,
  provisionSystemLedgerAccounts,
  purgeDueAccountDeletion,
  requestAccountDeletion,
  validateDataRestore,
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
  activeKeyId: "local-data-lifecycle-key-v1",
  keys: new Map([["local-data-lifecycle-key-v1", randomBytes(32)]]),
};
const passphrase = "sentetik-recovery-passphrase-2026";
let stackStarted = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectRejection(action, label, predicate = () => true) {
  try {
    await action();
  } catch (error) {
    if (!predicate(error))
      throw new Error(`${label}: unexpected ${error?.message}`);
    return;
  }
  throw new Error(`${label}: unexpectedly succeeded`);
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
      (${userA}::uuid, ${`lifecycle-a-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`lifecycle-b-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);
  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Taşınabilirlik Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const account = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik UTF-8 ÇĞİÖŞÜ Hesabı",
    accountType: "bank",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });
  const category = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Yaşam Döngüsü",
    categoryType: "expense",
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
      accountId: account.id,
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
      amount: "42.5000",
      sourceAccountId: account.id,
      sourceKind: "bank",
      categoryId: category.id,
    },
  });
  await createMonthlyReportVersion(sql, keyring, {
    userId: userA,
    period: "2026-08",
    reason: "Sentetik restore rapor kanıtı",
  });

  const csvExport = await createDataExport(sql, keyring, {
    userId: userA,
    format: "csv",
    scope: ["all-owned-data"],
  });
  assert(
    csvExport.encryption === null && csvExport.contentBase64,
    "B057 CSV export missing",
  );
  const csvZip = unzipSync(Buffer.from(csvExport.contentBase64, "base64"));
  const transactionCsvBytes = csvZip["transactions.csv"];
  const transactionsCsv = strFromU8(transactionCsvBytes);
  assert(
    transactionCsvBytes[0] === 0xef &&
      transactionCsvBytes[1] === 0xbb &&
      transactionCsvBytes[2] === 0xbf &&
      transactionsCsv.includes("42.5000"),
    `B057 UTF-8/decimal-string CSV failed: ${JSON.stringify(transactionsCsv)}`,
  );

  const fullExport = await createDataExport(sql, keyring, {
    userId: userA,
    format: "full_fidelity",
    scope: ["all-owned-data"],
    passphrase,
  });
  assert(
    fullExport.encryption?.kdf === "Argon2id" &&
      fullExport.encryption.scheme === "AES-256-GCM" &&
      fullExport.encryption.keysetReference === keyring.activeKeyId &&
      fullExport.contentBase64,
    "B058 encryption metadata failed",
  );
  assert(
    createHash("sha256")
      .update(Buffer.from(fullExport.contentBase64, "base64"))
      .digest("hex") === fullExport.checksum,
    "B058 ciphertext checksum failed",
  );
  await expectRejection(
    () => getDataExport(sql, { userId: userB, exportId: fullExport.id }),
    "cross-user export read",
    (error) => error instanceof DataLifecycleError && error.status === 404,
  );
  await expectRejection(
    () =>
      validateDataRestore(sql, keyring, {
        userId: userA,
        archiveBase64: fullExport.contentBase64,
        checksum: "0".repeat(64),
        passphrase,
      }),
    "tampered checksum",
    (error) =>
      error instanceof DataLifecycleError && error.code === "checksum_mismatch",
  );
  await expectRejection(
    () =>
      validateDataRestore(sql, keyring, {
        userId: userA,
        archiveBase64: fullExport.contentBase64,
        checksum: fullExport.checksum,
        passphrase: "wrong-passphrase-but-long",
      }),
    "wrong passphrase",
    (error) =>
      error instanceof DataLifecycleError &&
      error.code === "archive_decryption_failed",
  );
  const restore = await validateDataRestore(sql, keyring, {
    userId: userA,
    archiveBase64: fullExport.contentBase64,
    checksum: fullExport.checksum,
    passphrase,
  });
  assert(
    restore.status === "pass" &&
      restore.validation.quarantine === "pg_temp" &&
      restore.validation.fileChecksumDifferences === 0 &&
      restore.validation.relationshipDifferences === 0 &&
      restore.validation.ledgerBalanceDifferences === 0 &&
      restore.validation.reportReconciliationDifferences === 0 &&
      restore.validation.transactions === 2 &&
      restore.validation.postings >= 4,
    `B059 quarantine restore reconciliation failed: ${JSON.stringify(restore.validation)}`,
  );

  const firstDeletion = await requestAccountDeletion(sql, {
    userId: userA,
    requestId: randomUUID(),
  });
  assert(
    new Date(firstDeletion.scheduledFor).getTime() -
      new Date(firstDeletion.requestedAt).getTime() >=
      7 * 86_400_000,
    "B060 seven-day hold missing",
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
          amount: "1.0000",
          sourceAccountId: account.id,
          sourceKind: "bank",
          categoryId: category.id,
        },
      }),
    "deletion-hold write lock",
  );
  const cancelled = await cancelAccountDeletion(sql, {
    userId: userA,
    deletionRequestId: firstDeletion.id,
  });
  assert(cancelled.status === "cancelled", "B060 cancellation failed");

  const dueDeletion = await requestAccountDeletion(sql, {
    userId: userA,
    requestId: randomUUID(),
  });
  await sql`
    update app_identity.account_deletion_requests
       set requested_at = now() - interval '8 days', scheduled_for = now() - interval '1 day'
     where id = ${dueDeletion.id}::uuid
  `;
  const purge = await purgeDueAccountDeletion(sql, {
    userId: userA,
    deletionRequestId: dueDeletion.id,
  });
  assert(purge.orphanRows === 0, "B060 purge did not report zero orphans");
  const orphanRows = await sql`
    select (
      (select count(*) from app_identity.profiles where id = ${userA}::uuid) +
      (select count(*) from auth.users where id = ${userA}::uuid) +
      (select count(*) from app_private.transactions where user_id = ${userA}::uuid) +
      (select count(*) from app_private.ledger_postings where user_id = ${userA}::uuid) +
      (select count(*) from app_private.export_jobs where user_id = ${userA}::uuid) +
      (select count(*) from app_private.backup_catalog where user_id = ${userA}::uuid)
    )::text as total
  `;
  assert(
    orphanRows[0].total === "0",
    `B060 orphan user rows remain: ${orphanRows[0].total}`,
  );
  const receipts = await sql`
    select orphan_rows, backup_expires_at, purged_at
      from app_identity.account_deletion_receipts where id = ${purge.receiptId}::uuid
  `;
  assert(
    receipts[0]?.orphan_rows === 0 &&
      new Date(receipts[0].backup_expires_at) >=
        new Date(receipts[0].purged_at),
    "B060 minimal backup-expiry receipt failed",
  );

  console.log("B057 UTF-8 CSV decimal-string export: PASS");
  console.log("B058 Argon2id/AES-256-GCM ZIP manifest/checksum export: PASS");
  console.log(
    "B059 pg_temp quarantine dry-run ledger/report reconciliation=0: PASS",
  );
  console.log("B060 hold/cancel/write-lock/purge/backup-expiry/orphan=0: PASS");
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
  }
}
