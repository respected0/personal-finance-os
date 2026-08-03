import { createHash, randomUUID } from "node:crypto";
import {
  hashCanonicalValue,
  previewTransaction,
  type TransactionPreview,
} from "@personal-finance-os/domain";
import type { AccountNameKeyring } from "./account-crypto.js";
import {
  decryptCounterpartyName,
  encryptCounterpartyName,
} from "./counterparty-crypto.js";
import {
  commitLedgerTransaction,
  type CommitTransactionResponse,
  type LedgerSql,
} from "./ledger-repository.js";
import {
  applyUserScope,
  withUserScope,
  type UserScopedSql,
} from "./user-scope.js";

export type CounterpartyType = "person" | "merchant" | "employer" | "provider";
export type CollectabilityStatus =
  "collectible" | "doubtful" | "waived" | "closed";

export interface CounterpartyRecord {
  readonly id: string;
  readonly type: CounterpartyType;
  readonly name: string;
  readonly active: boolean;
  readonly rowVersion: number;
}

export interface SharedExpenseShareRecord {
  readonly personId: string;
  readonly receivableId: string;
  readonly shareAmount: string;
  readonly settledAmount: string;
}

export interface SharedExpenseRecord {
  readonly id: string;
  readonly paymentTransactionId: string;
  readonly totalPaid: string;
  readonly ownerShare: string;
  readonly roundingAmount: string;
  readonly ownerCost: string;
  readonly currency: string;
  readonly sharingStatus: "pending" | "split" | "closed";
  readonly shares: readonly SharedExpenseShareRecord[];
}

export interface ReceivableRecord {
  readonly id: string;
  readonly personId: string;
  readonly personName: string;
  readonly nominalAmount: string;
  readonly collectedAmount: string;
  readonly outstandingAmount: string;
  readonly recognizedAmount: string;
  readonly collectabilityStatus: CollectabilityStatus;
  readonly includeInNetWorth: boolean;
  readonly includeInPlanning: boolean;
  readonly currency: string;
}

export class SharingNotFoundError extends Error {
  readonly code = "not_found";
  readonly status = 404;

  constructor() {
    super("The requested sharing or receivable resource was not found.");
    this.name = "SharingNotFoundError";
  }
}

async function appendSharingEvidence(
  tx: UserScopedSql,
  input: {
    readonly userId: string;
    readonly entityType: string;
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
  const afterJson = JSON.parse(JSON.stringify(input.after));
  await tx`
    insert into app_private.audit_events (
      id, user_id, entity_type, entity_id, action, before_json, after_json,
      actor_session_id, request_id, prev_hash, event_hash
    ) values (
      ${randomUUID()}::uuid, ${input.userId}::uuid, ${input.entityType},
      ${input.entityId}::uuid, ${input.action}, null, ${tx.json(afterJson)}, null,
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
      ${randomUUID()}::uuid, ${input.userId}::uuid, ${input.entityType},
      ${input.entityId}::uuid, ${`${input.entityType}.${input.action}`},
      1, 1, ${tx.json(afterJson)}
    )
  `;
}

export async function createCounterparty(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: {
    readonly userId: string;
    readonly type: CounterpartyType;
    readonly name: string;
    readonly requestId: string;
  },
): Promise<CounterpartyRecord> {
  const id = randomUUID();
  const envelope = encryptCounterpartyName(
    input.name,
    input.userId,
    id,
    keyring,
  );
  return sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const rows = await tx<
      {
        readonly id: string;
        readonly type: CounterpartyType;
        readonly active: boolean;
        readonly row_version: number;
      }[]
    >`
      insert into app_private.counterparties (
        id, user_id, type, name_enc, name_search_hash, name_key_id,
        name_algorithm, name_enc_version, name_nonce, name_auth_tag,
        name_aad_version
      ) values (
        ${id}::uuid, ${input.userId}::uuid, ${input.type},
        ${Buffer.from(envelope.ciphertext)}, ${Buffer.from(envelope.nameSearchHash)},
        ${envelope.keyId}, ${envelope.algorithm}, ${envelope.encryptionVersion},
        ${Buffer.from(envelope.nonce)}, ${Buffer.from(envelope.authTag)},
        ${envelope.aadVersion}
      )
      returning id::text, type, active, row_version
    `;
    await appendSharingEvidence(tx, {
      userId: input.userId,
      entityType: "counterparty",
      entityId: id,
      action: "created",
      requestId: input.requestId,
      after: { counterparty_id: id, type: input.type },
    });
    const row = rows[0];
    if (!row) throw new Error("Counterparty insert returned no row.");
    return {
      id: row.id,
      type: row.type,
      name: input.name.trim(),
      active: row.active,
      rowVersion: row.row_version,
    };
  });
}

export async function listCounterparties(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  userId: string,
  type: CounterpartyType | undefined = undefined,
): Promise<readonly CounterpartyRecord[]> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) =>
      tx<
        {
          readonly id: string;
          readonly type: CounterpartyType;
          readonly name_enc: Uint8Array;
          readonly name_key_id: string;
          readonly name_algorithm: "AEAD_AES_256_GCM";
          readonly name_enc_version: 1;
          readonly name_nonce: Uint8Array;
          readonly name_auth_tag: Uint8Array;
          readonly name_aad_version: 1;
          readonly active: boolean;
          readonly row_version: number;
        }[]
      >`
        select id::text, type, name_enc, name_key_id, name_algorithm,
               name_enc_version, name_nonce, name_auth_tag, name_aad_version,
               active, row_version
          from app_private.counterparties
         where user_id = ${userId}::uuid
           and active
           and (${type ?? null}::text is null or type = ${type ?? null})
         order by id
      `,
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: decryptCounterpartyName(
      {
        ciphertext: row.name_enc,
        keyId: row.name_key_id,
        algorithm: row.name_algorithm,
        encryptionVersion: row.name_enc_version,
        nonce: row.name_nonce,
        authTag: row.name_auth_tag,
        aadVersion: row.name_aad_version,
      },
      userId,
      row.id,
      keyring,
    ),
    active: row.active,
    rowVersion: row.row_version,
  }));
}

export async function previewSharedExpense(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly command: Extract<
      Parameters<typeof previewTransaction>[0],
      { readonly type: "shared_expense" }
    >;
  },
): Promise<TransactionPreview> {
  await withUserScope(sql, input.userId, async (tx) => {
    const expectedAccountKind =
      input.command.paymentSourceKind === "card"
        ? "credit_card"
        : input.command.paymentSourceKind;
    const personIds = input.command.shares.map(({ personId }) => personId);
    if (new Set(personIds).size !== personIds.length) {
      throw new SharingNotFoundError();
    }
    const people = await tx`
      select id
        from app_private.counterparties
       where user_id = ${input.userId}::uuid
         and active
         and type = 'person'
         and id = any(${personIds}::uuid[])
    `;
    const accounts = await tx`
      select id
        from app_private.financial_accounts
       where user_id = ${input.userId}::uuid
         and id = ${input.command.paymentAccountId}::uuid
         and active
         and currency = ${input.command.currency}
         and account_type = ${expectedAccountKind}
    `;
    if (people.length !== personIds.length || !accounts[0]) {
      throw new SharingNotFoundError();
    }
  });
  return previewTransaction(input.command);
}

export async function createSharedExpense(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly requestPayload: unknown;
    readonly command: Extract<
      Parameters<typeof previewTransaction>[0],
      { readonly type: "shared_expense" }
    >;
  },
): Promise<{
  readonly transaction: CommitTransactionResponse;
  readonly sharedExpense: SharedExpenseRecord;
}> {
  const transaction = await commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    requestHash: hashCanonicalValue(input.requestPayload),
    sharedExpenseId: randomUUID(),
    command: input.command,
  });
  const sharedExpense = await getSharedExpenseByPaymentTransaction(
    sql,
    input.userId,
    transaction.transactionId,
  );
  return { transaction, sharedExpense };
}

export async function getSharedExpenseByPaymentTransaction(
  sql: LedgerSql,
  userId: string,
  paymentTransactionId: string,
): Promise<SharedExpenseRecord> {
  const result = await withUserScope(sql, userId, async (tx) => {
    const expenses = await tx<
      {
        readonly id: string;
        readonly payment_transaction_id: string;
        readonly total_paid: string;
        readonly owner_share: string;
        readonly rounding_amount: string;
        readonly owner_cost: string;
        readonly currency: string;
        readonly sharing_status: "pending" | "split" | "closed";
      }[]
    >`
      select id::text, payment_transaction_id::text, total_paid::text,
             owner_share::text, rounding_amount::text,
             (owner_share + rounding_amount)::numeric(19,4)::text as owner_cost,
             currency, sharing_status
        from app_private.shared_expenses
       where user_id = ${userId}::uuid
         and payment_transaction_id = ${paymentTransactionId}::uuid
    `;
    const expense = expenses[0];
    if (!expense) throw new SharingNotFoundError();
    const shares = await tx<
      {
        readonly person_id: string;
        readonly receivable_id: string;
        readonly share_amount: string;
        readonly settled_amount: string;
      }[]
    >`
      select person_id::text, receivable_id::text, share_amount::text, settled_amount::text
        from app_private.shared_expense_shares
       where user_id = ${userId}::uuid
         and shared_expense_id = ${expense.id}::uuid
       order by id
    `;
    return { expense, shares };
  });
  return {
    id: result.expense.id,
    paymentTransactionId: result.expense.payment_transaction_id,
    totalPaid: result.expense.total_paid,
    ownerShare: result.expense.owner_share,
    roundingAmount: result.expense.rounding_amount,
    ownerCost: result.expense.owner_cost,
    currency: result.expense.currency,
    sharingStatus: result.expense.sharing_status,
    shares: result.shares.map((share) => ({
      personId: share.person_id,
      receivableId: share.receivable_id,
      shareAmount: share.share_amount,
      settledAmount: share.settled_amount,
    })),
  };
}

export async function listReceivables(
  sql: LedgerSql,
  keyring: AccountNameKeyring,
  input: {
    readonly userId: string;
    readonly status?: CollectabilityStatus;
    readonly personId?: string;
  },
): Promise<readonly ReceivableRecord[]> {
  const rows = await withUserScope(
    sql,
    input.userId,
    (tx) =>
      tx<
        {
          readonly id: string;
          readonly person_id: string;
          readonly nominal_amount: string;
          readonly collected_amount: string;
          readonly outstanding_amount: string;
          readonly recognized_amount: string;
          readonly collectability_status: CollectabilityStatus;
          readonly include_in_net_worth: boolean;
          readonly include_in_planning: boolean;
          readonly currency: string;
          readonly name_enc: Uint8Array;
          readonly name_key_id: string;
          readonly name_algorithm: "AEAD_AES_256_GCM";
          readonly name_enc_version: 1;
          readonly name_nonce: Uint8Array;
          readonly name_auth_tag: Uint8Array;
          readonly name_aad_version: 1;
        }[]
      >`
        select obligation.id::text, obligation.person_id::text,
               obligation.nominal_amount::text, obligation.collected_amount::text,
               (obligation.nominal_amount - obligation.collected_amount)::numeric(19,4)::text as outstanding_amount,
               case when obligation.include_in_net_worth
                    then obligation.estimated_collectible_amount else 0 end::numeric(19,4)::text as recognized_amount,
               obligation.collectability_status, obligation.include_in_net_worth,
               obligation.include_in_planning, obligation.currency,
               person.name_enc, person.name_key_id, person.name_algorithm,
               person.name_enc_version, person.name_nonce, person.name_auth_tag,
               person.name_aad_version
          from app_private.obligations as obligation
          join app_private.counterparties as person
            on person.user_id = obligation.user_id
           and person.id = obligation.person_id
         where obligation.user_id = ${input.userId}::uuid
           and obligation.direction = 'receivable'
           and (${input.status ?? null}::text is null
             or obligation.collectability_status = ${input.status ?? null})
           and (${input.personId ?? null}::uuid is null
             or obligation.person_id = ${input.personId ?? null}::uuid)
         order by obligation.collectability_status, person.id, obligation.id
      `,
  );
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    personName: decryptCounterpartyName(
      {
        ciphertext: row.name_enc,
        keyId: row.name_key_id,
        algorithm: row.name_algorithm,
        encryptionVersion: row.name_enc_version,
        nonce: row.name_nonce,
        authTag: row.name_auth_tag,
        aadVersion: row.name_aad_version,
      },
      input.userId,
      row.person_id,
      keyring,
    ),
    nominalAmount: row.nominal_amount,
    collectedAmount: row.collected_amount,
    outstandingAmount: row.outstanding_amount,
    recognizedAmount: row.recognized_amount,
    collectabilityStatus: row.collectability_status,
    includeInNetWorth: row.include_in_net_worth,
    includeInPlanning: row.include_in_planning,
    currency: row.currency,
  }));
}

export async function settleReceivable(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly receivableId: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly requestPayload: unknown;
    readonly amount: string;
    readonly currency: string;
    readonly occurredAt: string;
    readonly economicDate: string;
    readonly targetAccountId: string;
    readonly targetKind: "bank" | "cash";
  },
): Promise<CommitTransactionResponse> {
  const receivable = await withUserScope(sql, input.userId, async (tx) => {
    const rows = await tx<
      {
        readonly id: string;
        readonly currency: string;
        readonly outstanding_amount: string;
      }[]
    >`
      select id::text, currency,
             (nominal_amount - collected_amount)::numeric(19,4)::text
               as outstanding_amount
        from app_private.obligations
       where user_id = ${input.userId}::uuid
         and id = ${input.receivableId}::uuid
         and direction = 'receivable'
    `;
    return rows[0];
  });
  if (!receivable || receivable.currency !== input.currency) {
    throw new SharingNotFoundError();
  }
  return commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    requestHash: hashCanonicalValue(input.requestPayload),
    settlementObligationId: input.receivableId,
    command: {
      type: "receivable_settlement",
      amount: input.amount,
      receivableId: input.receivableId,
      // The authoritative amount is locked and recomputed inside the SERIALIZABLE
      // transaction. Supplying at least the requested amount lets an idempotent
      // replay reach the idempotency store even after a full collection closed it.
      outstandingAmount:
        receivable.outstanding_amount === "0.0000"
          ? input.amount
          : receivable.outstanding_amount,
      targetAccountId: input.targetAccountId,
      targetKind: input.targetKind,
      currency: input.currency,
      occurredAt: input.occurredAt,
      economicDate: input.economicDate,
    },
  });
}

export async function createManualReceivable(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly personId: string;
    readonly currency: string;
    readonly nominalAmount: string;
    readonly estimatedCollectibleAmount: string;
    readonly collectabilityStatus: Exclude<CollectabilityStatus, "closed">;
    readonly includeInNetWorth: boolean;
    readonly includeInPlanning: boolean;
    readonly requestId: string;
  },
): Promise<string> {
  const id = randomUUID();
  await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const people = await tx`
      select id
        from app_private.counterparties
       where user_id = ${input.userId}::uuid
         and id = ${input.personId}::uuid
         and active
         and type = 'person'
       for share
    `;
    if (!people[0]) throw new SharingNotFoundError();
    await tx`
      insert into app_private.obligations (
        id, user_id, person_id, direction, origin_type, currency,
        nominal_amount, collectability_status, estimated_collectible_amount,
        include_in_net_worth, include_in_planning
      ) values (
        ${id}::uuid, ${input.userId}::uuid, ${input.personId}::uuid,
        'receivable', 'manual', ${input.currency}, ${input.nominalAmount}::numeric,
        ${input.collectabilityStatus}, ${input.estimatedCollectibleAmount}::numeric,
        ${input.includeInNetWorth}, ${input.includeInPlanning}
      )
    `;
    await appendSharingEvidence(tx, {
      userId: input.userId,
      entityType: "obligation",
      entityId: id,
      action: "created",
      requestId: input.requestId,
      after: {
        collectability_status: input.collectabilityStatus,
        obligation_id: id,
        policy_net_worth: input.includeInNetWorth,
        policy_planning: input.includeInPlanning,
      },
    });
  });
  return id;
}
