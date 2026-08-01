import { randomBytes, randomUUID } from "node:crypto";
import {
  commitLedgerTransaction,
  createCategory,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  createSubscription,
  getFinancialAccount,
  getSubscriptionCycleContext,
  listSubscriptions,
  listTransactions,
  provisionSystemLedgerAccounts,
  SubscriptionCycleStateError,
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
  activeKeyId: "local-subscription-key-v1",
  keys: new Map([["local-subscription-key-v1", randomBytes(32)]]),
};
const common = {
  currency: "TRY",
  occurredAt: "2026-08-01T12:00:00+03:00",
  economicDate: "2026-08-01",
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
      (${userA}::uuid, ${`p0-a2-sub-${userA}@example.test`}, 'authenticated', 'authenticated', now(), now()),
      (${userB}::uuid, ${`p0-a2-sub-${userB}@example.test`}, 'authenticated', 'authenticated', now(), now())
  `;
  await provisionSystemLedgerAccounts(sql, userA);
  await provisionSystemLedgerAccounts(sql, userB);
  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Abonelik Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const category = await createCategory(sql, {
    userId: userA,
    name: "Sentetik Abonelik Gideri",
    categoryType: "expense",
  });
  const card = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik Abonelik Kartı",
    accountType: "credit_card",
    currency: "TRY",
    openingDate: "2026-08-01",
    requestId: randomUUID(),
  });

  const subscription = await createSubscription(sql, {
    userId: userA,
    name: "Sentetik Video Aboneliği",
    billingDay: 12,
    paymentAccountId: card.id,
    expectedGross: "1200.00",
    cashbackRate: "0.10",
    cashbackCap: "120.00",
    requestId: randomUUID(),
  });
  assert(
    subscription.expectedCashback === "120.0000" &&
      subscription.expectedNet === "1080.0000" &&
      subscription.cycles.length === 1 &&
      subscription.cycles[0]?.period === "2026-08-01" &&
      subscription.cycles[0]?.renewalDate === "2026-08-12",
    `B042 expected gross/cashback/net or renewal mismatch: ${JSON.stringify(subscription)}.`,
  );
  const cycleId = subscription.cycles[0]?.id;
  assert(cycleId, "B042 current cycle was not created.");
  await expectRejection(
    () => sql`
      insert into app_private.subscription_cycles (
        id, user_id, subscription_id, period
      ) values (
        ${randomUUID()}::uuid, ${userA}::uuid,
        ${subscription.id}::uuid, '2026-08-01'::date
      )
    `,
    "B042 duplicate monthly cycle",
    (error) => String(error?.code) === "23505",
  );
  assert(
    (await listSubscriptions(sql, userB)).length === 0,
    "B042 cross-user subscription list leaked.",
  );

  const chargeKey = randomUUID();
  const chargeInput = {
    userId: userA,
    idempotencyKey: chargeKey,
    requestId: randomUUID(),
    subscriptionCycleId: cycleId,
    command: {
      ...common,
      type: "expense",
      amount: "1200.00",
      sourceAccountId: card.id,
      sourceKind: "card",
      categoryId: category.id,
    },
  };
  const charge = await commitLedgerTransaction(sql, chargeInput);
  const replay = await commitLedgerTransaction(sql, chargeInput);
  assert(
    charge.effects.personalExpenseDelta === "1200.00" && replay.replayed,
    "B043 subscription charge or idempotent replay failed.",
  );
  await expectRejection(
    () =>
      commitLedgerTransaction(sql, {
        ...chargeInput,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
      }),
    "B043 duplicate cycle charge",
    (error) => error instanceof SubscriptionCycleStateError,
  );

  const chargedCycle = await getSubscriptionCycleContext(sql, userA, cycleId);
  assert(
    chargedCycle.chargeTransactionId === charge.transactionId &&
      chargedCycle.actualNet === "1200.0000",
    "B043 cycle did not bind its charge transaction.",
  );
  const cashback = await commitLedgerTransaction(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    subscriptionCycleId: cycleId,
    command: {
      ...common,
      type: "cashback_refund",
      amount: "120.00",
      targetAccountId: card.id,
      targetKind: "card",
      relatedTransactionId: charge.transactionId,
      relatedExpenseRemaining: chargedCycle.actualNet,
      subscriptionId: subscription.id,
    },
  });
  assert(
    cashback.effects.personalExpenseDelta === "-120.00" &&
      cashback.effects.normalIncomeDelta === "0.00",
    "UAT05 cashback was not an expense offset with zero normal income.",
  );
  const after = (await listSubscriptions(sql, userA))[0];
  const cardAfter = await getFinancialAccount(sql, keyring, userA, card.id);
  assert(
    after?.cycles[0]?.chargeTotal === "1200.0000" &&
      after.cycles[0]?.cashbackTotal === "120.0000" &&
      after.cycles[0]?.actualNet === "1080.0000" &&
      cardAfter?.balance.calculatedOriginal === "1080.0000",
    "UAT05 gross minus cashback did not equal actual net and card liability.",
  );
  const links = await sql`
    select count(*)::text as count
      from app_private.transaction_links
     where user_id = ${userA}::uuid
       and from_transaction_id = ${cashback.transactionId}::uuid
       and to_transaction_id = ${charge.transactionId}::uuid
       and link_type = 'cashback_for'
       and allocated_amount = 120.0000
  `;
  assert(links[0]?.count === "1", "UAT05 cashback_for link is missing.");
  await expectRejection(
    () =>
      commitLedgerTransaction(sql, {
        userId: userA,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
        subscriptionCycleId: cycleId,
        command: {
          ...common,
          type: "cashback_refund",
          amount: "0.01",
          targetAccountId: card.id,
          targetKind: "card",
          relatedTransactionId: charge.transactionId,
          relatedExpenseRemaining: "1080.00",
          subscriptionId: subscription.id,
        },
      }),
    "B043 cashback cap",
    (error) => error instanceof SubscriptionCycleStateError,
  );

  const history = await listTransactions(sql, {
    userId: userA,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    limit: 10,
  });
  assert(
    history.items.length === 2 &&
      history.aggregate.personalExpense === "1080.0000" &&
      history.aggregate.normalIncome === "0.0000",
    "UAT05 two history rows or net expense aggregate failed.",
  );
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userB}, true)`;
    await tx`set local role pfos_runtime`;
    const rows = await tx`
      select count(*)::text as count
        from app_private.subscription_cycles
       where id = ${cycleId}::uuid
    `;
    assert(rows[0]?.count === "0", "B042 cycle forced RLS leaked user A.");
  });

  const versionRows = await sql`
    select current_setting('server_version') as version
  `;
  console.log(`PostgreSQL server version: ${versionRows[0]?.version}`);
  console.log("P0-A2 B042 subscription cycle/renewal/expected net/RLS: PASS");
  console.log("P0-A2 B043 charge idempotency/cap/deferred net: PASS");
  console.log("P0-A2 UAT05 two linked transactions, income 0, net 1080: PASS");
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
  }
}
