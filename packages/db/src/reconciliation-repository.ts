import { createHash, randomUUID } from "node:crypto";
import {
  Money,
  type FinancialAccountKind,
  type NonRevisionTransactionCommand,
} from "@personal-finance-os/domain";
import type { AccountNameKeyring } from "./account-crypto.js";
import {
  commitLedgerTransaction,
  type CommitTransactionResponse,
  IdempotencyConflictError,
  type LedgerSql,
  SerializationRetryExhaustedError,
} from "./ledger-repository.js";
import { encryptProtectedText } from "./protected-text-crypto.js";
import {
  applyUserScope,
  withUserScope,
  type UserScopedSql,
} from "./user-scope.js";

export type SnapshotStatus = "open" | "resolved" | "ignored";
export type ReconciliationResolutionType =
  "missing_transaction" | "adjustment" | "accepted";

export interface BalanceSnapshotRecord {
  readonly id: string;
  readonly accountId: string;
  readonly observedAt: string;
  readonly statedBalance: string;
  readonly calculatedBalance: string;
  readonly difference: string;
  readonly status: SnapshotStatus;
}

export interface ReconciliationItemRecord {
  readonly id: string;
  readonly snapshot: BalanceSnapshotRecord;
  readonly resolutionType: ReconciliationResolutionType | null;
  readonly transactionId: string | null;
  readonly resolvedAt: string | null;
}

export interface ReconciliationSessionRecord {
  readonly id: string;
  readonly accountId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: "open" | "resolved";
  readonly unresolvedCount: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly items: readonly ReconciliationItemRecord[];
}

export class ReconciliationNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("The requested reconciliation resource was not found.");
    this.name = "ReconciliationNotFoundError";
  }
}

export class ReconciliationStateError extends Error {
  readonly code = "reconciliation_conflict";
  readonly status = 409;

  constructor() {
    super("The reconciliation state changed or the resolution is invalid.");
    this.name = "ReconciliationStateError";
  }
}

function accountKind(
  stored: "bank" | "cash" | "wallet" | "credit_card" | "investment",
): FinancialAccountKind {
  return stored === "credit_card" ? "card" : stored;
}

async function appendEvidence(
  tx: UserScopedSql,
  input: {
    readonly userId: string;
    readonly entityType: "balance_snapshot" | "reconciliation";
    readonly entityId: string;
    readonly action: string;
    readonly requestId: string;
    readonly after: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await tx`
    select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(${input.userId}, 0)
    )
  `;
  const previousRows = await tx<{ readonly event_hash: string }[]>`
    select encode(event_hash, 'hex') as event_hash
      from app_private.audit_events
     where user_id = ${input.userId}::uuid
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
      request_id, prev_hash, event_hash
    ) values (
      ${randomUUID()}::uuid, ${input.userId}::uuid, ${input.entityType},
      ${input.entityId}::uuid, ${input.action}, null,
      ${tx.json(JSON.parse(JSON.stringify(input.after)))}, ${input.requestId},
      case when ${previousHash} = '' then null else decode(${previousHash}, 'hex') end,
      decode(${eventHash}, 'hex')
    )
  `;
}

function snapshotFromRow(row: {
  readonly id: string;
  readonly account_id: string;
  readonly observed_at: string;
  readonly stated_balance: string;
  readonly calculated_balance: string;
  readonly difference: string;
  readonly status: SnapshotStatus;
}): BalanceSnapshotRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    observedAt: row.observed_at,
    statedBalance: row.stated_balance,
    calculatedBalance: row.calculated_balance,
    difference: row.difference,
    status: row.status,
  };
}

export async function createBalanceSnapshot(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly accountId: string;
    readonly observedAt: string;
    readonly statedBalance: string;
    readonly requestId: string;
  },
): Promise<BalanceSnapshotRecord> {
  const id = randomUUID();
  return sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const rows = await tx<
      {
        readonly id: string;
        readonly account_id: string;
        readonly observed_at: string;
        readonly stated_balance: string;
        readonly calculated_balance: string;
        readonly difference: string;
        readonly status: SnapshotStatus;
      }[]
    >`
      with owned_account as (
        select id, account_type
          from app_private.financial_accounts
         where user_id = ${input.userId}::uuid
           and id = ${input.accountId}::uuid
           and status = 'active'
         for share
      ), calculated as (
        select coalesce(sum(
          case
            when account.account_type = 'credit_card' and posting.side = 'credit'
              then posting.amount_original
            when account.account_type = 'credit_card'
              then -posting.amount_original
            when posting.side = 'debit' then posting.amount_original
            else -posting.amount_original
          end
        ) filter (where transaction.id is not null), 0)::numeric(19,4) as amount
          from owned_account as account
          left join app_private.ledger_postings as posting
            on posting.user_id = ${input.userId}::uuid
           and posting.financial_account_id = account.id
          left join app_private.transactions as transaction
            on transaction.user_id = posting.user_id
           and transaction.id = posting.transaction_id
           and transaction.status = 'posted'
           and transaction.posted_at <= ${input.observedAt}::timestamptz
      )
      insert into app_private.balance_snapshots (
        id, user_id, account_id, observed_at, stated_balance,
        calculated_balance
      )
      select ${id}::uuid, ${input.userId}::uuid, account.id,
             ${input.observedAt}::timestamptz, ${input.statedBalance}::numeric,
             calculated.amount
        from owned_account as account cross join calculated
      returning id::text, account_id::text, observed_at::text,
                stated_balance::text, calculated_balance::text,
                difference::text, status
    `;
    const row = rows[0];
    if (!row) throw new ReconciliationNotFoundError();
    await appendEvidence(tx, {
      userId: input.userId,
      entityType: "balance_snapshot",
      entityId: id,
      action: "created",
      requestId: input.requestId,
      after: {
        account_id: input.accountId,
        snapshot_id: id,
        status: "open",
      },
    });
    return snapshotFromRow(row);
  });
}

async function sessionById(
  tx: UserScopedSql,
  userId: string,
  sessionId: string,
): Promise<ReconciliationSessionRecord | null> {
  const sessions = await tx<
    {
      readonly id: string;
      readonly account_id: string;
      readonly period_start: string;
      readonly period_end: string;
      readonly status: "open" | "resolved";
      readonly unresolved_count: number;
      readonly started_at: string;
      readonly completed_at: string | null;
    }[]
  >`
    select id::text, account_id::text, lower(period)::text as period_start,
           (upper(period) - 1)::text as period_end, status, unresolved_count,
           started_at::text, completed_at::text
      from app_private.reconciliation_sessions
     where user_id = ${userId}::uuid and id = ${sessionId}::uuid
  `;
  const session = sessions[0];
  if (!session) return null;
  const items = await tx<
    {
      readonly id: string;
      readonly resolution_type: ReconciliationResolutionType | null;
      readonly transaction_id: string | null;
      readonly resolved_at: string | null;
      readonly snapshot_id: string;
      readonly account_id: string;
      readonly observed_at: string;
      readonly stated_balance: string;
      readonly calculated_balance: string;
      readonly difference: string;
      readonly snapshot_status: SnapshotStatus;
    }[]
  >`
    select item.id::text, item.resolution_type,
           item.transaction_id::text, item.resolved_at::text,
           snapshot.id::text as snapshot_id, snapshot.account_id::text,
           snapshot.observed_at::text, snapshot.stated_balance::text,
           snapshot.calculated_balance::text, snapshot.difference::text,
           snapshot.status as snapshot_status
      from app_private.reconciliation_items as item
      join app_private.balance_snapshots as snapshot
        on snapshot.user_id = item.user_id and snapshot.id = item.snapshot_id
     where item.user_id = ${userId}::uuid
       and item.session_id = ${sessionId}::uuid
     order by snapshot.observed_at, item.id
  `;
  return {
    id: session.id,
    accountId: session.account_id,
    periodStart: session.period_start,
    periodEnd: session.period_end,
    status: session.status,
    unresolvedCount: session.unresolved_count,
    startedAt: session.started_at,
    completedAt: session.completed_at,
    items: items.map((item) => ({
      id: item.id,
      resolutionType: item.resolution_type,
      transactionId: item.transaction_id,
      resolvedAt: item.resolved_at,
      snapshot: snapshotFromRow({
        id: item.snapshot_id,
        account_id: item.account_id,
        observed_at: item.observed_at,
        stated_balance: item.stated_balance,
        calculated_balance: item.calculated_balance,
        difference: item.difference,
        status: item.snapshot_status,
      }),
    })),
  };
}

export async function createReconciliationSession(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly accountId: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly snapshotIds: readonly string[];
    readonly requestId: string;
  },
): Promise<ReconciliationSessionRecord> {
  const id = randomUUID();
  const uniqueSnapshotIds = [...new Set(input.snapshotIds)];
  if (uniqueSnapshotIds.length !== input.snapshotIds.length) {
    throw new ReconciliationStateError();
  }
  return sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const snapshots = await tx<{ readonly id: string }[]>`
      select id::text
        from app_private.balance_snapshots
       where user_id = ${input.userId}::uuid
         and account_id = ${input.accountId}::uuid
         and id = any(${uniqueSnapshotIds}::uuid[])
         and status = 'open'
         and observed_at::date <@ daterange(
           ${input.periodStart}::date, ${input.periodEnd}::date, '[]'
         )
       for update
    `;
    if (snapshots.length !== uniqueSnapshotIds.length) {
      throw new ReconciliationStateError();
    }
    await tx`
      insert into app_private.reconciliation_sessions (
        id, user_id, account_id, period, unresolved_count
      ) values (
        ${id}::uuid, ${input.userId}::uuid, ${input.accountId}::uuid,
        daterange(${input.periodStart}::date, ${input.periodEnd}::date, '[]'),
        ${uniqueSnapshotIds.length}
      )
    `;
    for (const snapshotId of uniqueSnapshotIds) {
      await tx`
        insert into app_private.reconciliation_items (
          id, user_id, session_id, snapshot_id
        ) values (
          ${randomUUID()}::uuid, ${input.userId}::uuid,
          ${id}::uuid, ${snapshotId}::uuid
        )
      `;
    }
    await appendEvidence(tx, {
      userId: input.userId,
      entityType: "reconciliation",
      entityId: id,
      action: "created",
      requestId: input.requestId,
      after: {
        account_id: input.accountId,
        reconciliation_id: id,
        snapshot_count: uniqueSnapshotIds.length,
        status: "open",
      },
    });
    const session = await sessionById(tx, input.userId, id);
    if (!session) throw new ReconciliationNotFoundError();
    return session;
  });
}

interface ResolutionContext {
  readonly itemId: string;
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly accountId: string;
  readonly accountType:
    "bank" | "cash" | "wallet" | "credit_card" | "investment";
  readonly currency: string;
  readonly observedAt: string;
  readonly difference: string;
}

async function resolutionContext(
  sql: LedgerSql,
  userId: string,
  sessionId: string,
  itemId: string,
): Promise<ResolutionContext> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) =>
      tx<
        {
          readonly item_id: string;
          readonly session_id: string;
          readonly snapshot_id: string;
          readonly account_id: string;
          readonly account_type: ResolutionContext["accountType"];
          readonly currency: string;
          readonly observed_at: string;
          readonly difference: string;
        }[]
      >`
      select item.id::text as item_id, session.id::text as session_id,
             snapshot.id::text as snapshot_id, session.account_id::text,
             account.account_type, account.currency, snapshot.observed_at::text,
             snapshot.difference::text
        from app_private.reconciliation_items as item
        join app_private.reconciliation_sessions as session
          on session.user_id = item.user_id and session.id = item.session_id
        join app_private.balance_snapshots as snapshot
          on snapshot.user_id = item.user_id and snapshot.id = item.snapshot_id
        join app_private.financial_accounts as account
          on account.user_id = session.user_id and account.id = session.account_id
       where item.user_id = ${userId}::uuid
         and item.id = ${itemId}::uuid
         and item.session_id = ${sessionId}::uuid
         and item.resolved_at is null
         and session.status = 'open'
         and snapshot.status = 'open'
    `,
  );
  const row = rows[0];
  if (!row) throw new ReconciliationNotFoundError();
  return {
    itemId: row.item_id,
    sessionId: row.session_id,
    snapshotId: row.snapshot_id,
    accountId: row.account_id,
    accountType: row.account_type,
    currency: row.currency.trim(),
    observedAt: row.observed_at,
    difference: row.difference,
  };
}

async function finalizeResolution(
  tx: UserScopedSql,
  input: {
    readonly userId: string;
    readonly context: ResolutionContext;
    readonly resolutionType: ReconciliationResolutionType;
    readonly transactionId?: string;
    readonly reasonEnvelope: ReturnType<typeof encryptProtectedText>;
    readonly requestId: string;
  },
): Promise<void> {
  const locked = await tx`
    select item.id
      from app_private.reconciliation_items as item
      join app_private.reconciliation_sessions as session
        on session.user_id = item.user_id and session.id = item.session_id
      join app_private.balance_snapshots as snapshot
        on snapshot.user_id = item.user_id and snapshot.id = item.snapshot_id
     where item.user_id = ${input.userId}::uuid
       and item.id = ${input.context.itemId}::uuid
       and item.session_id = ${input.context.sessionId}::uuid
       and item.snapshot_id = ${input.context.snapshotId}::uuid
       and item.resolved_at is null
       and session.status = 'open'
       and snapshot.status = 'open'
     for update of item, session, snapshot
  `;
  if (!locked[0]) throw new ReconciliationStateError();

  const envelope = input.reasonEnvelope;
  await tx`
    update app_private.reconciliation_items
       set resolution_type = ${input.resolutionType},
           transaction_id = ${input.transactionId ?? null}::uuid,
           reason_enc = ${envelope.ciphertext},
           reason_key_id = ${envelope.keyId},
           reason_algorithm = ${envelope.algorithm},
           reason_enc_version = ${envelope.encryptionVersion},
           reason_nonce = ${envelope.nonce},
           reason_auth_tag = ${envelope.authTag},
           reason_aad_version = ${envelope.aadVersion},
           resolved_at = now()
     where user_id = ${input.userId}::uuid
       and id = ${input.context.itemId}::uuid
       and resolved_at is null
  `;
  await tx`
    update app_private.balance_snapshots
       set status = ${input.resolutionType === "accepted" ? "ignored" : "resolved"},
           note_enc = ${envelope.ciphertext},
           note_key_id = ${envelope.keyId},
           note_algorithm = ${envelope.algorithm},
           note_enc_version = ${envelope.encryptionVersion},
           note_nonce = ${envelope.nonce},
           note_auth_tag = ${envelope.authTag},
           note_aad_version = ${envelope.aadVersion}
     where user_id = ${input.userId}::uuid
       and id = ${input.context.snapshotId}::uuid
       and status = 'open'
  `;
  await tx`
    update app_private.reconciliation_sessions
       set unresolved_count = unresolved_count - 1,
           status = case when unresolved_count = 1 then 'resolved' else 'open' end,
           completed_at = case when unresolved_count = 1 then now() else null end
     where user_id = ${input.userId}::uuid
       and id = ${input.context.sessionId}::uuid
       and status = 'open'
       and unresolved_count > 0
  `;
  await appendEvidence(tx, {
    userId: input.userId,
    entityType: "reconciliation",
    entityId: input.context.sessionId,
    action: "item_resolved",
    requestId: input.requestId,
    after: {
      item_id: input.context.itemId,
      resolution_type: input.resolutionType,
      status: "resolved",
      transaction_id: input.transactionId ?? null,
    },
  });
}

export async function resolveReconciliationItem(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly itemId: string;
    readonly resolutionType: ReconciliationResolutionType;
    readonly reason: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly fxRate?: string;
    readonly command?: NonRevisionTransactionCommand;
  },
): Promise<{
  readonly session: ReconciliationSessionRecord;
  readonly transaction: CommitTransactionResponse | null;
}> {
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        command: input.command ?? null,
        fxRate: input.fxRate ?? null,
        itemId: input.itemId,
        reason: input.reason,
        resolutionType: input.resolutionType,
        sessionId: input.sessionId,
      }),
    )
    .digest("hex");
  const existingRows = await withUserScope(
    sql,
    input.userId,
    (tx) =>
      tx<
        {
          readonly request_hash: string;
          readonly response_body:
            | CommitTransactionResponse
            | {
                readonly accepted: true;
              }
            | null;
          readonly status: string;
        }[]
      >`
      select encode(request_hash, 'hex') as request_hash, response_body, status
        from app_private.idempotency_keys
       where user_id = ${input.userId}::uuid
         and key = ${input.idempotencyKey}
    `,
  );
  const existing = existingRows[0];
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new IdempotencyConflictError();
    }
    if (existing.status !== "completed" || !existing.response_body) {
      throw new SerializationRetryExhaustedError();
    }
    const session = await withUserScope(sql, input.userId, (tx) =>
      sessionById(tx, input.userId, input.sessionId),
    );
    if (!session) throw new ReconciliationNotFoundError();
    return {
      session,
      transaction:
        "accepted" in existing.response_body
          ? null
          : { ...existing.response_body, replayed: true },
    };
  }

  const context = await resolutionContext(
    sql,
    input.userId,
    input.sessionId,
    input.itemId,
  );
  const reasonEnvelope = encryptProtectedText(
    input.reason,
    input.userId,
    input.itemId,
    "reconciliation-reason",
    keyring,
  );

  if (input.resolutionType === "accepted") {
    const session = await sql.begin(
      "isolation level serializable",
      async (tx) => {
        await applyUserScope(tx, input.userId);
        await tx`
        insert into app_private.idempotency_keys (
          user_id, key, request_hash, status, expires_at
        ) values (
          ${input.userId}::uuid, ${input.idempotencyKey},
          decode(${requestHash}, 'hex'), 'processing', now() + interval '24 hours'
        )
      `;
        await finalizeResolution(tx, {
          userId: input.userId,
          context,
          resolutionType: "accepted",
          reasonEnvelope,
          requestId: input.requestId,
        });
        const finalized = await sessionById(tx, input.userId, input.sessionId);
        if (!finalized) throw new ReconciliationNotFoundError();
        await tx`
          update app_private.idempotency_keys
             set status = 'completed', response_code = 200,
                 response_body = ${tx.json({ accepted: true })}, updated_at = now()
           where user_id = ${input.userId}::uuid
             and key = ${input.idempotencyKey}
        `;
        return finalized;
      },
    );
    return { session, transaction: null };
  }

  let command: NonRevisionTransactionCommand;
  if (input.resolutionType === "adjustment") {
    const difference = Money.from(context.difference, context.currency);
    if (difference.isZero()) throw new ReconciliationStateError();
    command = {
      type: "balance_adjustment",
      amount: difference.absolute().toCanonical(),
      direction: difference.isPositive() ? "increase" : "decrease",
      accountId: context.accountId,
      accountKind: accountKind(context.accountType),
      currency: context.currency,
      occurredAt: new Date().toISOString(),
      economicDate: context.observedAt.slice(0, 10),
      ...(input.fxRate ? { fxRate: input.fxRate } : {}),
      reason: input.reason,
      reconciliationId: context.sessionId,
    };
  } else {
    if (!input.command) throw new ReconciliationStateError();
    command = input.command;
  }

  const transaction = await commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    requestHash,
    command,
    requiredFinancialAccountId: context.accountId,
    beforeFinalize: async ({ tx, transactionId }) => {
      await finalizeResolution(tx, {
        userId: input.userId,
        context,
        resolutionType: input.resolutionType,
        transactionId,
        reasonEnvelope,
        requestId: input.requestId,
      });
    },
  });
  const session = await withUserScope(sql, input.userId, (tx) =>
    sessionById(tx, input.userId, input.sessionId),
  );
  if (!session) throw new ReconciliationNotFoundError();
  return { session, transaction };
}
