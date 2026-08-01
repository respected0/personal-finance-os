import { createHash, randomUUID } from "node:crypto";
import {
  decryptAccountName,
  encryptAccountName,
  type AccountNameEnvelope,
  type AccountNameKeyring,
} from "./account-crypto.js";
import type { LedgerSql } from "./ledger-repository.js";
import {
  applyUserScope,
  withUserScope,
  type UserScopedSql,
} from "./user-scope.js";

export type InstitutionType = "bank" | "wallet" | "broker" | "other";
export type FinancialAccountType =
  "bank" | "cash" | "wallet" | "credit_card" | "investment";
export type CategoryType = "income" | "expense";

export class DailyCoreNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("The requested resource was not found.");
    this.name = "DailyCoreNotFoundError";
  }
}

export class DailyCoreVersionConflictError extends Error {
  readonly code = "version_conflict";
  readonly status = 409;

  constructor() {
    super("The resource changed after it was read.");
    this.name = "DailyCoreVersionConflictError";
  }
}

export interface InstitutionRecord {
  readonly id: string;
  readonly name: string;
  readonly institutionType: InstitutionType;
  readonly active: boolean;
  readonly rowVersion: number;
}

export interface CategoryRecord {
  readonly id: string;
  readonly name: string;
  readonly categoryType: CategoryType;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly rowVersion: number;
}

export interface AccountBalance {
  readonly accountId: string;
  readonly currency: string;
  readonly asOf: string | null;
  readonly calculatedOriginal: string;
  readonly calculatedBase: string;
}

export interface FinancialAccountRecord {
  readonly id: string;
  readonly institutionId: string | null;
  readonly ledgerAccountId: string;
  readonly name: string;
  readonly accountType: FinancialAccountType;
  readonly currency: string;
  readonly openingDate: string;
  readonly status: "active" | "archived";
  readonly rowVersion: number;
  readonly balance: AccountBalance;
}

interface EvidenceInput {
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly requestId: string;
  readonly actorSessionId?: string;
  readonly after: Readonly<Record<string, unknown>>;
}

async function appendEvidence(
  tx: UserScopedSql,
  userId: string,
  input: EvidenceInput,
): Promise<void> {
  await tx`
    select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(${userId}, 0)
    )
  `;
  const previousRows = await tx<{ readonly event_hash: string }[]>`
    select encode(event_hash, 'hex') as event_hash
      from app_private.audit_events
     where user_id = ${userId}::uuid
     order by occurred_at desc, id desc
     limit 1
  `;
  const previousHash = previousRows[0]?.event_hash ?? "";
  const eventHash = createHash("sha256")
    .update(`${previousHash}|${input.requestId}|${JSON.stringify(input.after)}`)
    .digest("hex");

  await tx`
    insert into app_private.audit_events (
      id, user_id, entity_type, entity_id, action, before_json, after_json,
      actor_session_id, request_id, prev_hash, event_hash
    ) values (
      ${randomUUID()}::uuid,
      ${userId}::uuid,
      ${input.entityType},
      ${input.entityId}::uuid,
      ${input.action},
      null,
      ${tx.json(JSON.parse(JSON.stringify(input.after)))},
      ${input.actorSessionId ?? null}::uuid,
      ${input.requestId},
      case when ${previousHash} = '' then null else decode(${previousHash}, 'hex') end,
      decode(${eventHash}, 'hex')
    )
  `;
  await tx`
    insert into app_private.outbox_events (
      id, user_id, aggregate_type, aggregate_id, event_type,
      event_version, schema_version, payload
    ) values (
      ${randomUUID()}::uuid,
      ${userId}::uuid,
      ${input.entityType},
      ${input.entityId}::uuid,
      ${`${input.entityType}.${input.action}`},
      1,
      1,
      ${tx.json(JSON.parse(JSON.stringify(input.after)))}
    )
  `;
}

export async function createInstitution(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly name: string;
    readonly institutionType: InstitutionType;
    readonly requestId: string;
    readonly actorSessionId?: string;
  },
): Promise<InstitutionRecord> {
  const id = randomUUID();
  const name = input.name.trim();
  return sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const rows = await tx<
      {
        readonly id: string;
        readonly name: string;
        readonly institution_type: InstitutionType;
        readonly active: boolean;
        readonly row_version: number;
      }[]
    >`
      insert into app_private.institutions (
        id, user_id, name, institution_type
      ) values (
        ${id}::uuid,
        ${input.userId}::uuid,
        ${name},
        ${input.institutionType}
      )
      returning id::text, name, institution_type, active, row_version
    `;
    await appendEvidence(tx, input.userId, {
      entityType: "institution",
      entityId: id,
      action: "created",
      requestId: input.requestId,
      ...(input.actorSessionId ? { actorSessionId: input.actorSessionId } : {}),
      after: {
        active: true,
        institution_id: id,
        institution_type: input.institutionType,
      },
    });
    const row = rows[0];
    if (!row) throw new Error("Institution insert returned no row.");
    return {
      id: row.id,
      name: row.name,
      institutionType: row.institution_type,
      active: row.active,
      rowVersion: row.row_version,
    };
  });
}

export async function listInstitutions(
  sql: LedgerSql,
  userId: string,
  includeArchived = false,
): Promise<readonly InstitutionRecord[]> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) =>
      tx<
        {
          readonly id: string;
          readonly name: string;
          readonly institution_type: InstitutionType;
          readonly active: boolean;
          readonly row_version: number;
        }[]
      >`
    select id::text, name, institution_type, active, row_version
      from app_private.institutions
     where user_id = ${userId}::uuid
       and (${includeArchived} or active)
     order by active desc, name, id
    `,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    institutionType: row.institution_type,
    active: row.active,
    rowVersion: row.row_version,
  }));
}

export async function createCategory(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly name: string;
    readonly categoryType: CategoryType;
    readonly sortOrder?: number;
  },
): Promise<CategoryRecord> {
  const role = input.categoryType;
  const rows = await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    await tx`
      select app_private.provision_system_ledger_accounts(${input.userId}::uuid)
    `;
    return tx<
      {
        readonly id: string;
        readonly name: string;
        readonly category_type: CategoryType;
        readonly active: boolean;
        readonly sort_order: number;
        readonly row_version: number;
      }[]
    >`
    insert into app_private.categories (
      id, user_id, name, category_type, default_ledger_account_id, sort_order
    )
    select
      ${randomUUID()}::uuid,
      ${input.userId}::uuid,
      ${input.name.trim()},
      ${input.categoryType},
      id,
      ${input.sortOrder ?? 0}
    from app_private.ledger_accounts
    where user_id = ${input.userId}::uuid
      and system_role = ${role}
    returning id::text, name, category_type, active, sort_order, row_version
    `;
  });
  const row = rows[0];
  if (!row) throw new DailyCoreNotFoundError();
  return {
    id: row.id,
    name: row.name,
    categoryType: row.category_type,
    active: row.active,
    sortOrder: row.sort_order,
    rowVersion: row.row_version,
  };
}

export async function listCategories(
  sql: LedgerSql,
  userId: string,
  categoryType?: CategoryType,
): Promise<readonly CategoryRecord[]> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) =>
      tx<
        {
          readonly id: string;
          readonly name: string;
          readonly category_type: CategoryType;
          readonly active: boolean;
          readonly sort_order: number;
          readonly row_version: number;
        }[]
      >`
    select id::text, name, category_type, active, sort_order, row_version
      from app_private.categories
     where user_id = ${userId}::uuid
       and active
       and (${categoryType ?? null}::text is null or category_type = ${categoryType ?? null})
     order by sort_order, name, id
    `,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryType: row.category_type,
    active: row.active,
    sortOrder: row.sort_order,
    rowVersion: row.row_version,
  }));
}

function ledgerClass(accountType: FinancialAccountType): {
  readonly accountClass: "asset" | "liability";
  readonly normalSide: "debit" | "credit";
} {
  return accountType === "credit_card"
    ? { accountClass: "liability", normalSide: "credit" }
    : { accountClass: "asset", normalSide: "debit" };
}

export async function createFinancialAccount(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: {
    readonly userId: string;
    readonly institutionId?: string;
    readonly name: string;
    readonly accountType: FinancialAccountType;
    readonly currency: string;
    readonly openingDate: string;
    readonly requestId: string;
    readonly actorSessionId?: string;
  },
): Promise<FinancialAccountRecord> {
  const id = randomUUID();
  const ledgerAccountId = randomUUID();
  const envelope = encryptAccountName(input.name, input.userId, id, keyring);
  const classification = ledgerClass(input.accountType);

  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    await tx`
      select app_private.provision_system_ledger_accounts(${input.userId}::uuid)
    `;
    if (input.institutionId) {
      const institutionRows = await tx`
        select id
          from app_private.institutions
         where user_id = ${input.userId}::uuid
           and id = ${input.institutionId}::uuid
           and active
         for share
      `;
      if (!institutionRows[0]) throw new DailyCoreNotFoundError();
    }
    const codeRows = await tx<{ readonly code: string }[]>`
      select lpad(candidate::text, 4, '0') as code
        from generate_series(6000, 9999) as candidate
       where not exists (
         select 1
           from app_private.ledger_accounts
          where user_id = ${input.userId}::uuid
            and code = lpad(candidate::text, 4, '0')
       )
       order by candidate
       limit 1
    `;
    const code = codeRows[0]?.code;
    if (!code)
      throw new Error("Financial account ledger code space exhausted.");

    await tx`
      insert into app_private.ledger_accounts (
        id, user_id, code, name, account_class, normal_side, system_role,
        hidden, active
      ) values (
        ${ledgerAccountId}::uuid,
        ${input.userId}::uuid,
        ${code},
        ${`Financial account ${input.accountType}`},
        ${classification.accountClass},
        ${classification.normalSide},
        null,
        true,
        true
      )
    `;
    await tx`
      insert into app_private.financial_accounts (
        id, user_id, institution_id, ledger_account_id, name_enc,
        name_key_id, name_algorithm, name_enc_version, name_nonce,
        name_auth_tag, name_aad_version, account_type, currency, opening_date
      ) values (
        ${id}::uuid,
        ${input.userId}::uuid,
        ${input.institutionId ?? null}::uuid,
        ${ledgerAccountId}::uuid,
        ${envelope.ciphertext},
        ${envelope.keyId},
        ${envelope.algorithm},
        ${envelope.encryptionVersion},
        ${envelope.nonce},
        ${envelope.authTag},
        ${envelope.aadVersion},
        ${input.accountType},
        ${input.currency},
        ${input.openingDate}::date
      )
    `;
    await appendEvidence(tx, input.userId, {
      entityType: "financial_account",
      entityId: id,
      action: "created",
      requestId: input.requestId,
      ...(input.actorSessionId ? { actorSessionId: input.actorSessionId } : {}),
      after: {
        account_id: id,
        account_type: input.accountType,
        currency: input.currency,
        status: "active",
      },
    });
  });

  const account = await getFinancialAccount(sql, keyring, input.userId, id);
  if (!account) throw new Error("Financial account insert returned no row.");
  return account;
}

interface AccountRow {
  readonly id: string;
  readonly institution_id: string | null;
  readonly ledger_account_id: string;
  readonly name_enc: Uint8Array;
  readonly name_key_id: string;
  readonly name_algorithm: "AEAD_AES_256_GCM";
  readonly name_enc_version: 1;
  readonly name_nonce: Uint8Array;
  readonly name_auth_tag: Uint8Array;
  readonly name_aad_version: 1;
  readonly account_type: FinancialAccountType;
  readonly currency: string;
  readonly opening_date: string;
  readonly status: "active" | "archived";
  readonly row_version: number;
  readonly calculated_original: string;
  readonly calculated_base: string;
}

function envelopeFromRow(row: AccountRow): AccountNameEnvelope {
  return {
    ciphertext: row.name_enc,
    keyId: row.name_key_id,
    algorithm: row.name_algorithm,
    encryptionVersion: row.name_enc_version,
    nonce: row.name_nonce,
    authTag: row.name_auth_tag,
    aadVersion: row.name_aad_version,
  };
}

function accountFromRow(
  row: AccountRow,
  userId: string,
  keyring: AccountNameKeyring,
  asOf: string | null,
): FinancialAccountRecord {
  return {
    id: row.id,
    institutionId: row.institution_id,
    ledgerAccountId: row.ledger_account_id,
    name: decryptAccountName(envelopeFromRow(row), userId, row.id, keyring),
    accountType: row.account_type,
    currency: row.currency.trim(),
    openingDate: row.opening_date,
    status: row.status,
    rowVersion: row.row_version,
    balance: {
      accountId: row.id,
      currency: row.currency.trim(),
      asOf,
      calculatedOriginal: row.calculated_original,
      calculatedBase: row.calculated_base,
    },
  };
}

async function accountRows(
  sql: UserScopedSql,
  userId: string,
  options: {
    readonly accountId?: string;
    readonly includeArchived?: boolean;
    readonly asOf?: string;
  },
): Promise<AccountRow[]> {
  return sql<AccountRow[]>`
    select
      fa.id::text,
      fa.institution_id::text,
      fa.ledger_account_id::text,
      fa.name_enc,
      fa.name_key_id,
      fa.name_algorithm,
      fa.name_enc_version,
      fa.name_nonce,
      fa.name_auth_tag,
      fa.name_aad_version,
      fa.account_type,
      fa.currency,
      fa.opening_date::text,
      fa.status,
      fa.row_version,
      coalesce(sum(
        case
          when fa.account_type = 'credit_card' and lp.side = 'credit' then lp.amount_original
          when fa.account_type = 'credit_card' then -lp.amount_original
          when lp.side = 'debit' then lp.amount_original
          else -lp.amount_original
        end
      ) filter (where tx.status = 'posted'), 0)::numeric(19,4)::text as calculated_original,
      coalesce(sum(
        case
          when fa.account_type = 'credit_card' and lp.side = 'credit' then lp.amount_base
          when fa.account_type = 'credit_card' then -lp.amount_base
          when lp.side = 'debit' then lp.amount_base
          else -lp.amount_base
        end
      ) filter (where tx.status = 'posted'), 0)::numeric(19,4)::text as calculated_base
    from app_private.financial_accounts as fa
    left join app_private.ledger_postings as lp
      on lp.user_id = fa.user_id and lp.financial_account_id = fa.id
    left join app_private.transactions as tx
      on tx.user_id = lp.user_id
     and tx.id = lp.transaction_id
     and (${options.asOf ?? null}::date is null or tx.economic_date <= ${options.asOf ?? null}::date)
    where fa.user_id = ${userId}::uuid
      and (${options.accountId ?? null}::uuid is null or fa.id = ${options.accountId ?? null}::uuid)
      and (${options.includeArchived ?? false} or fa.status = 'active')
    group by fa.id
    order by fa.status, fa.created_at, fa.id
  `;
}

export async function listFinancialAccounts(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  userId: string,
  includeArchived = false,
): Promise<readonly FinancialAccountRecord[]> {
  const rows = await withUserScope(sql, userId, (tx) =>
    accountRows(tx, userId, { includeArchived }),
  );
  return rows.map((row) => accountFromRow(row, userId, keyring, null));
}

export async function getFinancialAccount(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  userId: string,
  accountId: string,
  asOf?: string,
): Promise<FinancialAccountRecord | null> {
  const rows = await withUserScope(sql, userId, (tx) =>
    accountRows(tx, userId, {
      accountId,
      includeArchived: true,
      ...(asOf ? { asOf } : {}),
    }),
  );
  return rows[0]
    ? accountFromRow(rows[0], userId, keyring, asOf ?? null)
    : null;
}

export async function archiveFinancialAccount(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly accountId: string;
    readonly rowVersion: number;
    readonly requestId: string;
    readonly actorSessionId?: string;
  },
): Promise<number> {
  return sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const rows = await tx<
      { readonly ledger_account_id: string; readonly row_version: number }[]
    >`
      update app_private.financial_accounts
         set status = 'archived', archived_at = now()
       where user_id = ${input.userId}::uuid
         and id = ${input.accountId}::uuid
         and status = 'active'
         and row_version = ${input.rowVersion}
      returning ledger_account_id::text, row_version
    `;
    const row = rows[0];
    if (!row) {
      const exists = await tx`
        select 1 from app_private.financial_accounts
         where user_id = ${input.userId}::uuid and id = ${input.accountId}::uuid
      `;
      if (!exists[0]) throw new DailyCoreNotFoundError();
      throw new DailyCoreVersionConflictError();
    }
    await tx`
      update app_private.ledger_accounts
         set active = false
       where user_id = ${input.userId}::uuid
         and id = ${row.ledger_account_id}::uuid
    `;
    await appendEvidence(tx, input.userId, {
      entityType: "financial_account",
      entityId: input.accountId,
      action: "archived",
      requestId: input.requestId,
      ...(input.actorSessionId ? { actorSessionId: input.actorSessionId } : {}),
      after: { account_id: input.accountId, status: "archived" },
    });
    return row.row_version;
  });
}

interface TransactionRow {
  readonly id: string;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly economic_date: string;
  readonly primary_amount: string;
  readonly primary_currency: string;
  readonly category_id: string | null;
  readonly engine_version: string;
}

export interface TransactionHistoryPage {
  readonly items: readonly {
    readonly id: string;
    readonly type: string;
    readonly occurredAt: string;
    readonly economicDate: string;
    readonly amount: string;
    readonly currency: string;
    readonly categoryId: string | null;
    readonly engineVersion: string;
  }[];
  readonly nextCursor: string | null;
  readonly aggregate: {
    readonly personalExpense: string;
    readonly normalIncome: string;
    readonly net: string;
  };
}

export interface TransactionDetail {
  readonly id: string;
  readonly type: string;
  readonly status: "posted" | "voided";
  readonly occurredAt: string;
  readonly economicDate: string;
  readonly amount: string;
  readonly currency: string;
  readonly categoryId: string | null;
  readonly engineVersion: string;
  readonly inputSchemaVersion: number;
  readonly revisionGroupId: string;
  readonly reversesTransactionId: string | null;
  readonly postings: readonly {
    readonly financialAccountId: string | null;
    readonly role: string;
    readonly side: "debit" | "credit";
    readonly amountOriginal: string;
    readonly currency: string;
    readonly fxRate: string;
    readonly amountBase: string;
    readonly sequence: number;
  }[];
  readonly links: readonly {
    readonly relatedTransactionId: string;
    readonly linkType: string;
    readonly allocatedAmount: string | null;
  }[];
  readonly audit: {
    readonly eventCount: number;
    readonly lastOccurredAt: string;
  };
}

function encodeCursor(row: TransactionRow): string {
  return Buffer.from(
    JSON.stringify({ id: row.id, occurredAt: row.occurred_at }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor?: string): {
  id: string | null;
  occurredAt: string | null;
} {
  if (!cursor) return { id: null, occurredAt: null };
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value.id !== "string" || typeof value.occurredAt !== "string") {
      throw new Error("invalid");
    }
    return value;
  } catch {
    throw new Error("Transaction cursor is invalid.");
  }
}

async function listTransactionsScoped(
  sql: UserScopedSql,
  input: {
    readonly userId: string;
    readonly cursor?: string;
    readonly periodFrom?: string;
    readonly periodTo?: string;
    readonly type?: string;
    readonly accountId?: string;
    readonly categoryId?: string;
    readonly limit?: number;
  },
): Promise<TransactionHistoryPage> {
  const cursor = decodeCursor(input.cursor);
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const rows = await sql<TransactionRow[]>`
    select
      tx.id::text,
      tx.event_type,
      tx.occurred_at::text,
      tx.economic_date::text,
      tx.primary_amount::text,
      tx.primary_currency,
      tx.category_id::text,
      tx.engine_version
    from app_private.transactions as tx
    where tx.user_id = ${input.userId}::uuid
      and tx.status = 'posted'
      and (${input.periodFrom ?? null}::date is null or tx.economic_date >= ${input.periodFrom ?? null}::date)
      and (${input.periodTo ?? null}::date is null or tx.economic_date <= ${input.periodTo ?? null}::date)
      and (${input.type ?? null}::text is null or tx.event_type = ${input.type ?? null})
      and (${input.categoryId ?? null}::uuid is null or tx.category_id = ${input.categoryId ?? null}::uuid)
      and (
        ${input.accountId ?? null}::uuid is null
        or exists (
          select 1 from app_private.ledger_postings as account_posting
           where account_posting.user_id = tx.user_id
             and account_posting.transaction_id = tx.id
             and account_posting.financial_account_id = ${input.accountId ?? null}::uuid
        )
      )
      and (
        ${cursor.occurredAt}::timestamptz is null
        or (tx.occurred_at, tx.id) < (${cursor.occurredAt}::timestamptz, ${cursor.id}::uuid)
      )
    order by tx.occurred_at desc, tx.id desc
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const aggregateRows = await sql<
    {
      readonly personal_expense: string;
      readonly normal_income: string;
      readonly net: string;
    }[]
  >`
    with selected as (
      select tx.id
      from app_private.transactions as tx
      where tx.user_id = ${input.userId}::uuid
        and tx.status = 'posted'
        and (${input.periodFrom ?? null}::date is null or tx.economic_date >= ${input.periodFrom ?? null}::date)
        and (${input.periodTo ?? null}::date is null or tx.economic_date <= ${input.periodTo ?? null}::date)
        and (${input.type ?? null}::text is null or tx.event_type = ${input.type ?? null})
        and (${input.categoryId ?? null}::uuid is null or tx.category_id = ${input.categoryId ?? null}::uuid)
        and (
          ${input.accountId ?? null}::uuid is null
          or exists (
            select 1 from app_private.ledger_postings as account_posting
             where account_posting.user_id = tx.user_id
               and account_posting.transaction_id = tx.id
               and account_posting.financial_account_id = ${input.accountId ?? null}::uuid
          )
        )
    ), totals as (
      select
        coalesce(sum(case when lp.role in ('expense', 'fee_expense') and lp.side = 'debit' then lp.amount_base when lp.role in ('expense', 'fee_expense') then -lp.amount_base else 0 end), 0)::numeric(19,4) as expense,
        coalesce(sum(case when lp.role = 'income' and lp.side = 'credit' then lp.amount_base when lp.role = 'income' then -lp.amount_base else 0 end), 0)::numeric(19,4) as income
      from app_private.ledger_postings as lp
      join selected on selected.id = lp.transaction_id
      where lp.user_id = ${input.userId}::uuid
    )
    select expense::text as personal_expense,
           income::text as normal_income,
           (income - expense)::numeric(19,4)::text as net
      from totals
  `;
  const aggregate = aggregateRows[0];
  if (!aggregate) throw new Error("Transaction aggregate returned no row.");
  return {
    items: items.map((row) => ({
      id: row.id,
      type: row.event_type,
      occurredAt: row.occurred_at,
      economicDate: row.economic_date,
      amount: row.primary_amount,
      currency: row.primary_currency.trim(),
      categoryId: row.category_id,
      engineVersion: row.engine_version,
    })),
    nextCursor: hasMore && items.at(-1) ? encodeCursor(items.at(-1)!) : null,
    aggregate: {
      personalExpense: aggregate.personal_expense,
      normalIncome: aggregate.normal_income,
      net: aggregate.net,
    },
  };
}

export async function listTransactions(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly cursor?: string;
    readonly periodFrom?: string;
    readonly periodTo?: string;
    readonly type?: string;
    readonly accountId?: string;
    readonly categoryId?: string;
    readonly limit?: number;
  },
): Promise<TransactionHistoryPage> {
  return withUserScope(sql, input.userId, (tx) =>
    listTransactionsScoped(tx, input),
  );
}

async function getTransactionDetailScoped(
  sql: UserScopedSql,
  userId: string,
  transactionId: string,
): Promise<TransactionDetail | null> {
  const rows = await sql<
    {
      readonly id: string;
      readonly event_type: string;
      readonly status: "posted" | "voided";
      readonly occurred_at: string;
      readonly economic_date: string;
      readonly primary_amount: string;
      readonly primary_currency: string;
      readonly category_id: string | null;
      readonly engine_version: string;
      readonly input_schema_version: number;
      readonly revision_group_id: string;
      readonly reverses_transaction_id: string | null;
    }[]
  >`
    select
      id::text, event_type, status, occurred_at::text, economic_date::text,
      primary_amount::text, primary_currency, category_id::text,
      engine_version, input_schema_version, revision_group_id::text,
      reverses_transaction_id::text
    from app_private.transactions
    where user_id = ${userId}::uuid
      and id = ${transactionId}::uuid
      and status in ('posted', 'voided')
  `;
  const row = rows[0];
  if (!row) return null;

  const postingRows = await sql<
    {
      readonly financial_account_id: string | null;
      readonly role: string;
      readonly side: "debit" | "credit";
      readonly amount_original: string;
      readonly currency: string;
      readonly fx_rate: string;
      readonly amount_base: string;
      readonly sequence_no: number;
    }[]
  >`
    select financial_account_id::text, role, side, amount_original::text,
           currency, fx_rate::text, amount_base::text, sequence_no
      from app_private.ledger_postings
     where user_id = ${userId}::uuid and transaction_id = ${transactionId}::uuid
     order by sequence_no
  `;
  const linkRows = await sql<
    {
      readonly related_transaction_id: string;
      readonly link_type: string;
      readonly allocated_amount: string | null;
    }[]
  >`
    select
      case when from_transaction_id = ${transactionId}::uuid
        then to_transaction_id::text else from_transaction_id::text end
        as related_transaction_id,
      link_type,
      allocated_amount::text
    from app_private.transaction_links
    where user_id = ${userId}::uuid
      and (
        from_transaction_id = ${transactionId}::uuid
        or to_transaction_id = ${transactionId}::uuid
      )
    order by created_at, id
  `;
  const auditRows = await sql<
    { readonly event_count: number; readonly last_occurred_at: string }[]
  >`
    select count(*)::integer as event_count,
           max(occurred_at)::text as last_occurred_at
      from app_private.audit_events
     where user_id = ${userId}::uuid
       and entity_type = 'transaction'
       and entity_id = ${transactionId}::uuid
  `;
  const audit = auditRows[0];
  if (!audit || !audit.last_occurred_at) {
    throw new Error("Posted transaction audit evidence is missing.");
  }
  return {
    id: row.id,
    type: row.event_type,
    status: row.status,
    occurredAt: row.occurred_at,
    economicDate: row.economic_date,
    amount: row.primary_amount,
    currency: row.primary_currency.trim(),
    categoryId: row.category_id,
    engineVersion: row.engine_version,
    inputSchemaVersion: row.input_schema_version,
    revisionGroupId: row.revision_group_id,
    reversesTransactionId: row.reverses_transaction_id,
    postings: postingRows.map((posting) => ({
      financialAccountId: posting.financial_account_id,
      role: posting.role,
      side: posting.side,
      amountOriginal: posting.amount_original,
      currency: posting.currency.trim(),
      fxRate: posting.fx_rate,
      amountBase: posting.amount_base,
      sequence: posting.sequence_no,
    })),
    links: linkRows.map((link) => ({
      relatedTransactionId: link.related_transaction_id,
      linkType: link.link_type,
      allocatedAmount: link.allocated_amount,
    })),
    audit: {
      eventCount: audit.event_count,
      lastOccurredAt: audit.last_occurred_at,
    },
  };
}

export async function getTransactionDetail(
  sql: LedgerSql,
  userId: string,
  transactionId: string,
): Promise<TransactionDetail | null> {
  return withUserScope(sql, userId, (tx) =>
    getTransactionDetailScoped(tx, userId, transactionId),
  );
}
