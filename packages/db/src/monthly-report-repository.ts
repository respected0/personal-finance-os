import { createHash, randomUUID } from "node:crypto";
import type { AccountNameKeyring } from "./account-crypto.js";
import type { LedgerSql } from "./ledger-repository.js";
import { encryptProtectedText } from "./protected-text-crypto.js";
import {
  applyUserScope,
  withUserScope,
  type UserScopedSql,
} from "./user-scope.js";

export const MONTHLY_REPORT_ENGINE_VERSION = "monthly-report-1.0.0";
export const MONTHLY_REPORT_RULE_VERSION = "monthly-rules-1.0.0";

export interface MonthlyReportMetrics {
  readonly income: string;
  readonly grossExpense: string;
  readonly refunds: string;
  readonly netExpense: string;
  readonly outflow: string;
  readonly savings: string;
  readonly breakdown: readonly {
    readonly categoryId: string | null;
    readonly income: string;
    readonly grossExpense: string;
    readonly refunds: string;
    readonly netExpense: string;
  }[];
  readonly trend: readonly {
    readonly date: string;
    readonly income: string;
    readonly grossExpense: string;
    readonly refunds: string;
    readonly netExpense: string;
    readonly savings: string;
  }[];
}

export interface MonthlyReportRecord {
  readonly id: string | null;
  readonly period: string;
  readonly version: number | null;
  readonly source: "live" | "version";
  readonly sourceHighWatermark: string;
  readonly engineVersion: typeof MONTHLY_REPORT_ENGINE_VERSION;
  readonly ruleVersion: typeof MONTHLY_REPORT_RULE_VERSION;
  readonly generatedAt: string;
  readonly staleAt: string | null;
  readonly staleReason: string | null;
  readonly checksum: string;
  readonly filters: {
    readonly accountId: string | null;
    readonly categoryId: string | null;
  };
  readonly metrics: MonthlyReportMetrics;
}

export class MonthlyReportNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("The requested monthly report version was not found.");
    this.name = "MonthlyReportNotFoundError";
  }
}

export class MonthlyReportFilterVersionError extends Error {
  readonly code = "report_filter_version_conflict";
  readonly status = 409;

  constructor() {
    super("Stored report versions represent the canonical unfiltered month.");
    this.name = "MonthlyReportFilterVersionError";
  }
}

interface StoredMetrics {
  readonly income: string;
  readonly gross_expense: string;
  readonly refunds: string;
  readonly net_expense: string;
  readonly outflow: string;
  readonly savings: string;
  readonly breakdown: readonly {
    readonly category_id: string | null;
    readonly income: string;
    readonly gross_expense: string;
    readonly refunds: string;
    readonly net_expense: string;
  }[];
  readonly trend: readonly {
    readonly date: string;
    readonly income: string;
    readonly gross_expense: string;
    readonly refunds: string;
    readonly net_expense: string;
    readonly savings: string;
  }[];
}

interface ComputedReport {
  readonly sourceHighWatermark: string;
  readonly storedMetrics: StoredMetrics;
  readonly metrics: MonthlyReportMetrics;
  readonly checksum: string;
}

function periodBounds(period: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new MonthlyReportNotFoundError();
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new MonthlyReportNotFoundError();
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start,
    end: `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

function publicMetrics(stored: StoredMetrics): MonthlyReportMetrics {
  return {
    income: stored.income,
    grossExpense: stored.gross_expense,
    refunds: stored.refunds,
    netExpense: stored.net_expense,
    outflow: stored.outflow,
    savings: stored.savings,
    breakdown: stored.breakdown.map((row) => ({
      categoryId: row.category_id,
      income: row.income,
      grossExpense: row.gross_expense,
      refunds: row.refunds,
      netExpense: row.net_expense,
    })),
    trend: stored.trend.map((row) => ({
      date: row.date,
      income: row.income,
      grossExpense: row.gross_expense,
      refunds: row.refunds,
      netExpense: row.net_expense,
      savings: row.savings,
    })),
  };
}

function checksum(stored: StoredMetrics): string {
  return createHash("sha256").update(JSON.stringify(stored)).digest("hex");
}

function isoDateTime(value: string): string {
  return new Date(value).toISOString();
}

async function computeMonthlyReport(
  tx: UserScopedSql,
  input: {
    readonly userId: string;
    readonly period: string;
    readonly accountId?: string;
    readonly categoryId?: string;
  },
): Promise<ComputedReport> {
  const bounds = periodBounds(input.period);
  const totalRows = await tx<
    {
      readonly income: string;
      readonly gross_expense: string;
      readonly refunds: string;
      readonly net_expense: string;
      readonly outflow: string;
      readonly savings: string;
      readonly source_high_watermark: string;
    }[]
  >`
    with selected as (
      select transaction.id, transaction.posted_at
        from app_private.transactions as transaction
       where transaction.user_id = ${input.userId}::uuid
         and transaction.status = 'posted'
         and transaction.economic_date >= ${bounds.start}::date
         and transaction.economic_date < ${bounds.end}::date
         and (${input.categoryId ?? null}::uuid is null
           or transaction.category_id = ${input.categoryId ?? null}::uuid)
         and (${input.accountId ?? null}::uuid is null or exists (
           select 1 from app_private.ledger_postings as account_posting
            where account_posting.user_id = transaction.user_id
              and account_posting.transaction_id = transaction.id
              and account_posting.financial_account_id = ${input.accountId ?? null}::uuid
         ))
    ), totals as (
      select
        coalesce(sum(posting.amount_base) filter (
          where posting.role = 'income' and posting.side = 'credit'
        ), 0)::numeric(19,4) as income_credit,
        coalesce(sum(posting.amount_base) filter (
          where posting.role = 'income' and posting.side = 'debit'
        ), 0)::numeric(19,4) as income_debit,
        coalesce(sum(posting.amount_base) filter (
          where posting.role in ('expense', 'fee_expense')
            and posting.side = 'debit'
        ), 0)::numeric(19,4) as gross_expense,
        coalesce(sum(posting.amount_base) filter (
          where posting.role in ('expense', 'fee_expense')
            and posting.side = 'credit'
        ), 0)::numeric(19,4) as refunds
        from app_private.ledger_postings as posting
        join selected on selected.id = posting.transaction_id
       where posting.user_id = ${input.userId}::uuid
    ), watermark as (
      select coalesce(max(posted_at), '1970-01-01T00:00:00Z'::timestamptz)
        as source_high_watermark from selected
    )
    select
      (income_credit - income_debit)::numeric(19,4)::text as income,
      gross_expense::text,
      refunds::text,
      (gross_expense - refunds)::numeric(19,4)::text as net_expense,
      (gross_expense - refunds)::numeric(19,4)::text as outflow,
      (income_credit - income_debit - gross_expense + refunds)::numeric(19,4)::text
        as savings,
      source_high_watermark::text
      from totals cross join watermark
  `;
  const total = totalRows[0];
  if (!total) throw new Error("Monthly report totals returned no row.");
  const breakdown = await tx<StoredMetrics["breakdown"]>`
    with selected as (
      select transaction.id, transaction.category_id
        from app_private.transactions as transaction
       where transaction.user_id = ${input.userId}::uuid
         and transaction.status = 'posted'
         and transaction.economic_date >= ${bounds.start}::date
         and transaction.economic_date < ${bounds.end}::date
         and (${input.categoryId ?? null}::uuid is null
           or transaction.category_id = ${input.categoryId ?? null}::uuid)
         and (${input.accountId ?? null}::uuid is null or exists (
           select 1 from app_private.ledger_postings as account_posting
            where account_posting.user_id = transaction.user_id
              and account_posting.transaction_id = transaction.id
              and account_posting.financial_account_id = ${input.accountId ?? null}::uuid
         ))
    )
    select selected.category_id::text,
      coalesce(sum(case when posting.role = 'income' and posting.side = 'credit'
        then posting.amount_base when posting.role = 'income'
        then -posting.amount_base else 0 end), 0)::numeric(19,4)::text as income,
      coalesce(sum(posting.amount_base) filter (where
        posting.role in ('expense', 'fee_expense') and posting.side = 'debit'
      ), 0)::numeric(19,4)::text as gross_expense,
      coalesce(sum(posting.amount_base) filter (where
        posting.role in ('expense', 'fee_expense') and posting.side = 'credit'
      ), 0)::numeric(19,4)::text as refunds,
      coalesce(sum(case when posting.role in ('expense', 'fee_expense')
        and posting.side = 'debit' then posting.amount_base
        when posting.role in ('expense', 'fee_expense') then -posting.amount_base
        else 0 end), 0)::numeric(19,4)::text as net_expense
      from selected
      join app_private.ledger_postings as posting
        on posting.user_id = ${input.userId}::uuid
       and posting.transaction_id = selected.id
     group by selected.category_id
     having coalesce(sum(case when posting.role in ('income', 'expense', 'fee_expense')
       then posting.amount_base else 0 end), 0) <> 0
     order by selected.category_id nulls last
  `;
  const trend = await tx<StoredMetrics["trend"]>`
    with selected as (
      select transaction.id, transaction.economic_date
        from app_private.transactions as transaction
       where transaction.user_id = ${input.userId}::uuid
         and transaction.status = 'posted'
         and transaction.economic_date >= ${bounds.start}::date
         and transaction.economic_date < ${bounds.end}::date
         and (${input.categoryId ?? null}::uuid is null
           or transaction.category_id = ${input.categoryId ?? null}::uuid)
         and (${input.accountId ?? null}::uuid is null or exists (
           select 1 from app_private.ledger_postings as account_posting
            where account_posting.user_id = transaction.user_id
              and account_posting.transaction_id = transaction.id
              and account_posting.financial_account_id = ${input.accountId ?? null}::uuid
         ))
    ), daily as (
      select selected.economic_date,
        coalesce(sum(case when posting.role = 'income' and posting.side = 'credit'
          then posting.amount_base when posting.role = 'income'
          then -posting.amount_base else 0 end), 0)::numeric(19,4) as income,
        coalesce(sum(posting.amount_base) filter (where
          posting.role in ('expense', 'fee_expense') and posting.side = 'debit'
        ), 0)::numeric(19,4) as gross_expense,
        coalesce(sum(posting.amount_base) filter (where
          posting.role in ('expense', 'fee_expense') and posting.side = 'credit'
        ), 0)::numeric(19,4) as refunds
        from selected
        join app_private.ledger_postings as posting
          on posting.user_id = ${input.userId}::uuid
         and posting.transaction_id = selected.id
       group by selected.economic_date
    )
    select economic_date::text as date, income::text, gross_expense::text,
           refunds::text, (gross_expense - refunds)::numeric(19,4)::text as net_expense,
           (income - gross_expense + refunds)::numeric(19,4)::text as savings
      from daily
     order by economic_date
  `;
  const storedMetrics: StoredMetrics = {
    income: total.income,
    gross_expense: total.gross_expense,
    refunds: total.refunds,
    net_expense: total.net_expense,
    outflow: total.outflow,
    savings: total.savings,
    breakdown: [...breakdown],
    trend: [...trend],
  };
  return {
    sourceHighWatermark: isoDateTime(total.source_high_watermark),
    storedMetrics,
    metrics: publicMetrics(storedMetrics),
    checksum: checksum(storedMetrics),
  };
}

interface StoredReportRow {
  readonly id: string;
  readonly period: string;
  readonly version: number;
  readonly source_high_watermark: string;
  readonly engine_version: typeof MONTHLY_REPORT_ENGINE_VERSION;
  readonly rule_version: typeof MONTHLY_REPORT_RULE_VERSION;
  readonly metrics_json: StoredMetrics;
  readonly checksum: string;
  readonly generated_at: string;
  readonly stale_at: string | null;
  readonly stale_reason: string | null;
}

function reportFromStored(row: StoredReportRow): MonthlyReportRecord {
  return {
    id: row.id,
    period: row.period.slice(0, 7),
    version: row.version,
    source: "version",
    sourceHighWatermark: isoDateTime(row.source_high_watermark),
    engineVersion: row.engine_version,
    ruleVersion: row.rule_version,
    generatedAt: isoDateTime(row.generated_at),
    staleAt: row.stale_at ? isoDateTime(row.stale_at) : null,
    staleReason: row.stale_reason,
    checksum: row.checksum,
    filters: { accountId: null, categoryId: null },
    metrics: publicMetrics(row.metrics_json),
  };
}

async function storedReport(
  tx: UserScopedSql,
  input: {
    readonly userId: string;
    readonly period: string;
    readonly version: "latest" | number;
  },
): Promise<StoredReportRow | null> {
  const bounds = periodBounds(input.period);
  const rows = await tx<StoredReportRow[]>`
    select id::text, period::text, version, source_high_watermark::text,
           engine_version, rule_version, metrics_json,
           encode(checksum, 'hex') as checksum, generated_at::text,
           stale_at::text, stale_reason
      from app_private.monthly_report_versions
     where user_id = ${input.userId}::uuid
       and period = ${bounds.start}::date
       and (${input.version === "latest" ? null : input.version}::integer is null
         or version = ${input.version === "latest" ? null : input.version}::integer)
       and (${input.version === "latest"}::boolean = false or stale_at is null)
     order by version desc
     limit 1
  `;
  return rows[0] ?? null;
}

export async function getMonthlyReport(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly period: string;
    readonly version: "latest" | number;
    readonly accountId?: string;
    readonly categoryId?: string;
  },
): Promise<MonthlyReportRecord> {
  const filtered = Boolean(input.accountId || input.categoryId);
  if (filtered && input.version !== "latest") {
    throw new MonthlyReportFilterVersionError();
  }
  return withUserScope(sql, input.userId, async (tx) => {
    if (!filtered) {
      const stored = await storedReport(tx, input);
      if (stored) return reportFromStored(stored);
      if (input.version !== "latest") throw new MonthlyReportNotFoundError();
    }
    const computed = await computeMonthlyReport(tx, input);
    return {
      id: null,
      period: input.period,
      version: null,
      source: "live",
      sourceHighWatermark: computed.sourceHighWatermark,
      engineVersion: MONTHLY_REPORT_ENGINE_VERSION,
      ruleVersion: MONTHLY_REPORT_RULE_VERSION,
      generatedAt: new Date().toISOString(),
      staleAt: null,
      staleReason: null,
      checksum: computed.checksum,
      filters: {
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
      },
      metrics: computed.metrics,
    };
  });
}

export async function createMonthlyReportVersion(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: {
    readonly userId: string;
    readonly period: string;
    readonly reason: string;
  },
): Promise<MonthlyReportRecord> {
  const bounds = periodBounds(input.period);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await sql.begin("isolation level serializable", async (tx) => {
        await applyUserScope(tx, input.userId);
        await tx`
          select pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(${`${input.userId}:${input.period}`}, 0)
          )
        `;
        const versions = await tx<{ readonly version: number }[]>`
          select coalesce(max(version), 0)::integer as version
            from app_private.monthly_report_versions
           where user_id = ${input.userId}::uuid
             and period = ${bounds.start}::date
        `;
        const version = (versions[0]?.version ?? 0) + 1;
        const id = randomUUID();
        const computed = await computeMonthlyReport(tx, input);
        const envelope = encryptProtectedText(
          input.reason,
          input.userId,
          id,
          "monthly-report-generation-reason",
          keyring,
        );
        const rows = await tx<StoredReportRow[]>`
          insert into app_private.monthly_report_versions (
            id, user_id, period, version, source_high_watermark,
            engine_version, rule_version, metrics_json, checksum,
            generation_reason_enc, generation_reason_key_id,
            generation_reason_algorithm, generation_reason_enc_version,
            generation_reason_nonce, generation_reason_auth_tag,
            generation_reason_aad_version
          ) values (
            ${id}::uuid, ${input.userId}::uuid, ${bounds.start}::date, ${version},
            ${computed.sourceHighWatermark}::timestamptz,
            ${MONTHLY_REPORT_ENGINE_VERSION}, ${MONTHLY_REPORT_RULE_VERSION},
            ${tx.json(JSON.parse(JSON.stringify(computed.storedMetrics)))},
            decode(${computed.checksum}, 'hex'), ${envelope.ciphertext},
            ${envelope.keyId}, ${envelope.algorithm},
            ${envelope.encryptionVersion}, ${envelope.nonce},
            ${envelope.authTag}, ${envelope.aadVersion}
          )
          returning id::text, period::text, version,
                    source_high_watermark::text, engine_version, rule_version,
                    metrics_json, encode(checksum, 'hex') as checksum,
                    generated_at::text, stale_at::text, stale_reason
        `;
        const row = rows[0];
        if (!row) throw new Error("Monthly report version was not inserted.");
        return reportFromStored(row);
      });
    } catch (error) {
      if (
        attempt === 3 ||
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        !["40001", "40P01", "23505"].includes(String(error.code))
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }
  throw new Error("Monthly report version retry limit exhausted.");
}
