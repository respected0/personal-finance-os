import { randomUUID } from "node:crypto";
import type { InvestmentBuyCommand } from "@personal-finance-os/domain";
import {
  commitLedgerTransaction,
  LedgerReferenceError,
  type CommitTransactionResponse,
  type LedgerSql,
} from "./ledger-repository.js";
import { applyUserScope, withUserScope } from "./user-scope.js";

export interface MarketPrice {
  readonly id: string;
  readonly instrument: {
    readonly id: string;
    readonly symbol: string;
    readonly name: string;
    readonly instrumentType:
      "fund" | "stock" | "bond" | "bank_gold" | "crypto" | "other";
    readonly unit: "unit" | "gram";
    readonly currency: string;
    readonly active: boolean;
  };
  readonly price: string;
  readonly priceAt: string;
  readonly sourceType: "manual" | "reference_fixture";
  readonly isEstimated: boolean;
}
export interface MarketPriceCreate {
  readonly instrument: Omit<MarketPrice["instrument"], "id" | "active">;
  readonly price: string;
  readonly priceAt: string;
  readonly sourceType: MarketPrice["sourceType"];
  readonly isEstimated: boolean;
}

export interface InvestmentTradeRecord {
  readonly id: string;
  readonly transactionId: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly side: "buy" | "sell";
  readonly quantity: string;
  readonly unitPrice: string;
  readonly feeAmount: string;
  readonly costBasisIncludingFee: string;
}

export interface InvestmentLotRecord {
  readonly id: string;
  readonly instrumentId: string;
  readonly buyTradeId: string;
  readonly quantityOpen: string;
  readonly unitCost: string;
}

export interface InvestmentBuyCommitResponse extends CommitTransactionResponse {
  readonly trade: InvestmentTradeRecord;
  readonly lot: InvestmentLotRecord;
}

type PriceRow = {
  readonly id: string;
  readonly instrument_id: string;
  readonly symbol: string;
  readonly name: string;
  readonly instrument_type: MarketPrice["instrument"]["instrumentType"];
  readonly unit: MarketPrice["instrument"]["unit"];
  readonly currency: string;
  readonly active: boolean;
  readonly price: string;
  readonly price_at: string;
  readonly source_type: MarketPrice["sourceType"];
  readonly is_estimated: boolean;
};

function fromRow(row: PriceRow): MarketPrice {
  return {
    id: row.id,
    instrument: {
      id: row.instrument_id,
      symbol: row.symbol,
      name: row.name,
      instrumentType: row.instrument_type,
      unit: row.unit,
      currency: row.currency,
      active: row.active,
    },
    price: row.price,
    priceAt: new Date(row.price_at).toISOString(),
    sourceType: row.source_type,
    isEstimated: row.is_estimated,
  };
}

export async function createMarketPrice(
  sql: LedgerSql,
  input: MarketPriceCreate & { readonly userId: string },
): Promise<MarketPrice> {
  const priceId = randomUUID();
  const rows = await sql.begin("isolation level serializable", async (tx) => {
    await applyUserScope(tx, input.userId);
    const instruments = await tx<{ readonly id: string }[]>`
      insert into app_private.investment_instruments (id,user_id,symbol,name,instrument_type,unit,currency)
      values (${randomUUID()}::uuid,${input.userId}::uuid,${input.instrument.symbol},${input.instrument.name},${input.instrument.instrumentType},${input.instrument.unit},${input.instrument.currency})
      on conflict (user_id,symbol) do update set name=excluded.name,
        instrument_type=excluded.instrument_type, unit=excluded.unit,
        currency=excluded.currency, updated_at=now()
      returning id::text
    `;
    const instrumentId = instruments[0]?.id;
    if (!instrumentId) throw new Error("Instrument upsert returned no row.");
    return tx<PriceRow[]>`
      with inserted as (
        insert into app_private.market_prices (id,user_id,instrument_id,price_at,price,source_type,is_estimated)
        values (${priceId}::uuid,${input.userId}::uuid,${instrumentId}::uuid,${input.priceAt}::timestamptz,${input.price}::numeric,${input.sourceType},${input.isEstimated})
        returning *
      )
      select price.id::text, instrument.id::text instrument_id, instrument.symbol,
        instrument.name, instrument.instrument_type, instrument.unit, instrument.currency,
        instrument.active, price.price::text, price.price_at::text, price.source_type, price.is_estimated
      from inserted price join app_private.investment_instruments instrument
        on instrument.user_id=price.user_id and instrument.id=price.instrument_id
    `;
  });
  if (!rows[0]) throw new Error("Market price insert returned no row.");
  return fromRow(rows[0]);
}

export async function listLatestMarketPrices(
  sql: LedgerSql,
  userId: string,
): Promise<readonly MarketPrice[]> {
  const rows = await withUserScope(
    sql,
    userId,
    (tx) => tx<PriceRow[]>`
    select distinct on (instrument.id) price.id::text, instrument.id::text instrument_id,
      instrument.symbol, instrument.name, instrument.instrument_type, instrument.unit,
      instrument.currency, instrument.active, price.price::text, price.price_at::text,
      price.source_type, price.is_estimated
    from app_private.investment_instruments instrument
    join app_private.market_prices price on price.user_id=instrument.user_id and price.instrument_id=instrument.id
    where instrument.user_id=${userId}::uuid and instrument.active
    order by instrument.id, price.price_at desc, price.id desc
  `,
  );
  return rows.map(fromRow);
}

export async function commitInvestmentBuy(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly actorSessionId?: string;
    readonly command: InvestmentBuyCommand;
    readonly previewHash?: string;
  },
): Promise<InvestmentBuyCommitResponse> {
  const tradeId = randomUUID();
  const lotId = randomUUID();
  const committed = await commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    ...(input.actorSessionId ? { actorSessionId: input.actorSessionId } : {}),
    command: input.command,
    ...(input.previewHash ? { previewHash: input.previewHash } : {}),
    beforeFinalize: async ({ tx, transactionId, preview }) => {
      const instruments = await tx`
        select id
          from app_private.investment_instruments
         where user_id = ${input.userId}::uuid
           and id = ${input.command.instrumentId}::uuid
           and active
         for share
      `;
      if (!instruments[0]) throw new LedgerReferenceError();
      await tx`
        insert into app_private.investment_trades (
          id, user_id, transaction_id, account_id, instrument_id, side,
          quantity, unit_price, fee_amount, cost_basis_including_fee
        ) values (
          ${tradeId}::uuid, ${input.userId}::uuid, ${transactionId}::uuid,
          ${input.command.cashAccountId}::uuid, ${input.command.instrumentId}::uuid,
          'buy', ${input.command.quantity}::numeric, ${input.command.unitPrice}::numeric,
          ${input.command.feeAmount}::numeric, ${preview.primaryAmount}::numeric
        )
      `;
      await tx`
        insert into app_private.investment_lots (
          id, user_id, instrument_id, buy_trade_id, quantity_open, unit_cost
        ) values (
          ${lotId}::uuid, ${input.userId}::uuid, ${input.command.instrumentId}::uuid,
          ${tradeId}::uuid, ${input.command.quantity}::numeric,
          round(${preview.primaryAmount}::numeric / ${input.command.quantity}::numeric, 10)
        )
      `;
    },
  });

  const records = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<
      {
        readonly trade_id: string;
        readonly transaction_id: string;
        readonly account_id: string;
        readonly instrument_id: string;
        readonly side: "buy" | "sell";
        readonly quantity: string;
        readonly unit_price: string;
        readonly fee_amount: string;
        readonly cost_basis_including_fee: string;
        readonly lot_id: string;
        readonly quantity_open: string;
        readonly unit_cost: string;
      }[]
    >`
    select trade.id::text trade_id, trade.transaction_id::text,
      trade.account_id::text, trade.instrument_id::text, trade.side,
      trade.quantity::text, trade.unit_price::text, trade.fee_amount::text,
      trade.cost_basis_including_fee::text, lot.id::text lot_id,
      lot.quantity_open::text, lot.unit_cost::text
    from app_private.investment_trades trade
    join app_private.investment_lots lot
      on lot.user_id=trade.user_id and lot.buy_trade_id=trade.id
    where trade.user_id=${input.userId}::uuid
      and trade.transaction_id=${committed.transactionId}::uuid
  `,
  );
  const record = records[0];
  if (!record) throw new Error("Committed investment buy has no trade lot.");
  return {
    ...committed,
    trade: {
      id: record.trade_id,
      transactionId: record.transaction_id,
      accountId: record.account_id,
      instrumentId: record.instrument_id,
      side: record.side,
      quantity: record.quantity,
      unitPrice: record.unit_price,
      feeAmount: record.fee_amount,
      costBasisIncludingFee: record.cost_basis_including_fee,
    },
    lot: {
      id: record.lot_id,
      instrumentId: record.instrument_id,
      buyTradeId: record.trade_id,
      quantityOpen: record.quantity_open,
      unitCost: record.unit_cost,
    },
  };
}
