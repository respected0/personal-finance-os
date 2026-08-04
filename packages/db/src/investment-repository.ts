import { randomUUID } from "node:crypto";
import type { LedgerSql } from "./ledger-repository.js";
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
