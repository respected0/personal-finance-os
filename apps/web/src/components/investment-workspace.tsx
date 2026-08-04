"use client";

import { formatTrMoney, Money } from "@personal-finance-os/domain";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Account {
  readonly id: string;
  readonly name: string;
  readonly accountType: string;
  readonly currency: string;
  readonly status: "active" | "archived";
}
interface Instrument {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly instrumentType: string;
  readonly unit: "unit" | "gram";
  readonly currency: string;
  readonly active: boolean;
}
interface MarketPrice {
  readonly id: string;
  readonly instrument: Instrument;
  readonly price: string;
  readonly priceAt: string;
  readonly sourceType: "manual" | "reference_fixture";
  readonly isEstimated: boolean;
}
interface PortfolioPosition {
  readonly instrument: Instrument;
  readonly quantity: string;
  readonly costBasis: string;
  readonly averageUnitCost: string;
  readonly price: string | null;
  readonly priceAt: string | null;
  readonly sourceType: MarketPrice["sourceType"] | null;
  readonly isEstimated: boolean;
  readonly valuationStatus: "priced" | "missing_price";
  readonly marketValue: string | null;
  readonly allocationPercent: string | null;
  readonly unrealizedProfitLoss: string | null;
}
interface Preview {
  readonly previewHash: string;
  readonly effects: {
    readonly personalExpenseDelta: string;
    readonly normalIncomeDelta: string;
  };
}

function canonical(value: string): string {
  return value.trim().replace(",", ".");
}
function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function money(value: string | null): string {
  return value === null
    ? "—"
    : `${formatTrMoney(Money.from(value, "TRY"))} TRY`;
}
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json()) as T | { title?: string };
  if (!response.ok) {
    throw new Error(
      (body as { title?: string }).title ?? "Yatırım isteği tamamlanamadı.",
    );
  }
  return body as T;
}

export function InvestmentWorkspace({
  accounts,
  refreshToken,
  onCommitted,
}: {
  readonly accounts: readonly Account[];
  readonly refreshToken: string;
  readonly onCommitted: () => void | Promise<void>;
}) {
  const [prices, setPrices] = useState<readonly MarketPrice[]>([]);
  const [positions, setPositions] = useState<readonly PortfolioPosition[]>([]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [accountId, setAccountId] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fee, setFee] = useState("0,00");
  const [economicDate, setEconomicDate] = useState(todayInIstanbul());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const cashAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status === "active" &&
          account.currency === "TRY" &&
          (account.accountType === "bank" || account.accountType === "cash"),
      ),
    [accounts],
  );

  const load = useCallback(async () => {
    try {
      const [latestPrices, portfolio] = await Promise.all([
        json<readonly MarketPrice[]>("/api/v1/market-prices"),
        json<readonly PortfolioPosition[]>("/api/v1/portfolio"),
      ]);
      setPrices(latestPrices);
      setPositions(portfolio);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Yatırım verileri açılamadı.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshToken]);
  useEffect(() => {
    const selected = prices.find(
      (price) => price.instrument.id === instrumentId,
    );
    if (selected) setUnitPrice(selected.price);
  }, [instrumentId, prices]);

  const totalCash = useMemo(() => {
    try {
      const gross = Money.product(
        canonical(quantity),
        canonical(unitPrice),
        "TRY",
      );
      const feeMoney = Money.from(canonical(fee || "0.00"), "TRY");
      return side === "buy" ? gross.add(feeMoney) : gross.subtract(feeMoney);
    } catch {
      return null;
    }
  }, [fee, quantity, side, unitPrice]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const command = {
        type: side === "buy" ? "investment_buy" : "investment_sell",
        currency: "TRY",
        occurredAt: new Date(`${economicDate}T12:00:00+03:00`).toISOString(),
        economicDate,
        cashAccountId: accountId,
        instrumentId,
        quantity: canonical(quantity),
        unitPrice: canonical(unitPrice),
        feeAmount: canonical(fee || "0.00"),
      } as const;
      const preview = await json<Preview>("/api/v1/investment-trades/preview", {
        method: "POST",
        body: JSON.stringify(command),
      });
      if (
        preview.effects.personalExpenseDelta !== "0.00" ||
        preview.effects.normalIncomeDelta !== "0.00"
      ) {
        throw new Error("Yatırım işlemi gider veya normal gelir üretemez.");
      }
      await json("/api/v1/investment-trades", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ command, previewHash: preview.previewHash }),
      });
      setNotice(
        side === "buy"
          ? "Alım kaydedildi; ücret maliyete eklendi, tüketim gideri 0."
          : "Satış kaydedildi; lot maliyeti ve gerçekleşen kâr/zarar ayrıştırıldı.",
      );
      setQuantity("");
      await Promise.all([load(), Promise.resolve(onCommitted())]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "İşlem kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="panel investment-workspace"
      aria-labelledby="investment-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">P0-B2 yatırım</p>
          <h2 id="investment-title">Portföy ve yatırım işlemi</h2>
        </div>
        <span className="muted">Fiyat kaynağı ve zamanı görünür</span>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="investment-grid">
        <form className="compact-form" onSubmit={submit}>
          <h3>Alım veya satış</h3>
          <div className="two-columns">
            <label>
              İşlem türü
              <select
                value={side}
                onChange={(event) =>
                  setSide(event.target.value as "buy" | "sell")
                }
              >
                <option value="buy">Alım</option>
                <option value="sell">Satış</option>
              </select>
            </label>
            <label>
              İşlem tarihi
              <input
                type="date"
                value={economicDate}
                onChange={(event) => setEconomicDate(event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Nakit hesabı
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              required
            >
              <option value="">Seçin</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Yatırım aracı
            <select
              value={instrumentId}
              onChange={(event) => setInstrumentId(event.target.value)}
              required
            >
              <option value="">Seçin</option>
              {prices.map((price) => (
                <option key={price.instrument.id} value={price.instrument.id}>
                  {price.instrument.symbol} · {price.instrument.name}
                </option>
              ))}
            </select>
          </label>
          <div className="investment-input-grid">
            <label>
              Miktar
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="1,3100000000"
                required
              />
            </label>
            <label>
              Birim fiyat
              <input
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                required
              />
            </label>
            <label>
              Ücret
              <input
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
                required
              />
            </label>
          </div>
          <div className="compact-impact" data-testid="investment-cash-total">
            <span>
              {side === "buy" ? "Toplam nakit çıkışı" : "Net nakit girişi"}
            </span>
            <strong>
              {totalCash ? money(totalCash.toCanonical()) : "— TRY"}
            </strong>
            <small>
              Exact decimal miktar × birim fiyat {side === "buy" ? "+" : "−"}{" "}
              ücret
            </small>
          </div>
          <div className="form-actions">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Kaydediliyor…" : "Yatırım işlemini kaydet"}
            </button>
          </div>
        </form>

        <div className="portfolio-list" data-testid="portfolio-list">
          {positions.length === 0 ? (
            <p className="muted">Henüz açık yatırım pozisyonu yok.</p>
          ) : (
            positions.map((position) => (
              <article
                className="portfolio-position"
                key={position.instrument.id}
              >
                <div className="section-heading">
                  <div>
                    <strong>{position.instrument.symbol}</strong>
                    <small>{position.instrument.name}</small>
                  </div>
                  <strong>
                    {position.quantity}{" "}
                    {position.instrument.unit === "gram" ? "g" : "adet"}
                  </strong>
                </div>
                <dl>
                  <div>
                    <dt>Dağılım</dt>
                    <dd>
                      {position.allocationPercent === null
                        ? "—"
                        : `%${position.allocationPercent}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Maliyet</dt>
                    <dd>{money(position.costBasis)}</dd>
                  </div>
                  <div>
                    <dt>Değer</dt>
                    <dd>{money(position.marketValue)}</dd>
                  </div>
                  <div>
                    <dt>Gerçekleşmemiş K/Z</dt>
                    <dd>{money(position.unrealizedProfitLoss)}</dd>
                  </div>
                </dl>
                <small className="muted">
                  {position.valuationStatus === "missing_price"
                    ? "Fiyat yok · değer tahmini üretilemedi"
                    : `${position.sourceType === "manual" ? "Manuel" : "Referans"} fiyat ${position.price} · ${position.priceAt ? new Date(position.priceAt).toLocaleString("tr-TR") : "—"}${position.isEstimated ? " · tahmini" : ""}`}
                </small>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
