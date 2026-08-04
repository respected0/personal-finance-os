import { randomBytes, randomUUID } from "node:crypto";
import {
  commitInvestmentBuy,
  commitInvestmentSell,
  createFinancialAccount,
  createInstitution,
  createLedgerSql,
  createMarketPrice,
  getPortfolio,
  LedgerReferenceError,
  listLatestMarketPrices,
  previewInvestmentTrade,
  provisionSystemLedgerAccounts,
} from "../../dist/index.js";
import {
  runSupabase,
  startLocalStack,
} from "../../../../scripts/db/common.mjs";

const sql = createLedgerSql(
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 4 },
);
const userA = randomUUID();
const userB = randomUUID();
const keyring = {
  activeKeyId: "local-investment-key-v1",
  keys: new Map([["local-investment-key-v1", randomBytes(32)]]),
};
let stackStarted = false;
function assert(value, message) {
  if (!value) throw new Error(message);
}
try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalStack();
  stackStarted = true;
  runSupabase(["db", "reset", "--local"], { capture: true });
  await sql`insert into auth.users (id,email,aud,role,created_at,updated_at) values (${userA}::uuid,${`b073-${userA}@example.test`},'authenticated','authenticated',now(),now()),(${userB}::uuid,${`b073-${userB}@example.test`},'authenticated','authenticated',now(),now())`;
  await provisionSystemLedgerAccounts(sql, userA);
  const institution = await createInstitution(sql, {
    userId: userA,
    name: "Sentetik Yatırım Bankası",
    institutionType: "bank",
    requestId: randomUUID(),
  });
  const bank = await createFinancialAccount(sql, keyring, {
    userId: userA,
    institutionId: institution.id,
    name: "Sentetik Yatırım Nakit Hesabı",
    accountType: "bank",
    currency: "TRY",
    openingDate: "2026-08-04",
    requestId: randomUUID(),
  });
  const first = await createMarketPrice(sql, {
    userId: userA,
    instrument: {
      symbol: "XAU-TRY",
      name: "Sentetik banka altını",
      instrumentType: "bank_gold",
      unit: "gram",
      currency: "TRY",
    },
    price: "2875.1234567890",
    priceAt: "2026-08-04T09:00:00.000Z",
    sourceType: "reference_fixture",
    isEstimated: false,
  });
  await createMarketPrice(sql, {
    userId: userA,
    instrument: {
      symbol: first.instrument.symbol,
      name: "Sentetik banka altını güncel",
      instrumentType: first.instrument.instrumentType,
      unit: first.instrument.unit,
      currency: first.instrument.currency,
    },
    price: "2900.0000000001",
    priceAt: "2026-08-04T12:00:00.000Z",
    sourceType: "manual",
    isEstimated: true,
  });
  const latest = await listLatestMarketPrices(sql, userA);
  assert(
    latest.length === 1 &&
      latest[0]?.price === "2900.0000000001" &&
      latest[0]?.priceAt === "2026-08-04T12:00:00.000Z" &&
      latest[0]?.sourceType === "manual" &&
      latest[0]?.isEstimated,
    "B073 latest price/source/timestamp projection failed.",
  );
  assert(
    (await listLatestMarketPrices(sql, userB)).length === 0,
    "B073 market prices crossed RLS ownership.",
  );
  const counts =
    await sql`select (select count(*) from app_private.investment_instruments)::integer instruments,(select count(*) from app_private.market_prices)::integer prices`;
  assert(
    counts[0]?.instruments === 1 && counts[0]?.prices === 2,
    "B073 symbol upsert or append-only price history failed.",
  );
  const idempotencyKey = randomUUID();
  const buyCommand = {
    type: "investment_buy",
    currency: "TRY",
    occurredAt: "2026-08-04T13:00:00.000Z",
    economicDate: "2026-08-04",
    cashAccountId: bank.id,
    instrumentId: first.instrument.id,
    quantity: "1.3100000000",
    unitPrice: "2875.1234567890",
    feeAmount: "7.5000",
  };
  const bought = await commitInvestmentBuy(sql, {
    userId: userA,
    idempotencyKey,
    requestId: randomUUID(),
    command: buyCommand,
  });
  assert(
    bought.trade.costBasisIncludingFee === "3773.9117" &&
      bought.trade.feeAmount === "7.5000" &&
      bought.lot.quantityOpen === "1.3100000000" &&
      bought.lot.unitCost === "2880.8486259542",
    "B074/B075 fee-inclusive exact lot cost was not preserved.",
  );
  assert(
    bought.effects.personalExpenseDelta === "0.00" &&
      bought.effects.normalIncomeDelta === "0.00" &&
      bought.effects.netWorthDelta === "0.00" &&
      bought.postings.length === 2 &&
      bought.postings[0]?.ledgerRole === "investment_asset" &&
      bought.postings[1]?.ledgerRole === "bank_asset",
    "B074 investment buy changed consumption expense/income/net worth or ledger roles.",
  );
  const replayed = await commitInvestmentBuy(sql, {
    userId: userA,
    idempotencyKey,
    requestId: randomUUID(),
    command: buyCommand,
  });
  assert(
    replayed.replayed &&
      replayed.transactionId === bought.transactionId &&
      replayed.trade.id === bought.trade.id &&
      replayed.lot.id === bought.lot.id,
    "B074 investment idempotency replay created a different aggregate.",
  );
  const sellCommand = {
    type: "investment_sell",
    currency: "TRY",
    occurredAt: "2026-08-04T14:00:00.000Z",
    economicDate: "2026-08-04",
    cashAccountId: bank.id,
    instrumentId: first.instrument.id,
    quantity: "0.3100000000",
    unitPrice: "3000.0000000000",
    feeAmount: "3.0000",
  };
  const sellPreview = await previewInvestmentTrade(sql, userA, sellCommand);
  assert(
    sellPreview.primaryAmount === "927.00" &&
      sellPreview.postings.length === 3 &&
      sellPreview.postings[0]?.amountOriginal === "927.00" &&
      sellPreview.postings[1]?.amountOriginal === "893.0631" &&
      sellPreview.postings[2]?.ledgerRole === "realized_gain" &&
      sellPreview.postings[2]?.amountOriginal === "33.9369" &&
      sellPreview.effects.normalIncomeDelta === "0.00" &&
      sellPreview.effects.personalExpenseDelta === "0.00",
    "B076 sell preview did not separate proceeds, fee-inclusive cost and realized gain.",
  );
  const sellKey = randomUUID();
  const sold = await commitInvestmentSell(sql, {
    userId: userA,
    idempotencyKey: sellKey,
    requestId: randomUUID(),
    command: sellCommand,
    previewHash: sellPreview.previewHash,
  });
  assert(
    sold.sellTrade.side === "sell" &&
      sold.sellTrade.costBasisIncludingFee === "893.0631" &&
      sold.consumptions.length === 1 &&
      sold.consumptions[0]?.quantity === "0.3100000000" &&
      sold.lot.quantityOpen === "1.0000000000",
    "B076 FIFO lot consumption or remaining quantity was incorrect.",
  );
  const sellReplay = await commitInvestmentSell(sql, {
    userId: userA,
    idempotencyKey: sellKey,
    requestId: randomUUID(),
    command: sellCommand,
    previewHash: sellPreview.previewHash,
  });
  assert(
    sellReplay.replayed &&
      sellReplay.transactionId === sold.transactionId &&
      sellReplay.sellTrade.id === sold.sellTrade.id &&
      sellReplay.lot.quantityOpen === "1.0000000000",
    "B076 sell replay depended on the post-sale lot balance or duplicated state.",
  );
  const capCounts = await sql`
    select (select count(*) from app_private.transactions)::integer transactions,
      (select count(*) from app_private.investment_trades)::integer trades,
      (select count(*) from app_private.investment_lot_consumptions)::integer consumptions
  `;
  try {
    await previewInvestmentTrade(sql, userA, {
      ...sellCommand,
      quantity: "1.0000000001",
    });
    throw new Error("Lot quantity cap unexpectedly allowed an oversell.");
  } catch (error) {
    assert(
      error?.code === "lot_quantity_exceeded",
      `B076 quantity cap returned unexpected error: ${error?.message}`,
    );
  }
  const capCountsAfter = await sql`
    select (select count(*) from app_private.transactions)::integer transactions,
      (select count(*) from app_private.investment_trades)::integer trades,
      (select count(*) from app_private.investment_lot_consumptions)::integer consumptions
  `;
  assert(
    JSON.stringify(capCounts[0]) === JSON.stringify(capCountsAfter[0]),
    "B076 oversell left partial ledger, trade or consumption state.",
  );
  const missingInstrumentId = randomUUID();
  await sql`
    insert into app_private.investment_instruments (
      id,user_id,symbol,name,instrument_type,unit,currency
    ) values (
      ${missingInstrumentId}::uuid,${userA}::uuid,'NOPRICE',
      'Sentetik fiyatsız fon','fund','unit','TRY'
    )
  `;
  await commitInvestmentBuy(sql, {
    userId: userA,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
    command: {
      ...buyCommand,
      instrumentId: missingInstrumentId,
      quantity: "1.0000000000",
      unitPrice: "100.0000000000",
      feeAmount: "0.0000",
    },
  });
  const portfolio = await getPortfolio(sql, {
    userId: userA,
    asOf: "2026-08-04T23:59:59.999Z",
  });
  const gold = portfolio.find(
    ({ instrument }) => instrument.id === first.instrument.id,
  );
  const missing = portfolio.find(
    ({ instrument }) => instrument.id === missingInstrumentId,
  );
  assert(
    gold?.quantity === "1.0000000000" &&
      gold.costBasis === "2880.8486" &&
      gold.averageUnitCost === "2880.8486259542" &&
      gold.price === "2900.0000000001" &&
      gold.marketValue === "2900.0000" &&
      gold.unrealizedProfitLoss === "19.1514" &&
      gold.priceAt === "2026-08-04T12:00:00.000Z" &&
      gold.sourceType === "manual" &&
      gold.isEstimated,
    "B077 portfolio quantity/cost/value/P&L or visible price evidence was wrong.",
  );
  assert(
    missing?.price === null &&
      missing.marketValue === null &&
      missing.unrealizedProfitLoss === null &&
      missing.valuationStatus === "missing_price" &&
      missing.isEstimated,
    "B077 missing-price position was not explicitly estimated/unvalued.",
  );
  assert(
    (await getPortfolio(sql, { userId: userB, asOf: "2026-08-05T00:00:00Z" }))
      .length === 0,
    "B077 portfolio crossed user ownership.",
  );
  const beforeRejected = await sql`
    select (select count(*) from app_private.transactions)::integer transactions,
      (select count(*) from app_private.investment_trades)::integer trades,
      (select count(*) from app_private.investment_lots)::integer lots
  `;
  try {
    await commitInvestmentBuy(sql, {
      userId: userA,
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
      command: { ...buyCommand, instrumentId: randomUUID() },
    });
    throw new Error(
      "Cross-owner/missing instrument buy unexpectedly succeeded.",
    );
  } catch (error) {
    assert(
      error instanceof LedgerReferenceError,
      `B074 invalid instrument returned unexpected error: ${error?.message}`,
    );
  }
  const afterRejected = await sql`
    select (select count(*) from app_private.transactions)::integer transactions,
      (select count(*) from app_private.investment_trades)::integer trades,
      (select count(*) from app_private.investment_lots)::integer lots
  `;
  assert(
    JSON.stringify(beforeRejected[0]) === JSON.stringify(afterRejected[0]),
    "B074 invalid buy left partial transaction, trade or lot state.",
  );
  console.log("P0-B2 B073 instrument/manual price PostgreSQL acceptance: PASS");
  console.log(
    "B073 exact numeric(28,10), timestamp/source, latest projection, RLS: PASS",
  );
  console.log(
    "P0-B2 B074/B075 atomic buy, ledger, expense=0, fee-cost lot, idempotency: PASS",
  );
  console.log(
    "P0-B2 B076 sell proceeds/cost/gain, quantity cap, replay and lot consumption: PASS",
  );
  console.log(
    "P0-B2 B077 as-of portfolio quantity/cost/value/P&L/missing-price evidence: PASS",
  );
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted)
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
}
