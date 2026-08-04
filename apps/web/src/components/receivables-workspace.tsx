"use client";

import {
  parseTrMoney,
  formatTrMoney,
  Money,
} from "@personal-finance-os/domain";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Account {
  readonly id: string;
  readonly name: string;
  readonly accountType:
    "bank" | "cash" | "wallet" | "credit_card" | "investment";
  readonly currency: string;
  readonly status: "active" | "archived";
}

interface Counterparty {
  readonly id: string;
  readonly name: string;
  readonly type: "person" | "merchant" | "employer" | "provider";
}

interface Receivable {
  readonly id: string;
  readonly personId: string;
  readonly personName: string;
  readonly nominalAmount: string;
  readonly collectedAmount: string;
  readonly outstandingAmount: string;
  readonly recognizedAmount: string;
  readonly collectabilityStatus:
    "collectible" | "doubtful" | "waived" | "closed";
  readonly includeInNetWorth: boolean;
  readonly includeInPlanning: boolean;
  readonly currency: string;
}

interface Preview {
  readonly effects: {
    readonly personalExpenseDelta: string;
    readonly normalIncomeDelta: string;
    readonly netWorthDelta: string;
  };
}

interface Problem {
  readonly title?: string;
  readonly code?: string;
}

interface ShareDraft {
  readonly personId: string;
  readonly amountInput: string;
}

function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function display(amount: string): string {
  return `${formatTrMoney(Money.from(amount, "TRY"))} TRY`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json()) as T | Problem;
  if (!response.ok) {
    const problem = body as Problem;
    throw new Error(
      problem.code === "mfa_required"
        ? "Bu finansal yazma için AAL2 doğrulaması gerekiyor."
        : (problem.title ?? "İstek tamamlanamadı."),
    );
  }
  return body as T;
}

function occurredAt(date: string): string {
  return `${date}T12:00:00+03:00`;
}

export function ReceivablesWorkspace({
  accounts,
  onCommitted,
}: {
  readonly accounts: readonly Account[];
  readonly onCommitted: () => Promise<void>;
}) {
  const [people, setPeople] = useState<readonly Counterparty[]>([]);
  const [receivables, setReceivables] = useState<readonly Receivable[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [personName, setPersonName] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [roundingInput, setRoundingInput] = useState("0,00");
  const [date, setDate] = useState(todayInIstanbul());
  const [shares, setShares] = useState<readonly ShareDraft[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [settlements, setSettlements] = useState<Record<string, string>>({});

  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status === "active" &&
          account.currency === "TRY" &&
          (account.accountType === "bank" ||
            account.accountType === "cash" ||
            account.accountType === "credit_card"),
      ),
    [accounts],
  );
  const settlementAccounts = useMemo(
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
      const [nextPeople, nextReceivables] = await Promise.all([
        request<readonly Counterparty[]>("/api/v1/counterparties?type=person"),
        request<readonly Receivable[]>("/api/v1/receivables"),
      ]);
      setPeople(nextPeople);
      setReceivables(nextReceivables);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Alacaklar yüklenemedi.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function sharedBody() {
    const account = paymentAccounts.find(({ id }) => id === paymentAccountId);
    if (!account) throw new Error("Ödeme hesabını seçin.");
    if (shares.length === 0) throw new Error("En az bir kişi payı ekleyin.");
    return {
      totalAmount: parseTrMoney(totalInput).toCanonical(),
      ownerShare: parseTrMoney(ownerInput).toCanonical(),
      roundingAmount: parseTrMoney(roundingInput).toCanonical(),
      shares: shares.map((share) => ({
        personId: share.personId,
        amount: parseTrMoney(share.amountInput).toCanonical(),
      })),
      paymentAccountId: account.id,
      paymentSourceKind:
        account.accountType === "credit_card" ? "card" : account.accountType,
      currency: "TRY",
      occurredAt: occurredAt(date),
      economicDate: date,
    };
  }

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/api/v1/counterparties", {
        method: "POST",
        body: JSON.stringify({ type: "person", name: personName }),
      });
      setPersonName("");
      setNotice("Kişi, şifreli ad kaydıyla eklendi.");
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Kişi eklenemedi.",
      );
    }
  }

  async function showPreview() {
    try {
      setPreview(
        await request<Preview>("/api/v1/shared-expenses/preview", {
          method: "POST",
          body: JSON.stringify(sharedBody()),
        }),
      );
      setError("");
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Önizleme alınamadı.",
      );
    }
  }

  async function createShared(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/api/v1/shared-expenses", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(sharedBody()),
      });
      setNotice(
        "Tek ödeme kaydedildi; kişi payları alacak olarak oluşturuldu.",
      );
      setTotalInput("");
      setOwnerInput("");
      setRoundingInput("0,00");
      setShares([]);
      setPreview(null);
      await Promise.all([load(), onCommitted()]);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Ortak harcama kaydedilemedi.",
      );
    }
  }

  async function settle(receivable: Receivable) {
    try {
      const target = settlementAccounts.find(
        ({ id }) => id === settlementAccountId,
      );
      if (!target) throw new Error("Tahsilat hesabını seçin.");
      const amount = parseTrMoney(
        settlements[receivable.id] ?? "",
      ).toCanonical();
      await request(`/api/v1/receivables/${receivable.id}/settlements`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          amount,
          currency: "TRY",
          occurredAt: occurredAt(date),
          economicDate: date,
          targetAccountId: target.id,
          targetKind: target.accountType,
        }),
      });
      setNotice(
        "Tahsilat nakdi artırdı ve alacağı azalttı; normal gelir 0 kaldı.",
      );
      setSettlements((current) => ({ ...current, [receivable.id]: "" }));
      await Promise.all([load(), onCommitted()]);
    } catch (settlementError) {
      setError(
        settlementError instanceof Error
          ? settlementError.message
          : "Tahsilat kaydedilemedi.",
      );
    }
  }

  return (
    <section
      className="panel receivables-workspace"
      aria-labelledby="receivables-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Alacak merkezi</p>
          <h2 id="receivables-title">Ortak gider ve tahsilat</h2>
        </div>
        <span className="count-pill">{receivables.length}</span>
      </div>
      <p className="muted">
        Ortak ödeme tek ledger hareketidir. Kişi payları alacak olarak izlenir;
        tahsilat normal gelir değildir.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice-banner" role="status">
          {notice}
        </p>
      )}
      <div className="receivables-grid">
        <form className="compact-form" onSubmit={addPerson}>
          <h3>Kişi ekle</h3>
          <label>
            Ad
            <input
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              required
            />
          </label>
          <button className="secondary-button" type="submit">
            Kişiyi kaydet
          </button>
        </form>
        <form
          className="compact-form shared-expense-form"
          onSubmit={createShared}
        >
          <h3>Ortak harcama</h3>
          <label>
            Ödeme hesabı
            <select
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(event.target.value)}
              required
            >
              <option value="">Hesap seç</option>
              {paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <div className="three-columns">
            <label>
              Toplam
              <input
                inputMode="decimal"
                placeholder="100,00"
                value={totalInput}
                onChange={(event) => setTotalInput(event.target.value)}
                required
              />
            </label>
            <label>
              Sahip payı
              <input
                inputMode="decimal"
                placeholder="33,33"
                value={ownerInput}
                onChange={(event) => setOwnerInput(event.target.value)}
                required
              />
            </label>
            <label>
              Yuvarlama
              <input
                inputMode="decimal"
                value={roundingInput}
                onChange={(event) => setRoundingInput(event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Tarih
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </label>
          <div className="share-list" aria-label="Kişi payları">
            {shares.map((share, index) => (
              <div className="share-row" key={`${share.personId}-${index}`}>
                <select
                  aria-label={`Kişi ${index + 1}`}
                  value={share.personId}
                  onChange={(event) =>
                    setShares((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, personId: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">Kişi seç</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Pay ${index + 1}`}
                  inputMode="decimal"
                  placeholder="33,33"
                  value={share.amountInput}
                  onChange={(event) =>
                    setShares((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, amountInput: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() =>
                    setShares((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  Kaldır
                </button>
              </div>
            ))}
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setShares((current) => [
                ...current,
                { personId: "", amountInput: "" },
              ])
            }
          >
            + Kişi payı
          </button>
          {preview && (
            <div className="compact-impact" data-testid="shared-effect-summary">
              <span>
                Kişisel gider {display(preview.effects.personalExpenseDelta)}
              </span>
              <span>
                Normal gelir {display(preview.effects.normalIncomeDelta)}
              </span>
              <span>Net servet {display(preview.effects.netWorthDelta)}</span>
            </div>
          )}
          <div className="form-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => void showPreview()}
            >
              Etkiyi göster
            </button>
            <button className="primary-button" type="submit">
              Ortak harcamayı kaydet
            </button>
          </div>
        </form>
      </div>
      <div className="receivable-list" data-testid="receivable-list">
        {receivables.length > 0 && (
          <label className="settlement-account-select">
            Tahsilat hesabı
            <select
              value={settlementAccountId}
              onChange={(event) => setSettlementAccountId(event.target.value)}
            >
              <option value="">Hesap seç</option>
              {settlementAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {receivables.map((receivable) => (
          <article className="receivable-row" key={receivable.id}>
            <div>
              <strong>{receivable.personName}</strong>
              <small>
                Nominal {display(receivable.nominalAmount)} · Tahsil{" "}
                {display(receivable.collectedAmount)} · Kalan{" "}
                {display(receivable.outstandingAmount)}
              </small>
              <small>
                Tanıma {display(receivable.recognizedAmount)} · Net servet{" "}
                {receivable.includeInNetWorth ? "dahil" : "hariç"} · Plan{" "}
                {receivable.includeInPlanning ? "dahil" : "hariç"}
              </small>
            </div>
            <div className="settlement-controls">
              <input
                aria-label={`${receivable.personName} tahsilat tutarı`}
                inputMode="decimal"
                placeholder="10,00"
                value={settlements[receivable.id] ?? ""}
                onChange={(event) =>
                  setSettlements((current) => ({
                    ...current,
                    [receivable.id]: event.target.value,
                  }))
                }
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() => void settle(receivable)}
                disabled={receivable.collectabilityStatus === "closed"}
              >
                Tahsil et
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
