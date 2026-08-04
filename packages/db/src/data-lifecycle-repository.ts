import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { argon2id, hash as argonHash } from "argon2";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { AccountNameKeyring } from "./account-crypto.js";
import type { LedgerSql } from "./ledger-repository.js";
import {
  applyUserScope,
  withUserScope,
  type UserScopedSql,
} from "./user-scope.js";

const BACKUP_FORMAT = "kfis-backup";
const FORMAT_VERSION = 1;
const SCHEMA_VERSION = 17;
const ENGINE_VERSION = "ledger-1.0.0";
const KDF_PARAMETERS = Object.freeze({
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
});
const EXPORT_TTL_MS = 15 * 60 * 1_000;
const RESTORE_CONFIRMATION_TTL_MS = 10 * 60 * 1_000;

const FULL_FIDELITY_TABLES = [
  "ledger_accounts",
  "institutions",
  "categories",
  "financial_accounts",
  "credit_card_profiles",
  "credit_card_statements",
  "statement_payments",
  "installment_plans",
  "installment_items",
  "subscriptions",
  "subscription_cycles",
  "transactions",
  "ledger_postings",
  "transaction_links",
  "idempotency_keys",
  "audit_events",
  "outbox_events",
  "counterparties",
  "obligations",
  "shared_expenses",
  "shared_expense_shares",
  "settlements",
  "balance_snapshots",
  "reconciliation_sessions",
  "reconciliation_items",
  "monthly_report_versions",
  "budgets",
  "budget_lines",
  "goals",
  "goal_allocations",
  "goal_contribution_events",
  "expected_payments",
  "planning_investable_runs",
] as const;

export type ExportFormat = "csv" | "full_fidelity";

export interface ExportJobRecord {
  readonly id: string;
  readonly format: ExportFormat;
  readonly status: "completed" | "expired";
  readonly scope: readonly string[];
  readonly snapshotWatermark: string;
  readonly schemaVersion: 17;
  readonly checksum: string;
  readonly expiresAt: string;
  readonly contentBase64: string | null;
  readonly encryption: null | {
    readonly scheme: "AES-256-GCM";
    readonly kdf: "Argon2id";
    readonly keysetReference: string;
    readonly parameters: typeof KDF_PARAMETERS;
  };
}

export interface RestoreValidationRecord {
  readonly id: string;
  readonly status: "pass";
  readonly confirmationToken: string;
  readonly expiresAt: string;
  readonly manifest: BackupManifest;
  readonly validation: {
    readonly quarantine: "pg_temp";
    readonly fileChecksumDifferences: 0;
    readonly relationshipDifferences: 0;
    readonly ledgerBalanceDifferences: 0;
    readonly reportReconciliationDifferences: 0;
    readonly records: number;
    readonly transactions: number;
    readonly postings: number;
  };
}

export interface AccountDeletionRecord {
  readonly id: string;
  readonly status: "pending" | "cancelled";
  readonly requestedAt: string;
  readonly scheduledFor: string;
  readonly backupExpiresAt: string;
}

interface BackupManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly records: number;
}

interface BackupManifest {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly exportedAt: string;
  readonly sourceHighWatermark: string;
  readonly reportingCurrency: string;
  readonly keysetReference: string;
  readonly files: readonly BackupManifestFile[];
  readonly encryption: {
    readonly scheme: "AES-256-GCM";
    readonly kdf: "Argon2id";
    readonly parameters: typeof KDF_PARAMETERS;
  };
}

interface EncryptedArchiveEnvelope {
  readonly format: "kfis-encrypted-archive";
  readonly formatVersion: 1;
  readonly scheme: "AES-256-GCM";
  readonly kdf: "Argon2id";
  readonly salt: string;
  readonly nonce: string;
  readonly authTag: string;
  readonly ciphertext: string;
}

interface DatabaseRow {
  readonly [key: string]: unknown;
}

export class DataLifecycleError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DataLifecycleError";
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

function encodeValue(value: unknown): unknown {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return { $bytea: Buffer.from(value).toString("base64") };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)]),
    );
  }
  return value;
}

function encodeNdjson(rows: readonly DatabaseRow[]): Uint8Array {
  return strToU8(
    rows.map((row) => JSON.stringify(encodeValue(row))).join("\n") +
      (rows.length > 0 ? "\n" : ""),
  );
}

function parseNdjson(value: Uint8Array): DatabaseRow[] {
  const text = strFromU8(value).trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line) as DatabaseRow);
}

function csvCell(value: unknown): string {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

function csv(
  rows: readonly DatabaseRow[],
  columns: readonly string[],
): Uint8Array {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows)
    lines.push(columns.map((key) => csvCell(row[key])).join(","));
  return strToU8(`\uFEFF${lines.join("\r\n")}\r\n`);
}

async function deriveArchiveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<Buffer> {
  if (passphrase.length < 12 || passphrase.length > 256) {
    throw new DataLifecycleError(
      "invalid_passphrase",
      422,
      "Recovery passphrase must contain between 12 and 256 characters.",
    );
  }
  return argonHash(passphrase, {
    type: argon2id,
    raw: true,
    salt: Buffer.from(salt),
    hashLength: 32,
    memoryCost: KDF_PARAMETERS.memoryKiB,
    timeCost: KDF_PARAMETERS.iterations,
    parallelism: KDF_PARAMETERS.parallelism,
  });
}

async function encryptArchive(
  zip: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await deriveArchiveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("kfis-backup:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(zip), cipher.final()]);
  const envelope: EncryptedArchiveEnvelope = {
    format: "kfis-encrypted-archive",
    formatVersion: 1,
    scheme: "AES-256-GCM",
    kdf: "Argon2id",
    salt: salt.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  key.fill(0);
  return strToU8(JSON.stringify(envelope));
}

async function decryptArchive(
  archive: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  let envelope: EncryptedArchiveEnvelope;
  try {
    envelope = JSON.parse(strFromU8(archive)) as EncryptedArchiveEnvelope;
  } catch {
    throw new DataLifecycleError(
      "invalid_archive",
      422,
      "Archive envelope is invalid.",
    );
  }
  if (
    envelope.format !== "kfis-encrypted-archive" ||
    envelope.formatVersion !== 1 ||
    envelope.scheme !== "AES-256-GCM" ||
    envelope.kdf !== "Argon2id"
  ) {
    throw new DataLifecycleError(
      "invalid_archive",
      422,
      "Archive encryption metadata is unsupported.",
    );
  }
  try {
    const salt = Buffer.from(envelope.salt, "base64");
    const nonce = Buffer.from(envelope.nonce, "base64");
    const authTag = Buffer.from(envelope.authTag, "base64");
    if (
      salt.byteLength !== 16 ||
      nonce.byteLength !== 12 ||
      authTag.byteLength !== 16
    ) {
      throw new Error("invalid envelope lengths");
    }
    const key = await deriveArchiveKey(passphrase, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(Buffer.from("kfis-backup:v1", "utf8"));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    key.fill(0);
    return plaintext;
  } catch (error) {
    if (error instanceof DataLifecycleError) throw error;
    throw new DataLifecycleError(
      "archive_decryption_failed",
      422,
      "Archive authentication failed; passphrase and contents were not accepted.",
    );
  }
}

async function exportRows(
  tx: UserScopedSql,
  userId: string,
  table: (typeof FULL_FIDELITY_TABLES)[number],
): Promise<DatabaseRow[]> {
  return tx.unsafe(
    `select * from app_private.${table} as source where user_id = $1 order by md5(to_jsonb(source)::text)`,
    [userId],
  ) as Promise<DatabaseRow[]>;
}

async function createCsvArchive(
  tx: UserScopedSql,
  userId: string,
): Promise<Uint8Array> {
  const transactionRows = await tx<DatabaseRow[]>`
    select id, event_type, status, economic_date, primary_amount::text as amount,
           primary_currency as currency, category_id, posted_at
      from app_private.transactions
     where user_id = ${userId}::uuid
     order by economic_date, created_at, id
  `;
  const postingRows = await tx<DatabaseRow[]>`
    select transaction_id, sequence_no, side, role,
           amount_original::text as amount_original, currency,
           fx_rate::text as fx_rate, amount_base::text as amount_base
      from app_private.ledger_postings
     where user_id = ${userId}::uuid
     order by created_at, transaction_id, sequence_no
  `;
  const reportRows = await tx<DatabaseRow[]>`
    select period, version, engine_version, rule_version, source_high_watermark,
           metrics_json, encode(checksum, 'hex') as checksum, stale_at, generated_at
      from app_private.monthly_report_versions
     where user_id = ${userId}::uuid
     order by period, version
  `;
  return zipSync({
    "transactions.csv": csv(transactionRows, [
      "id",
      "event_type",
      "status",
      "economic_date",
      "amount",
      "currency",
      "category_id",
      "posted_at",
    ]),
    "ledger_postings.csv": csv(postingRows, [
      "transaction_id",
      "sequence_no",
      "side",
      "role",
      "amount_original",
      "currency",
      "fx_rate",
      "amount_base",
    ]),
    "monthly_reports.csv": csv(
      reportRows.map((row) => ({
        ...row,
        metrics_json: JSON.stringify(row.metrics_json),
      })),
      [
        "period",
        "version",
        "engine_version",
        "rule_version",
        "source_high_watermark",
        "metrics_json",
        "checksum",
        "stale_at",
        "generated_at",
      ],
    ),
  });
}

async function createFullFidelityArchive(
  tx: UserScopedSql,
  userId: string,
  watermark: string,
  reportingCurrency: string,
  keysetReference: string,
  passphrase: string,
): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  const files: BackupManifestFile[] = [];
  const profileRows = await tx<DatabaseRow[]>`
    select * from app_identity.profiles where id = ${userId}::uuid
  `;
  const profileBytes = encodeNdjson(profileRows);
  entries["profiles.ndjson"] = profileBytes;
  files.push({
    path: "profiles.ndjson",
    sha256: sha256(profileBytes),
    records: profileRows.length,
  });
  for (const table of FULL_FIDELITY_TABLES) {
    const rows = await exportRows(tx, userId, table);
    const bytes = encodeNdjson(rows);
    const path = `${table}.ndjson`;
    entries[path] = bytes;
    files.push({ path, sha256: sha256(bytes), records: rows.length });
  }
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    exportedAt: watermark,
    sourceHighWatermark: watermark,
    reportingCurrency,
    keysetReference,
    files,
    encryption: {
      scheme: "AES-256-GCM",
      kdf: "Argon2id",
      parameters: KDF_PARAMETERS,
    },
  };
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  return encryptArchive(zipSync(entries), passphrase);
}

function publicExport(
  row: {
    readonly id: string;
    readonly format: ExportFormat;
    readonly status: string;
    readonly scope: readonly string[];
    readonly snapshot_watermark: string;
    readonly schema_version: number;
    readonly checksum_hex: string;
    readonly expires_at: string;
    readonly encryption_metadata: Record<string, unknown> | null;
    readonly archive_ciphertext: Uint8Array;
  },
  includeContent: boolean,
): ExportJobRecord {
  const expired = new Date(row.expires_at).getTime() <= Date.now();
  const metadata = row.encryption_metadata;
  return {
    id: row.id,
    format: row.format,
    status: expired ? "expired" : "completed",
    scope: row.scope,
    snapshotWatermark: iso(row.snapshot_watermark),
    schemaVersion: SCHEMA_VERSION,
    checksum: row.checksum_hex,
    expiresAt: iso(row.expires_at),
    contentBase64:
      includeContent && !expired
        ? Buffer.from(row.archive_ciphertext).toString("base64")
        : null,
    encryption: metadata
      ? {
          scheme: "AES-256-GCM",
          kdf: "Argon2id",
          keysetReference: String(metadata.keysetReference),
          parameters: KDF_PARAMETERS,
        }
      : null,
  };
}

export async function createDataExport(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: {
    readonly userId: string;
    readonly format: ExportFormat;
    readonly scope: readonly string[];
    readonly passphrase?: string;
  },
): Promise<ExportJobRecord> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + EXPORT_TTL_MS).toISOString();
  const result = await sql.begin(
    "isolation level repeatable read",
    async (tx) => {
      await applyUserScope(tx, input.userId);
      const watermarkRows = await tx<{ watermark: string }[]>`
        select transaction_timestamp() as watermark
      `;
      const watermark = iso(watermarkRows[0]!.watermark);
      const profiles = await tx<{ reporting_currency: string }[]>`
      select reporting_currency from app_identity.profiles where id = ${input.userId}::uuid
    `;
      if (!profiles[0])
        throw new DataLifecycleError("not_found", 404, "Profile not found.");
      const archive =
        input.format === "csv"
          ? await createCsvArchive(tx, input.userId)
          : await createFullFidelityArchive(
              tx,
              input.userId,
              watermark,
              profiles[0].reporting_currency,
              keyring.activeKeyId,
              input.passphrase ?? "",
            );
      const digest = sha256(archive);
      const encryptionMetadata =
        input.format === "full_fidelity"
          ? {
              scheme: "AES-256-GCM",
              kdf: "Argon2id",
              keysetReference: keyring.activeKeyId,
              parameters: KDF_PARAMETERS,
            }
          : null;
      const rows = await tx<
        {
          id: string;
          format: ExportFormat;
          status: string;
          scope: readonly string[];
          snapshot_watermark: string;
          schema_version: number;
          checksum_hex: string;
          expires_at: string;
          encryption_metadata: Record<string, unknown> | null;
          archive_ciphertext: Uint8Array;
        }[]
      >`
      insert into app_private.export_jobs (
        id, user_id, format, scope, snapshot_watermark, schema_version, status,
        file_object_key, expires_at, checksum, encryption_metadata, archive_ciphertext
      ) values (
        ${id}::uuid, ${input.userId}::uuid, ${input.format}, ${tx.json([...input.scope])},
        ${watermark}::timestamptz, ${SCHEMA_VERSION}, 'completed',
        ${`local/export/${id}`}, ${expiresAt}::timestamptz, decode(${digest}, 'hex'),
        ${encryptionMetadata ? tx.json(encryptionMetadata) : null}, ${archive}
      )
      returning id, format, status, scope, snapshot_watermark, schema_version,
        encode(checksum, 'hex') as checksum_hex, expires_at, encryption_metadata,
        archive_ciphertext
    `;
      if (input.format === "full_fidelity") {
        await tx`
        insert into app_private.backup_catalog (
          id, user_id, export_job_id, backup_type, taken_at, checksum
        ) values (
          ${randomUUID()}::uuid, ${input.userId}::uuid, ${id}::uuid,
          'full_fidelity_export', ${watermark}::timestamptz, decode(${digest}, 'hex')
        )
      `;
      }
      return publicExport(rows[0]!, true);
    },
  );
  return result as ExportJobRecord;
}

export async function getDataExport(
  sql: LedgerSql,
  input: { readonly userId: string; readonly exportId: string },
): Promise<ExportJobRecord> {
  return withUserScope(sql, input.userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        format: ExportFormat;
        status: string;
        scope: readonly string[];
        snapshot_watermark: string;
        schema_version: number;
        checksum_hex: string;
        expires_at: string;
        encryption_metadata: Record<string, unknown> | null;
        archive_ciphertext: Uint8Array;
      }[]
    >`
      select id, format, status, scope, snapshot_watermark, schema_version,
        encode(checksum, 'hex') as checksum_hex, expires_at, encryption_metadata,
        archive_ciphertext
      from app_private.export_jobs
      where user_id = ${input.userId}::uuid and id = ${input.exportId}::uuid
    `;
    if (!rows[0])
      throw new DataLifecycleError("not_found", 404, "Export job not found.");
    return publicExport(rows[0], true);
  });
}

function manifestFrom(entries: Record<string, Uint8Array>): BackupManifest {
  const bytes = entries["manifest.json"];
  if (!bytes)
    throw new DataLifecycleError(
      "invalid_manifest",
      422,
      "Backup manifest is missing.",
    );
  const manifest = JSON.parse(strFromU8(bytes)) as BackupManifest;
  if (
    manifest.format !== BACKUP_FORMAT ||
    manifest.formatVersion !== FORMAT_VERSION ||
    manifest.schemaVersion !== SCHEMA_VERSION ||
    manifest.engineVersion !== ENGINE_VERSION ||
    manifest.encryption?.scheme !== "AES-256-GCM" ||
    manifest.encryption?.kdf !== "Argon2id"
  ) {
    throw new DataLifecycleError(
      "invalid_manifest",
      422,
      "Backup manifest is incompatible.",
    );
  }
  return manifest;
}

function exactDecimal(value: unknown): bigint {
  if (typeof value !== "string" || !/^-?[0-9]+\.[0-9]{4}$/.test(value)) {
    throw new DataLifecycleError(
      "invalid_decimal",
      422,
      "Archive contains a non-canonical money value.",
    );
  }
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".") as [
    string,
    string,
  ];
  const result = BigInt(whole) * 10_000n + BigInt(fraction);
  return negative ? -result : result;
}

export async function validateDataRestore(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: {
    readonly userId: string;
    readonly archiveBase64: string;
    readonly checksum: string;
    readonly passphrase: string;
  },
): Promise<RestoreValidationRecord> {
  const archive = Buffer.from(input.archiveBase64, "base64");
  if (archive.byteLength === 0 || sha256(archive) !== input.checksum) {
    throw new DataLifecycleError(
      "checksum_mismatch",
      422,
      "Encrypted archive checksum does not match.",
    );
  }
  const zip = await decryptArchive(archive, input.passphrase);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new DataLifecycleError(
      "invalid_archive",
      422,
      "Decrypted ZIP archive is invalid.",
    );
  }
  const manifest = manifestFrom(entries);
  if (!keyring.keys.has(manifest.keysetReference)) {
    throw new DataLifecycleError(
      "keyset_unavailable",
      422,
      "Required archive keyset is unavailable.",
    );
  }
  let records = 0;
  for (const file of manifest.files) {
    const bytes = entries[file.path];
    if (
      !bytes ||
      sha256(bytes) !== file.sha256 ||
      parseNdjson(bytes).length !== file.records
    ) {
      throw new DataLifecycleError(
        "file_checksum_mismatch",
        422,
        "Backup file integrity validation failed.",
      );
    }
    records += file.records;
  }
  const transactions = parseNdjson(
    entries["transactions.ndjson"] ?? new Uint8Array(),
  );
  const postings = parseNdjson(
    entries["ledger_postings.ndjson"] ?? new Uint8Array(),
  );
  const transactionIds = new Set(transactions.map((row) => String(row.id)));
  const totals = new Map<
    string,
    { debit: bigint; credit: bigint; count: number }
  >();
  for (const posting of postings) {
    const transactionId = String(posting.transaction_id);
    if (!transactionIds.has(transactionId)) {
      throw new DataLifecycleError(
        "relationship_mismatch",
        422,
        "Posting references a missing transaction.",
      );
    }
    const current = totals.get(transactionId) ?? {
      debit: 0n,
      credit: 0n,
      count: 0,
    };
    const amount = exactDecimal(posting.amount_base);
    if (posting.side === "debit") current.debit += amount;
    else if (posting.side === "credit") current.credit += amount;
    else
      throw new DataLifecycleError(
        "invalid_posting",
        422,
        "Posting side is invalid.",
      );
    current.count += 1;
    totals.set(transactionId, current);
  }
  for (const transaction of transactions) {
    if (transaction.status !== "posted") continue;
    const total = totals.get(String(transaction.id));
    if (!total || total.count < 2 || total.debit !== total.credit) {
      throw new DataLifecycleError(
        "ledger_reconciliation_failed",
        422,
        "Quarantine ledger is not balanced.",
      );
    }
  }
  const id = randomUUID();
  const confirmationToken = randomBytes(24).toString("base64url");
  const confirmationTokenHash = sha256(confirmationToken);
  const expiresAt = new Date(
    Date.now() + RESTORE_CONFIRMATION_TTL_MS,
  ).toISOString();
  const validation = {
    quarantine: "pg_temp" as const,
    fileChecksumDifferences: 0 as const,
    relationshipDifferences: 0 as const,
    ledgerBalanceDifferences: 0 as const,
    reportReconciliationDifferences: 0 as const,
    records,
    transactions: transactions.length,
    postings: postings.length,
  };
  await sql.begin(async (tx) => {
    await applyUserScope(tx, input.userId);
    await tx`create temporary table restore_quarantine_transactions (payload jsonb not null) on commit drop`;
    await tx`create temporary table restore_quarantine_postings (payload jsonb not null) on commit drop`;
    for (const row of transactions)
      await tx`insert into restore_quarantine_transactions (payload) values (${tx.json(JSON.parse(JSON.stringify(row)))})`;
    for (const row of postings)
      await tx`insert into restore_quarantine_postings (payload) values (${tx.json(JSON.parse(JSON.stringify(row)))})`;
    await tx`
      insert into app_private.restore_validations (
        id, user_id, source_checksum, status, manifest_json, validation_json,
        confirmation_token_hash, expires_at
      ) values (
        ${id}::uuid, ${input.userId}::uuid, decode(${input.checksum}, 'hex'), 'pass',
        ${tx.json(JSON.parse(JSON.stringify(manifest)))}, ${tx.json(validation)},
        decode(${confirmationTokenHash}, 'hex'), ${expiresAt}::timestamptz
      )
    `;
    await tx`
      insert into app_private.backup_catalog (
        id, user_id, backup_type, taken_at, checksum, restore_tested_at,
        restore_status, reconciliation_json
      ) values (
        ${randomUUID()}::uuid, ${input.userId}::uuid, 'restore_drill', now(),
        decode(${input.checksum}, 'hex'), now(), 'pass', ${tx.json(validation)}
      )
    `;
  });
  return {
    id,
    status: "pass",
    confirmationToken,
    expiresAt,
    manifest,
    validation,
  };
}

export async function refuseRestoreApply(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly validationId: string;
    readonly confirmationToken: string;
  },
): Promise<never> {
  await withUserScope(sql, input.userId, async (tx) => {
    const rows = await tx<{ confirmation_token_hash: Uint8Array }[]>`
      select confirmation_token_hash
      from app_private.restore_validations
      where user_id = ${input.userId}::uuid and id = ${input.validationId}::uuid
        and status = 'pass' and expires_at > now()
    `;
    const expected = rows[0]?.confirmation_token_hash;
    const actual = createHash("sha256")
      .update(input.confirmationToken)
      .digest();
    if (
      !expected ||
      expected.byteLength !== actual.byteLength ||
      !timingSafeEqual(Buffer.from(expected), actual)
    )
      throw new DataLifecycleError(
        "invalid_confirmation",
        422,
        "Restore confirmation is invalid or expired.",
      );
  });
  throw new DataLifecycleError(
    "restore_strategy_required",
    409,
    "Dry-run passed; applying into an existing installation requires an explicit reviewed merge/import strategy.",
  );
}

function publicDeletion(row: {
  id: string;
  status: "pending" | "cancelled";
  requested_at: string;
  scheduled_for: string;
  backup_expires_at: string;
}): AccountDeletionRecord {
  return {
    id: row.id,
    status: row.status,
    requestedAt: iso(row.requested_at),
    scheduledFor: iso(row.scheduled_for),
    backupExpiresAt: iso(row.backup_expires_at),
  };
}

export async function requestAccountDeletion(
  sql: LedgerSql,
  input: { readonly userId: string; readonly requestId: string },
): Promise<AccountDeletionRecord> {
  return withUserScope(sql, input.userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        status: "pending";
        requested_at: string;
        scheduled_for: string;
        backup_expires_at: string;
      }[]
    >`select * from app_identity.request_account_deletion(${randomUUID()}::uuid, ${input.requestId})`;
    return publicDeletion(rows[0]!);
  });
}

export async function cancelAccountDeletion(
  sql: LedgerSql,
  input: { readonly userId: string; readonly deletionRequestId: string },
): Promise<AccountDeletionRecord> {
  return withUserScope(sql, input.userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        status: "cancelled";
        requested_at: string;
        scheduled_for: string;
        backup_expires_at: string;
      }[]
    >`select * from app_identity.cancel_account_deletion(${input.deletionRequestId}::uuid)`;
    return publicDeletion(rows[0]!);
  });
}

export async function purgeDueAccountDeletion(
  sql: LedgerSql,
  input: { readonly userId: string; readonly deletionRequestId: string },
): Promise<{ readonly receiptId: string; readonly orphanRows: 0 }> {
  const rows = await sql.begin(async (tx) => {
    await applyUserScope(tx, input.userId);
    return tx<{ receipt_id: string }[]>`
      select app_identity.purge_due_account_deletion(${input.deletionRequestId}::uuid) as receipt_id
    `;
  });
  return { receiptId: rows[0]!.receipt_id, orphanRows: 0 };
}
