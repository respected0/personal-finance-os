import { randomUUID } from "node:crypto";
import {
  hashCanonicalValue,
  previewTransaction,
  type InvestmentBuyCommand,
  type InvestmentSellCommand,
} from "@personal-finance-os/domain";
import type postgres from "postgres";
import {
  commitLedgerTransaction,
  IdempotencyConflictError,
  LedgerReferenceError,
  SerializationRetryExhaustedError,
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
  readonly trade: InvestmentTradeRecord & { readonly side: "buy" };
  readonly lot: InvestmentLotRecord;
}

export type InvestmentSellInput = Omit<
  InvestmentSellCommand,
  "availableQuantity" | "costBasis"
>;

export interface InvestmentLotConsumptionRecord {
  readonly id: string;
  readonly lotId: string;
  readonly quantity: string;
  readonly unitCost: string;
}

export interface InvestmentSellCommitResponse extends CommitTransactionResponse {
  /** First consumed source buy retained for the additive B074 response envelope. */
  readonly trade: InvestmentTradeRecord & { readonly side: "buy" };
  readonly lot: InvestmentLotRecord;
  readonly sellTrade: InvestmentTradeRecord & { readonly side: "sell" };
  readonly consumptions: readonly InvestmentLotConsumptionRecord[];
}

export type InvestmentTradeCommitResponse =
  InvestmentBuyCommitResponse | InvestmentSellCommitResponse;

export interface PortfolioPosition {
  readonly instrument: MarketPrice["instrument"];
  readonly quantity: string;
  readonly costBasis: string;
  readonly averageUnitCost: string;
  readonly price: string | null;
  readonly priceAt: string | null;
  readonly sourceType: MarketPrice["sourceType"] | null;
  readonly isEstimated: boolean;
  readonly valuationStatus: "priced" | "missing_price";
  readonly marketValue: string | null;
  readonly unrealizedProfitLoss: string | null;
}

export class InvestmentLotStateError extends Error {
  readonly code = "investment_lot_conflict";
  readonly status = 409;

  constructor(message = "Investment lot quantity or cost basis changed.") {
    super(message);
    this.name = "InvestmentLotStateError";
  }
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
        readonly side: "buy";
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

async function loadSellBasis(
  tx: postgres.TransactionSql,
  input: {
    readonly userId: string;
    readonly instrumentId: string;
    readonly quantity: string;
  },
): Promise<{ readonly availableQuantity: string; readonly costBasis: string }> {
  const instruments = await tx`
    select id from app_private.investment_instruments
     where user_id=${input.userId}::uuid
       and id=${input.instrumentId}::uuid
       and active
  `;
  if (!instruments[0]) throw new LedgerReferenceError();
  const rows = await tx<
    { readonly available_quantity: string; readonly cost_basis: string }[]
  >`
    with ordered as (
      select quantity_open, unit_cost,
        coalesce(sum(quantity_open) over (
          order by created_at, id
          rows between unbounded preceding and 1 preceding
        ), 0::numeric) as quantity_before
      from app_private.investment_lots
      where user_id=${input.userId}::uuid
        and instrument_id=${input.instrumentId}::uuid
        and quantity_open > 0
    )
    select coalesce(sum(quantity_open), 0::numeric)::numeric(28,10)::text
        as available_quantity,
      round(coalesce(sum(
        least(quantity_open, greatest(${input.quantity}::numeric - quantity_before, 0::numeric))
        * unit_cost
      ), 0::numeric), 4)::numeric(19,4)::text as cost_basis
    from ordered
  `;
  const row = rows[0];
  return row
    ? {
        availableQuantity: row.available_quantity,
        costBasis: row.cost_basis,
      }
    : { availableQuantity: "0.0000000000", costBasis: "0.0000" };
}

export async function previewInvestmentTrade(
  sql: LedgerSql,
  userId: string,
  command: InvestmentBuyCommand | InvestmentSellInput,
): Promise<ReturnType<typeof previewTransaction>> {
  if (command.type === "investment_buy") return previewTransaction(command);
  const basis = await withUserScope(sql, userId, (tx) =>
    loadSellBasis(tx, {
      userId,
      instrumentId: command.instrumentId,
      quantity: command.quantity,
    }),
  );
  return previewTransaction({
    ...command,
    availableQuantity: basis.availableQuantity,
    costBasis: basis.costBasis,
  });
}

export async function commitInvestmentSell(
  sql: LedgerSql,
  input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly requestId: string;
    readonly actorSessionId?: string;
    readonly command: InvestmentSellInput;
    readonly previewHash?: string;
  },
): Promise<InvestmentSellCommitResponse> {
  const requestHash = hashCanonicalValue(input.command);
  const stored = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<
      {
        readonly request_hash: string;
        readonly status: string;
        readonly stored_command: InvestmentSellCommand | null;
      }[]
    >`
      select encode(key.request_hash,'hex') request_hash, key.status,
        transaction.input_json stored_command
      from app_private.idempotency_keys key
      left join app_private.transactions transaction
        on transaction.user_id=key.user_id
       and transaction.id=(key.response_body->>'transactionId')::uuid
      where key.user_id=${input.userId}::uuid and key.key=${input.idempotencyKey}
    `,
  );
  const storedKey = stored[0];
  if (storedKey && storedKey.request_hash !== requestHash) {
    throw new IdempotencyConflictError();
  }
  if (storedKey && storedKey.status !== "completed") {
    throw new SerializationRetryExhaustedError();
  }
  const initialBasis = storedKey?.stored_command
    ? {
        availableQuantity: storedKey.stored_command.availableQuantity,
        costBasis: storedKey.stored_command.costBasis,
      }
    : await withUserScope(sql, input.userId, (tx) =>
        loadSellBasis(tx, {
          userId: input.userId,
          instrumentId: input.command.instrumentId,
          quantity: input.command.quantity,
        }),
      );
  const command: InvestmentSellCommand = storedKey?.stored_command ?? {
    ...input.command,
    availableQuantity: initialBasis.availableQuantity,
    costBasis: initialBasis.costBasis,
  };
  const tradeId = randomUUID();
  const committed = await commitLedgerTransaction(sql, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    ...(input.actorSessionId ? { actorSessionId: input.actorSessionId } : {}),
    command,
    requestHash,
    ...(input.previewHash ? { previewHash: input.previewHash } : {}),
    beforeFinalize: async ({ tx, transactionId }) => {
      await tx`
        select id from app_private.investment_lots
         where user_id=${input.userId}::uuid
           and instrument_id=${input.command.instrumentId}::uuid
           and quantity_open > 0
         order by created_at, id
         for update
      `;
      const lockedBasis = await loadSellBasis(tx, {
        userId: input.userId,
        instrumentId: input.command.instrumentId,
        quantity: input.command.quantity,
      });
      if (
        lockedBasis.availableQuantity !== initialBasis.availableQuantity ||
        lockedBasis.costBasis !== initialBasis.costBasis
      ) {
        throw new InvestmentLotStateError();
      }
      await tx`
        insert into app_private.investment_trades (
          id, user_id, transaction_id, account_id, instrument_id, side,
          quantity, unit_price, fee_amount, cost_basis_including_fee
        ) values (
          ${tradeId}::uuid, ${input.userId}::uuid, ${transactionId}::uuid,
          ${input.command.cashAccountId}::uuid, ${input.command.instrumentId}::uuid,
          'sell', ${input.command.quantity}::numeric, ${input.command.unitPrice}::numeric,
          ${input.command.feeAmount}::numeric, ${lockedBasis.costBasis}::numeric
        )
      `;
      const planned = await tx<
        {
          readonly lot_id: string;
          readonly quantity: string;
          readonly unit_cost: string;
        }[]
      >`
        with ordered as (
          select id, quantity_open, unit_cost,
            coalesce(sum(quantity_open) over (
              order by created_at, id
              rows between unbounded preceding and 1 preceding
            ), 0::numeric) as quantity_before
          from app_private.investment_lots
          where user_id=${input.userId}::uuid
            and instrument_id=${input.command.instrumentId}::uuid
            and quantity_open > 0
        )
        select id::text lot_id,
          least(quantity_open, greatest(${input.command.quantity}::numeric - quantity_before, 0::numeric))::numeric(28,10)::text quantity,
          unit_cost::text
        from ordered
        where ${input.command.quantity}::numeric > quantity_before
        order by quantity_before
      `;
      for (const consumption of planned) {
        await tx`
          insert into app_private.investment_lot_consumptions (
            id, user_id, sell_trade_id, lot_id, quantity, unit_cost
          ) values (
            ${randomUUID()}::uuid, ${input.userId}::uuid, ${tradeId}::uuid,
            ${consumption.lot_id}::uuid, ${consumption.quantity}::numeric,
            ${consumption.unit_cost}::numeric
          )
        `;
        await tx`
          update app_private.investment_lots
             set quantity_open=quantity_open-${consumption.quantity}::numeric
           where user_id=${input.userId}::uuid
             and id=${consumption.lot_id}::uuid
             and quantity_open >= ${consumption.quantity}::numeric
        `;
      }
    },
  });
  const rows = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<
      {
        readonly trade_id: string;
        readonly transaction_id: string;
        readonly account_id: string;
        readonly instrument_id: string;
        readonly side: "sell";
        readonly quantity: string;
        readonly unit_price: string;
        readonly fee_amount: string;
        readonly cost_basis_including_fee: string;
      }[]
    >`
      select id::text trade_id, transaction_id::text, account_id::text,
        instrument_id::text, side, quantity::text, unit_price::text,
        fee_amount::text, cost_basis_including_fee::text
      from app_private.investment_trades
      where user_id=${input.userId}::uuid
        and transaction_id=${committed.transactionId}::uuid
    `,
  );
  const trade = rows[0];
  if (!trade) throw new Error("Committed investment sell has no trade.");
  const consumptions = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<
      {
        readonly id: string;
        readonly lot_id: string;
        readonly quantity: string;
        readonly unit_cost: string;
      }[]
    >`
      select id::text, lot_id::text, quantity::text, unit_cost::text
      from app_private.investment_lot_consumptions
      where user_id=${input.userId}::uuid and sell_trade_id=${trade.trade_id}::uuid
      order by created_at, id
    `,
  );
  const firstConsumption = consumptions[0];
  if (!firstConsumption) {
    throw new Error("Committed investment sell has no lot consumption.");
  }
  const sources = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<
      {
        readonly trade_id: string;
        readonly transaction_id: string;
        readonly account_id: string;
        readonly instrument_id: string;
        readonly side: "buy";
        readonly quantity: string;
        readonly unit_price: string;
        readonly fee_amount: string;
        readonly cost_basis_including_fee: string;
        readonly lot_id: string;
        readonly quantity_open: string;
        readonly unit_cost: string;
      }[]
    >`
      select buy.id::text trade_id, buy.transaction_id::text,
        buy.account_id::text, buy.instrument_id::text, buy.side,
        buy.quantity::text, buy.unit_price::text, buy.fee_amount::text,
        buy.cost_basis_including_fee::text, lot.id::text lot_id,
        lot.quantity_open::text, lot.unit_cost::text
      from app_private.investment_lots lot
      join app_private.investment_trades buy
        on buy.user_id=lot.user_id and buy.id=lot.buy_trade_id
      where lot.user_id=${input.userId}::uuid
        and lot.id=${firstConsumption.lot_id}::uuid
    `,
  );
  const source = sources[0];
  if (!source) throw new Error("Consumed investment lot source was not found.");
  return {
    ...committed,
    trade: {
      id: source.trade_id,
      transactionId: source.transaction_id,
      accountId: source.account_id,
      instrumentId: source.instrument_id,
      side: source.side,
      quantity: source.quantity,
      unitPrice: source.unit_price,
      feeAmount: source.fee_amount,
      costBasisIncludingFee: source.cost_basis_including_fee,
    },
    lot: {
      id: source.lot_id,
      instrumentId: source.instrument_id,
      buyTradeId: source.trade_id,
      quantityOpen: source.quantity_open,
      unitCost: source.unit_cost,
    },
    sellTrade: {
      id: trade.trade_id,
      transactionId: trade.transaction_id,
      accountId: trade.account_id,
      instrumentId: trade.instrument_id,
      side: trade.side,
      quantity: trade.quantity,
      unitPrice: trade.unit_price,
      feeAmount: trade.fee_amount,
      costBasisIncludingFee: trade.cost_basis_including_fee,
    },
    consumptions: consumptions.map((row) => ({
      id: row.id,
      lotId: row.lot_id,
      quantity: row.quantity,
      unitCost: row.unit_cost,
    })),
  };
}

export async function commitInvestmentTrade(
  sql: LedgerSql,
  input:
    | Parameters<typeof commitInvestmentBuy>[1]
    | Parameters<typeof commitInvestmentSell>[1],
): Promise<InvestmentTradeCommitResponse> {
  if (input.command.type === "investment_buy") {
    return commitInvestmentBuy(
      sql,
      input as Parameters<typeof commitInvestmentBuy>[1],
    );
  }
  return commitInvestmentSell(
    sql,
    input as Parameters<typeof commitInvestmentSell>[1],
  );
}

export async function getPortfolio(
  sql: LedgerSql,
  input: { readonly userId: string; readonly asOf: string },
): Promise<readonly PortfolioPosition[]> {
  const rows = await withUserScope(
    sql,
    input.userId,
    (tx) => tx<
      {
        readonly instrument_id: string;
        readonly symbol: string;
        readonly name: string;
        readonly instrument_type: MarketPrice["instrument"]["instrumentType"];
        readonly unit: MarketPrice["instrument"]["unit"];
        readonly currency: string;
        readonly active: boolean;
        readonly quantity: string;
        readonly cost_basis: string;
        readonly average_unit_cost: string;
        readonly price: string | null;
        readonly price_at: string | null;
        readonly source_type: MarketPrice["sourceType"] | null;
        readonly price_is_estimated: boolean | null;
        readonly market_value: string | null;
        readonly unrealized_profit_loss: string | null;
      }[]
    >`
      with positions as (
        select instrument_id, sum(quantity_open)::numeric(28,10) quantity,
          round(sum(quantity_open*unit_cost),4)::numeric(19,4) cost_basis,
          round(sum(quantity_open*unit_cost)/sum(quantity_open),10)::numeric(28,10) average_unit_cost
        from app_private.investment_lots
        where user_id=${input.userId}::uuid and quantity_open > 0
        group by instrument_id
      )
      select instrument.id::text instrument_id, instrument.symbol, instrument.name,
        instrument.instrument_type, instrument.unit, instrument.currency,
        instrument.active, position.quantity::text, position.cost_basis::text,
        position.average_unit_cost::text, price.price::text,
        price.price_at::text, price.source_type, price.is_estimated price_is_estimated,
        case when price.id is null then null
          else round(position.quantity*price.price,4)::numeric(19,4)::text end market_value,
        case when price.id is null then null
          else (round(position.quantity*price.price,4)-position.cost_basis)::numeric(19,4)::text end unrealized_profit_loss
      from positions position
      join app_private.investment_instruments instrument
        on instrument.user_id=${input.userId}::uuid and instrument.id=position.instrument_id
      left join lateral (
        select id, price, price_at, source_type, is_estimated
        from app_private.market_prices
        where user_id=${input.userId}::uuid
          and instrument_id=instrument.id
          and price_at <= ${input.asOf}::timestamptz
        order by price_at desc, id desc limit 1
      ) price on true
      order by instrument.symbol, instrument.id
    `,
  );
  return rows.map((row) => ({
    instrument: {
      id: row.instrument_id,
      symbol: row.symbol,
      name: row.name,
      instrumentType: row.instrument_type,
      unit: row.unit,
      currency: row.currency,
      active: row.active,
    },
    quantity: row.quantity,
    costBasis: row.cost_basis,
    averageUnitCost: row.average_unit_cost,
    price: row.price,
    priceAt: row.price_at ? new Date(row.price_at).toISOString() : null,
    sourceType: row.source_type,
    isEstimated: row.price_is_estimated ?? true,
    valuationStatus: row.price === null ? "missing_price" : "priced",
    marketValue: row.market_value,
    unrealizedProfitLoss: row.unrealized_profit_loss,
  }));
}
