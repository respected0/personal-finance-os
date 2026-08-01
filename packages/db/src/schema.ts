import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Reviewed files under supabase/migrations remain the only schema authority.
 * This Drizzle model is a type-safe query mirror; drizzle push is forbidden.
 */
export const schemaAuthority = "supabase-sql-migrations";

const bytea = customType<{ data: Uint8Array }>({
  dataType: () => "bytea",
});

export const appPrivate = pgSchema("app_private");

export const ledgerAccounts = appPrivate.table(
  "ledger_accounts",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    code: text().notNull(),
    name: text().notNull(),
    accountClass: text("account_class").notNull(),
    normalSide: text("normal_side").notNull(),
    systemRole: text("system_role").notNull(),
    hidden: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ledger_accounts_user_id_unique").on(table.userId, table.id),
    uniqueIndex("ledger_accounts_user_code_unique").on(
      table.userId,
      table.code,
    ),
    uniqueIndex("ledger_accounts_user_system_role_unique").on(
      table.userId,
      table.systemRole,
    ),
    index("ledger_accounts_user_active_idx").on(table.userId, table.active),
  ],
);

export const transactions = appPrivate.table(
  "transactions",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    eventType: text("event_type").notNull(),
    status: text().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    economicDate: date("economic_date").notNull(),
    primaryAmount: numeric("primary_amount", {
      precision: 19,
      scale: 4,
    }).notNull(),
    primaryCurrency: char("primary_currency", { length: 3 }).notNull(),
    categoryId: uuid("category_id"),
    counterpartyId: uuid("counterparty_id"),
    engineVersion: text("engine_version").notNull(),
    inputSchemaVersion: integer("input_schema_version").notNull(),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull(),
    previewHash: char("preview_hash", { length: 64 }).notNull(),
    revisionGroupId: uuid("revision_group_id").notNull(),
    reversesTransactionId: uuid("reverses_transaction_id"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("transactions_user_id_unique").on(table.userId, table.id),
    uniqueIndex("transactions_user_client_request_unique").on(
      table.userId,
      table.clientRequestId,
    ),
    uniqueIndex("transactions_user_reversal_unique").on(
      table.userId,
      table.reversesTransactionId,
    ),
    index("transactions_user_economic_date_idx").on(
      table.userId,
      table.economicDate,
      table.id,
    ),
    index("transactions_user_occurred_at_idx").on(
      table.userId,
      table.occurredAt,
      table.id,
    ),
    index("transactions_user_event_date_idx").on(
      table.userId,
      table.eventType,
      table.economicDate,
    ),
    index("transactions_user_revision_group_idx").on(
      table.userId,
      table.revisionGroupId,
    ),
    check(
      "transactions_primary_amount_positive",
      sql`${table.primaryAmount} > 0`,
    ),
  ],
);

export const ledgerPostings = appPrivate.table(
  "ledger_postings",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    financialAccountId: uuid("financial_account_id"),
    side: text().notNull(),
    amountOriginal: numeric("amount_original", {
      precision: 19,
      scale: 4,
    }).notNull(),
    currency: char({ length: 3 }).notNull(),
    fxRate: numeric("fx_rate", { precision: 28, scale: 12 }).notNull(),
    amountBase: numeric("amount_base", {
      precision: 19,
      scale: 4,
    }).notNull(),
    role: text().notNull(),
    sequenceNo: smallint("sequence_no").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ledger_postings_transaction_sequence_unique").on(
      table.transactionId,
      table.sequenceNo,
    ),
    index("ledger_postings_user_transaction_idx").on(
      table.userId,
      table.transactionId,
    ),
    index("ledger_postings_user_ledger_account_idx").on(
      table.userId,
      table.ledgerAccountId,
    ),
    index("ledger_postings_user_financial_account_idx")
      .on(table.userId, table.financialAccountId)
      .where(sql`${table.financialAccountId} is not null`),
    check(
      "ledger_postings_amount_original_positive",
      sql`${table.amountOriginal} > 0`,
    ),
    check("ledger_postings_amount_base_positive", sql`${table.amountBase} > 0`),
    check("ledger_postings_fx_rate_positive", sql`${table.fxRate} > 0`),
  ],
);

export const transactionLinks = appPrivate.table(
  "transaction_links",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    fromTransactionId: uuid("from_transaction_id").notNull(),
    toTransactionId: uuid("to_transaction_id").notNull(),
    linkType: text("link_type").notNull(),
    allocatedAmount: numeric("allocated_amount", { precision: 19, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("transaction_links_owner_edge_unique").on(
      table.userId,
      table.fromTransactionId,
      table.toTransactionId,
      table.linkType,
    ),
    index("transaction_links_user_from_idx").on(
      table.userId,
      table.fromTransactionId,
    ),
    index("transaction_links_user_to_idx").on(
      table.userId,
      table.toTransactionId,
    ),
  ],
);

export const idempotencyKeys = appPrivate.table(
  "idempotency_keys",
  {
    userId: uuid("user_id").notNull(),
    key: text().notNull(),
    requestHash: bytea("request_hash").notNull(),
    status: text().notNull(),
    responseCode: integer("response_code"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
  ],
);

export const auditEvents = appPrivate.table(
  "audit_events",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text().notNull(),
    beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
    afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
    actorSessionId: uuid("actor_session_id"),
    requestId: text("request_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    prevHash: bytea("prev_hash"),
    eventHash: bytea("event_hash").notNull(),
  },
  (table) => [
    uniqueIndex("audit_events_user_id_unique").on(table.userId, table.id),
    index("audit_events_user_entity_idx").on(
      table.userId,
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
    index("audit_events_user_request_idx").on(table.userId, table.requestId),
    index("audit_events_user_occurred_at_idx").on(
      table.userId,
      table.occurredAt,
      table.id,
    ),
  ],
);

export const outboxEvents = appPrivate.table(
  "outbox_events",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: integer("event_version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex("outbox_events_source_unique").on(
      table.aggregateId,
      table.eventType,
      table.eventVersion,
    ),
    index("outbox_events_pending_idx")
      .on(table.createdAt, table.id)
      .where(sql`${table.processedAt} is null`),
    index("outbox_events_user_aggregate_idx").on(
      table.userId,
      table.aggregateType,
      table.aggregateId,
    ),
  ],
);
