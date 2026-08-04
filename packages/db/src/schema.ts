import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  date,
  foreignKey,
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

const dateRange = customType<{ data: string }>({
  dataType: () => "daterange",
});

export const appPrivate = pgSchema("app_private");
export const appIdentity = pgSchema("app_identity");

export const profiles = appIdentity.table("profiles", {
  id: uuid().primaryKey(),
  reportingCurrency: char("reporting_currency", { length: 3 })
    .notNull()
    .default("TRY"),
  locale: text().notNull().default("tr-TR"),
  timezone: text().notNull().default("Europe/Istanbul"),
  status: text().notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ledgerAccounts = appPrivate.table(
  "ledger_accounts",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    code: text().notNull(),
    name: text().notNull(),
    accountClass: text("account_class").notNull(),
    normalSide: text("normal_side").notNull(),
    systemRole: text("system_role"),
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

export const institutions = appPrivate.table(
  "institutions",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text().notNull(),
    institutionType: text("institution_type").notNull(),
    active: boolean().notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("institutions_user_id_unique").on(table.userId, table.id),
    index("institutions_user_active_idx").on(
      table.userId,
      table.active,
      table.name,
    ),
  ],
);

export const categories = appPrivate.table(
  "categories",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    parentId: uuid("parent_id"),
    name: text().notNull(),
    categoryType: text("category_type").notNull(),
    defaultLedgerAccountId: uuid("default_ledger_account_id").notNull(),
    active: boolean().notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_user_id_unique").on(table.userId, table.id),
    uniqueIndex("categories_user_name_type_unique").on(
      table.userId,
      table.name,
      table.categoryType,
    ),
    index("categories_user_type_active_idx").on(
      table.userId,
      table.categoryType,
      table.active,
      table.sortOrder,
      table.name,
    ),
    foreignKey({
      columns: [table.userId, table.parentId],
      foreignColumns: [table.userId, table.id],
      name: "categories_parent_fk",
    }),
    foreignKey({
      columns: [table.userId, table.defaultLedgerAccountId],
      foreignColumns: [ledgerAccounts.userId, ledgerAccounts.id],
      name: "categories_default_ledger_account_fk",
    }),
  ],
);

export const financialAccounts = appPrivate.table(
  "financial_accounts",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    institutionId: uuid("institution_id"),
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    nameEnc: bytea("name_enc").notNull(),
    nameKeyId: text("name_key_id").notNull(),
    nameAlgorithm: text("name_algorithm").notNull(),
    nameEncVersion: smallint("name_enc_version").notNull().default(1),
    nameNonce: bytea("name_nonce").notNull(),
    nameAuthTag: bytea("name_auth_tag").notNull(),
    nameAadVersion: smallint("name_aad_version").notNull().default(1),
    accountType: text("account_type").notNull(),
    currency: char({ length: 3 }).notNull(),
    openingDate: date("opening_date").notNull(),
    status: text().notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_accounts_user_id_unique").on(table.userId, table.id),
    uniqueIndex("financial_accounts_user_ledger_unique").on(
      table.userId,
      table.ledgerAccountId,
    ),
    uniqueIndex("financial_accounts_user_id_ledger_unique").on(
      table.userId,
      table.id,
      table.ledgerAccountId,
    ),
    index("financial_accounts_user_status_idx").on(
      table.userId,
      table.status,
      table.accountType,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.userId, table.institutionId],
      foreignColumns: [institutions.userId, institutions.id],
      name: "financial_accounts_institution_fk",
    }),
    foreignKey({
      columns: [table.userId, table.ledgerAccountId],
      foreignColumns: [ledgerAccounts.userId, ledgerAccounts.id],
      name: "financial_accounts_ledger_account_fk",
    }),
  ],
);

export const creditCardProfiles = appPrivate.table(
  "credit_card_profiles",
  {
    accountId: uuid("account_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    creditLimit: numeric("credit_limit", { precision: 19, scale: 4 }).notNull(),
    statementDay: smallint("statement_day").notNull(),
    dueDay: smallint("due_day").notNull(),
    minimumPaymentRule: jsonb("minimum_payment_rule")
      .$type<Record<string, string>>()
      .notNull(),
    active: boolean().notNull().default(true),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("credit_card_profiles_user_account_unique").on(
      table.userId,
      table.accountId,
    ),
    index("credit_card_profiles_user_active_idx").on(
      table.userId,
      table.active,
      table.accountId,
    ),
    foreignKey({
      columns: [table.userId, table.accountId],
      foreignColumns: [financialAccounts.userId, financialAccounts.id],
      name: "credit_card_profiles_account_fk",
    }),
  ],
);

export const creditCardStatements = appPrivate.table(
  "credit_card_statements",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    cardAccountId: uuid("card_account_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    closingBalance: numeric("closing_balance", {
      precision: 19,
      scale: 4,
    }).notNull(),
    minimumDue: numeric("minimum_due", { precision: 19, scale: 4 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    dueDate: date("due_date").notNull(),
    status: text().notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("credit_card_statements_user_id_unique").on(
      table.userId,
      table.id,
    ),
    uniqueIndex("credit_card_statements_user_card_period_unique").on(
      table.userId,
      table.cardAccountId,
      table.periodStart,
      table.periodEnd,
    ),
    index("credit_card_statements_user_card_period_idx").on(
      table.userId,
      table.cardAccountId,
      table.periodEnd,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.cardAccountId],
      foreignColumns: [creditCardProfiles.userId, creditCardProfiles.accountId],
      name: "credit_card_statements_card_fk",
    }),
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
    foreignKey({
      columns: [table.userId, table.categoryId],
      foreignColumns: [categories.userId, categories.id],
      name: "transactions_category_fk",
    }),
  ],
);

export const statementPayments = appPrivate.table(
  "statement_payments",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    statementId: uuid("statement_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    amount: numeric({ precision: 19, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("statement_payments_user_id_unique").on(table.userId, table.id),
    uniqueIndex("statement_payments_user_statement_transaction_unique").on(
      table.userId,
      table.statementId,
      table.transactionId,
    ),
    foreignKey({
      columns: [table.userId, table.statementId],
      foreignColumns: [creditCardStatements.userId, creditCardStatements.id],
      name: "statement_payments_statement_fk",
    }),
    foreignKey({
      columns: [table.userId, table.transactionId],
      foreignColumns: [transactions.userId, transactions.id],
      name: "statement_payments_transaction_fk",
    }),
  ],
);

export const installmentPlans = appPrivate.table(
  "installment_plans",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    purchaseTransactionId: uuid("purchase_transaction_id").notNull(),
    cardAccountId: uuid("card_account_id").notNull(),
    purchaseTotal: numeric("purchase_total", {
      precision: 19,
      scale: 4,
    }).notNull(),
    installmentCount: smallint("installment_count").notNull(),
    recognitionPolicy: text("recognition_policy")
      .notNull()
      .default("full_at_purchase"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("installment_plans_user_id_unique").on(table.userId, table.id),
    uniqueIndex("installment_plans_user_purchase_unique").on(
      table.userId,
      table.purchaseTransactionId,
    ),
    foreignKey({
      columns: [table.userId, table.purchaseTransactionId],
      foreignColumns: [transactions.userId, transactions.id],
      name: "installment_plans_purchase_transaction_fk",
    }),
    foreignKey({
      columns: [table.userId, table.cardAccountId],
      foreignColumns: [creditCardProfiles.userId, creditCardProfiles.accountId],
      name: "installment_plans_card_fk",
    }),
  ],
);

export const installmentItems = appPrivate.table(
  "installment_items",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    planId: uuid("plan_id").notNull(),
    sequence: smallint().notNull(),
    dueDate: date("due_date").notNull(),
    cashFlowAmount: numeric("cash_flow_amount", {
      precision: 19,
      scale: 4,
    }).notNull(),
    statementId: uuid("statement_id"),
    status: text().notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("installment_items_user_id_unique").on(table.userId, table.id),
    uniqueIndex("installment_items_user_plan_sequence_unique").on(
      table.userId,
      table.planId,
      table.sequence,
    ),
    index("installment_items_user_due_status_idx").on(
      table.userId,
      table.status,
      table.dueDate,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.planId],
      foreignColumns: [installmentPlans.userId, installmentPlans.id],
      name: "installment_items_plan_fk",
    }),
    foreignKey({
      columns: [table.userId, table.statementId],
      foreignColumns: [creditCardStatements.userId, creditCardStatements.id],
      name: "installment_items_statement_fk",
    }),
  ],
);

export const subscriptions = appPrivate.table(
  "subscriptions",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text().notNull(),
    billingDay: smallint("billing_day").notNull(),
    paymentAccountId: uuid("payment_account_id").notNull(),
    expectedGross: numeric("expected_gross", {
      precision: 19,
      scale: 4,
    }).notNull(),
    cashbackRate: numeric("cashback_rate", {
      precision: 9,
      scale: 8,
    }).notNull(),
    cashbackCap: numeric("cashback_cap", {
      precision: 19,
      scale: 4,
    }).notNull(),
    active: boolean().notNull().default(true),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscriptions_user_id_unique").on(table.userId, table.id),
    index("subscriptions_user_active_billing_idx").on(
      table.userId,
      table.active,
      table.billingDay,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.paymentAccountId],
      foreignColumns: [financialAccounts.userId, financialAccounts.id],
      name: "subscriptions_payment_account_fk",
    }),
  ],
);

export const subscriptionCycles = appPrivate.table(
  "subscription_cycles",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    period: date().notNull(),
    chargeTransactionId: uuid("charge_transaction_id"),
    cashbackTotal: numeric("cashback_total", {
      precision: 19,
      scale: 4,
    })
      .notNull()
      .default("0"),
    actualNet: numeric("actual_net", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_cycles_user_id_unique").on(
      table.userId,
      table.id,
    ),
    uniqueIndex("subscription_cycles_user_subscription_period_unique").on(
      table.userId,
      table.subscriptionId,
      table.period,
    ),
    index("subscription_cycles_user_period_idx").on(
      table.userId,
      table.period,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.subscriptionId],
      foreignColumns: [subscriptions.userId, subscriptions.id],
      name: "subscription_cycles_subscription_fk",
    }),
    foreignKey({
      columns: [table.userId, table.chargeTransactionId],
      foreignColumns: [transactions.userId, transactions.id],
      name: "subscription_cycles_charge_transaction_fk",
    }),
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
    foreignKey({
      columns: [table.userId, table.financialAccountId, table.ledgerAccountId],
      foreignColumns: [
        financialAccounts.userId,
        financialAccounts.id,
        financialAccounts.ledgerAccountId,
      ],
      name: "ledger_postings_financial_account_fk",
    }),
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

/** B044-B048 mirror only; reviewed Supabase SQL migrations remain authoritative. */
export const counterparties = appPrivate.table(
  "counterparties",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    type: text().notNull(),
    nameEnc: bytea("name_enc").notNull(),
    nameSearchHash: bytea("name_search_hash").notNull(),
    nameKeyId: text("name_key_id").notNull(),
    nameAlgorithm: text("name_algorithm").notNull(),
    nameEncVersion: smallint("name_enc_version").notNull(),
    nameNonce: bytea("name_nonce").notNull(),
    nameAuthTag: bytea("name_auth_tag").notNull(),
    nameAadVersion: smallint("name_aad_version").notNull(),
    contactNoteEnc: bytea("contact_note_enc"),
    active: boolean().notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("counterparties_user_id_unique").on(table.userId, table.id),
    index("counterparties_user_type_active_idx").on(
      table.userId,
      table.type,
      table.active,
      table.id,
    ),
  ],
);

export const obligations = appPrivate.table(
  "obligations",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    personId: uuid("person_id").notNull(),
    direction: text().notNull(),
    originType: text("origin_type").notNull(),
    currency: char({ length: 3 }).notNull(),
    nominalAmount: numeric("nominal_amount", {
      precision: 19,
      scale: 4,
    }).notNull(),
    collectedAmount: numeric("collected_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    collectabilityStatus: text("collectability_status").notNull(),
    estimatedCollectibleAmount: numeric("estimated_collectible_amount", {
      precision: 19,
      scale: 4,
    }).notNull(),
    includeInNetWorth: boolean("include_in_net_worth").notNull(),
    includeInPlanning: boolean("include_in_planning").notNull(),
    rowVersion: integer("row_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("obligations_user_id_unique").on(table.userId, table.id),
    index("obligations_user_receivable_idx").on(
      table.userId,
      table.direction,
      table.collectabilityStatus,
      table.personId,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.personId],
      foreignColumns: [counterparties.userId, counterparties.id],
      name: "obligations_person_fk",
    }),
  ],
);

export const sharedExpenses = appPrivate.table(
  "shared_expenses",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    paymentTransactionId: uuid("payment_transaction_id").notNull(),
    totalPaid: numeric("total_paid", { precision: 19, scale: 4 }).notNull(),
    ownerShare: numeric("owner_share", { precision: 19, scale: 4 }).notNull(),
    roundingAmount: numeric("rounding_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    currency: char({ length: 3 }).notNull(),
    sharingStatus: text("sharing_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("shared_expenses_user_id_unique").on(table.userId, table.id),
    uniqueIndex("shared_expenses_user_payment_unique").on(
      table.userId,
      table.paymentTransactionId,
    ),
    index("shared_expenses_user_status_idx").on(
      table.userId,
      table.sharingStatus,
      table.id,
    ),
  ],
);

export const sharedExpenseShares = appPrivate.table(
  "shared_expense_shares",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    sharedExpenseId: uuid("shared_expense_id").notNull(),
    personId: uuid("person_id").notNull(),
    shareAmount: numeric("share_amount", { precision: 19, scale: 4 }).notNull(),
    receivableId: uuid("receivable_id").notNull(),
    settledAmount: numeric("settled_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("shared_expense_shares_user_id_unique").on(
      table.userId,
      table.id,
    ),
    uniqueIndex("shared_expense_shares_user_person_unique").on(
      table.userId,
      table.sharedExpenseId,
      table.personId,
    ),
    uniqueIndex("shared_expense_shares_user_receivable_unique").on(
      table.userId,
      table.receivableId,
    ),
    foreignKey({
      columns: [table.userId, table.sharedExpenseId],
      foreignColumns: [sharedExpenses.userId, sharedExpenses.id],
      name: "shared_expense_shares_expense_fk",
    }),
    foreignKey({
      columns: [table.userId, table.personId],
      foreignColumns: [counterparties.userId, counterparties.id],
      name: "shared_expense_shares_person_fk",
    }),
    foreignKey({
      columns: [table.userId, table.receivableId],
      foreignColumns: [obligations.userId, obligations.id],
      name: "shared_expense_shares_receivable_fk",
    }),
  ],
);

export const settlements = appPrivate.table(
  "settlements",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    obligationId: uuid("obligation_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    amount: numeric({ precision: 19, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("settlements_user_id_unique").on(table.userId, table.id),
    uniqueIndex("settlements_user_transaction_unique").on(
      table.userId,
      table.transactionId,
    ),
    index("settlements_user_obligation_idx").on(
      table.userId,
      table.obligationId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.obligationId],
      foreignColumns: [obligations.userId, obligations.id],
      name: "settlements_obligation_fk",
    }),
  ],
);

export const balanceSnapshots = appPrivate.table(
  "balance_snapshots",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    statedBalance: numeric("stated_balance", {
      precision: 19,
      scale: 4,
    }).notNull(),
    calculatedBalance: numeric("calculated_balance", {
      precision: 19,
      scale: 4,
    }).notNull(),
    difference: numeric({ precision: 19, scale: 4 }).generatedAlwaysAs(
      sql`${sql.identifier("stated_balance")} - ${sql.identifier("calculated_balance")}`,
    ),
    status: text().notNull().default("open"),
    noteEnc: bytea("note_enc"),
    noteKeyId: text("note_key_id"),
    noteAlgorithm: text("note_algorithm"),
    noteEncVersion: smallint("note_enc_version"),
    noteNonce: bytea("note_nonce"),
    noteAuthTag: bytea("note_auth_tag"),
    noteAadVersion: smallint("note_aad_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("balance_snapshots_user_id_unique").on(table.userId, table.id),
    uniqueIndex("balance_snapshots_user_account_observed_unique").on(
      table.userId,
      table.accountId,
      table.observedAt,
    ),
    index("balance_snapshots_user_account_observed_idx").on(
      table.userId,
      table.accountId,
      table.observedAt,
      table.id,
    ),
    index("balance_snapshots_user_status_idx").on(
      table.userId,
      table.status,
      table.observedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.accountId],
      foreignColumns: [financialAccounts.userId, financialAccounts.id],
      name: "balance_snapshots_account_fk",
    }),
  ],
);

export const reconciliationSessions = appPrivate.table(
  "reconciliation_sessions",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id").notNull(),
    period: dateRange().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text().notNull().default("open"),
    unresolvedCount: integer("unresolved_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reconciliation_sessions_user_id_unique").on(
      table.userId,
      table.id,
    ),
    index("reconciliation_sessions_user_status_idx").on(
      table.userId,
      table.status,
      table.startedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.userId, table.accountId],
      foreignColumns: [financialAccounts.userId, financialAccounts.id],
      name: "reconciliation_sessions_account_fk",
    }),
  ],
);

export const reconciliationItems = appPrivate.table(
  "reconciliation_items",
  {
    id: uuid().primaryKey(),
    userId: uuid("user_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    resolutionType: text("resolution_type"),
    transactionId: uuid("transaction_id"),
    reasonEnc: bytea("reason_enc"),
    reasonKeyId: text("reason_key_id"),
    reasonAlgorithm: text("reason_algorithm"),
    reasonEncVersion: smallint("reason_enc_version"),
    reasonNonce: bytea("reason_nonce"),
    reasonAuthTag: bytea("reason_auth_tag"),
    reasonAadVersion: smallint("reason_aad_version"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reconciliation_items_user_id_unique").on(
      table.userId,
      table.id,
    ),
    uniqueIndex("reconciliation_items_user_session_snapshot_unique").on(
      table.userId,
      table.sessionId,
      table.snapshotId,
    ),
    index("reconciliation_items_user_session_idx").on(
      table.userId,
      table.sessionId,
      table.resolvedAt,
      table.id,
    ),
    index("reconciliation_items_user_transaction_idx").on(
      table.userId,
      table.transactionId,
    ),
    foreignKey({
      columns: [table.userId, table.sessionId],
      foreignColumns: [
        reconciliationSessions.userId,
        reconciliationSessions.id,
      ],
      name: "reconciliation_items_session_fk",
    }),
    foreignKey({
      columns: [table.userId, table.snapshotId],
      foreignColumns: [balanceSnapshots.userId, balanceSnapshots.id],
      name: "reconciliation_items_snapshot_fk",
    }),
    foreignKey({
      columns: [table.userId, table.transactionId],
      foreignColumns: [transactions.userId, transactions.id],
      name: "reconciliation_items_transaction_fk",
    }),
  ],
);
