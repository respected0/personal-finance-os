"use client";

import {
  formatTrMoney,
  Money,
  parseTrMoney,
} from "@personal-finance-os/domain";
import { useMemo, useState } from "react";

interface Account {
  readonly id: string;
  readonly name: string;
  readonly accountType:
    "bank" | "cash" | "wallet" | "credit_card" | "investment";
  readonly currency: string;
  readonly status: "active" | "archived";
}

interface Category {
  readonly id: string;
  readonly name: string;
  readonly categoryType: "income" | "expense";
  readonly active: boolean;
}

interface Snapshot {
  readonly id: string;
  readonly accountId: string;
  readonly calculatedBalance: string;
  readonly statedBalance: string;
  readonly difference: string;
  readonly status: "open" | "resolved" | "ignored";
}

interface Session {
  readonly id: string;
  readonly status: "open" | "resolved";
  readonly unresolvedCount: number;
  readonly items: readonly {
    readonly id: string;
    readonly snapshot: Snapshot;
  }[];
}

interface Problem {
  readonly title?: string;
  readonly code?: string;
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

function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function occurredAt(date: string): string {
  return `${date}T23:59:00+03:00`;
}

function display(amount: string): string {
  return `${formatTrMoney(Money.from(amount, "TRY"))} TRY`;
}

export function ReconciliationWorkspace({
  accounts,
  categories,
  onCommitted,
}: {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly onCommitted: () => Promise<void>;
}) {
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayInIstanbul());
  const [statedInput, setStatedInput] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [resolutionType, setResolutionType] = useState<
    "accepted" | "adjustment" | "missing_transaction"
  >("adjustment");
  const [reason, setReason] = useState("");
  const [missingAmount, setMissingAmount] = useState("");
  const [missingCategoryId, setMissingCategoryId] = useState("");
  const [revisionTransactionId, setRevisionTransactionId] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionAmount, setRevisionAmount] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const activeAccounts = useMemo(
    () =>
      accounts.filter(
        ({ status, currency }) => status === "active" && currency === "TRY",
      ),
    [accounts],
  );
  const expenseCategories = useMemo(
    () =>
      categories.filter(
        ({ active, categoryType }) => active && categoryType === "expense",
      ),
    [categories],
  );
  const selectedAccount = activeAccounts.find(({ id }) => id === accountId);

  async function createSnapshot(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!selectedAccount) throw new Error("Mutabakat hesabını seçin.");
      const created = await request<Snapshot>(
        `/api/v1/accounts/${selectedAccount.id}/snapshots`,
        {
          method: "POST",
          body: JSON.stringify({
            observedAt: occurredAt(date),
            statedBalance: parseTrMoney(statedInput).toCanonical(),
          }),
        },
      );
      setSnapshot(created);
      setSession(null);
      setNotice("Ekstre bakiyesi ledger projection ile karşılaştırıldı.");
      setError("");
    } catch (snapshotError) {
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : "Bakiye karşılaştırılamadı.",
      );
    }
  }

  async function startReconciliation() {
    try {
      if (!snapshot || !selectedAccount) {
        throw new Error("Önce bir bakiye karşılaştırması oluşturun.");
      }
      const created = await request<Session>("/api/v1/reconciliations", {
        method: "POST",
        body: JSON.stringify({
          accountId: selectedAccount.id,
          periodStart: date,
          periodEnd: date,
          snapshotIds: [snapshot.id],
        }),
      });
      setSession(created);
      setNotice("Mutabakat oturumu açıldı; çözüm ve gerekçe zorunlu.");
      setError("");
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Mutabakat başlatılamadı.",
      );
    }
  }

  async function resolve(event: React.FormEvent) {
    event.preventDefault();
    try {
      const item = session?.items[0];
      if (!session || !item || !selectedAccount) {
        throw new Error("Açık bir mutabakat maddesi bulunamadı.");
      }
      const body = {
        itemId: item.id,
        resolutionType,
        reason,
        ...(resolutionType === "missing_transaction"
          ? {
              command: {
                type: "expense",
                amount: parseTrMoney(missingAmount).toCanonical(),
                sourceAccountId: selectedAccount.id,
                sourceKind:
                  selectedAccount.accountType === "credit_card"
                    ? "card"
                    : selectedAccount.accountType,
                categoryId: missingCategoryId,
                currency: "TRY",
                occurredAt: `${date}T12:00:00+03:00`,
                economicDate: date,
              },
            }
          : {}),
      };
      const result = await request<{ readonly session: Session }>(
        `/api/v1/reconciliations/${session.id}/resolve`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify(body),
        },
      );
      setSession(result.session);
      setSnapshot(result.session.items[0]?.snapshot ?? snapshot);
      setNotice("Mutabakat gerekçesi ve finansal bağlantısı kaydedildi.");
      setError("");
      await onCommitted();
    } catch (resolutionError) {
      setError(
        resolutionError instanceof Error
          ? resolutionError.message
          : "Mutabakat çözülemedi.",
      );
    }
  }

  async function voidTransaction() {
    try {
      await request(`/api/v1/transactions/${revisionTransactionId}/void`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ reason: revisionReason }),
      });
      setNotice(
        "İşlem, orijinali değiştirmeyen tam ters kayıtla iptal edildi.",
      );
      setError("");
      await onCommitted();
    } catch (revisionError) {
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "İşlem iptal edilemedi.",
      );
    }
  }

  async function reviseTransaction() {
    try {
      const account = activeAccounts.find(({ id }) => id === accountId);
      if (
        !account ||
        (account.accountType !== "bank" &&
          account.accountType !== "cash" &&
          account.accountType !== "credit_card")
      ) {
        throw new Error("Revizyon için banka, nakit veya kart hesabı seçin.");
      }
      await request(`/api/v1/transactions/${revisionTransactionId}/revise`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          reason: revisionReason,
          replacement: {
            type: "expense",
            amount: parseTrMoney(revisionAmount).toCanonical(),
            sourceAccountId: account.id,
            sourceKind:
              account.accountType === "credit_card"
                ? "card"
                : account.accountType,
            categoryId: missingCategoryId,
            currency: "TRY",
            occurredAt: `${date}T12:00:00+03:00`,
            economicDate: date,
          },
        }),
      });
      setNotice(
        "Orijinal işlem korunarak ters kayıt ve yeni işlem oluşturuldu.",
      );
      setError("");
      await onCommitted();
    } catch (revisionError) {
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "İşlem revize edilemedi.",
      );
    }
  }

  return (
    <section
      className="panel reconciliation-workspace"
      aria-labelledby="reconciliation-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Mutabakat ve düzeltme</p>
          <h2 id="reconciliation-title">
            Ekstre farkını iz bırakmadan kapatma
          </h2>
          <p className="muted">
            Belirtilen bakiye ile ledger projection ayrı tutulur; her çözüm
            gerekçe ve bağlantı taşır.
          </p>
        </div>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice-banner" role="status">
          {notice}
        </p>
      )}
      <div className="reconciliation-grid">
        <form onSubmit={createSnapshot}>
          <h3>Bakiye karşılaştır</h3>
          <label>
            Hesap
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Hesap seç</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <div className="two-columns">
            <label>
              Ekstre tarihi
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label>
              Belirtilen bakiye
              <input
                inputMode="decimal"
                value={statedInput}
                onChange={(event) => setStatedInput(event.target.value)}
                placeholder="1.250,00"
              />
            </label>
          </div>
          <button className="secondary-button" type="submit">
            Farkı hesapla
          </button>
          {snapshot && (
            <div className="reconciliation-result" aria-live="polite">
              <span>Ledger: {display(snapshot.calculatedBalance)}</span>
              <span>Ekstre: {display(snapshot.statedBalance)}</span>
              <strong>Fark: {display(snapshot.difference)}</strong>
              {snapshot.status === "open" && !session && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={startReconciliation}
                >
                  Mutabakat başlat
                </button>
              )}
            </div>
          )}
        </form>
        <form onSubmit={resolve}>
          <h3>Farkı çöz</h3>
          <label>
            Çözüm
            <select
              value={resolutionType}
              onChange={(event) =>
                setResolutionType(event.target.value as typeof resolutionType)
              }
            >
              <option value="adjustment">Düzeltme kaydı</option>
              <option value="missing_transaction">Eksik gider</option>
              <option value="accepted">Gerekçeyle kabul et</option>
            </select>
          </label>
          <label>
            Zorunlu gerekçe
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
          </label>
          {resolutionType === "missing_transaction" && (
            <div className="two-columns">
              <label>
                Eksik gider tutarı
                <input
                  inputMode="decimal"
                  value={missingAmount}
                  onChange={(event) => setMissingAmount(event.target.value)}
                />
              </label>
              <label>
                Kategori
                <select
                  value={missingCategoryId}
                  onChange={(event) => setMissingCategoryId(event.target.value)}
                >
                  <option value="">Kategori seç</option>
                  {expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={!session || session.status !== "open"}
          >
            Çözümü kaydet
          </button>
        </form>
        <div>
          <h3>İşlem iptal / revizyon</h3>
          <label>
            Orijinal işlem kimliği
            <input
              value={revisionTransactionId}
              onChange={(event) => setRevisionTransactionId(event.target.value)}
            />
          </label>
          <label>
            Zorunlu gerekçe
            <textarea
              value={revisionReason}
              onChange={(event) => setRevisionReason(event.target.value)}
              maxLength={500}
            />
          </label>
          <div className="two-columns">
            <label>
              Yeni gider tutarı
              <input
                inputMode="decimal"
                value={revisionAmount}
                onChange={(event) => setRevisionAmount(event.target.value)}
              />
            </label>
            <label>
              Kategori
              <select
                value={missingCategoryId}
                onChange={(event) => setMissingCategoryId(event.target.value)}
              >
                <option value="">Kategori seç</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="revision-actions">
            <button
              className="text-button danger"
              type="button"
              onClick={voidTransaction}
            >
              Tam ters kayıtla iptal
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={reviseTransaction}
            >
              Ters kayıt + yeni işlem
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
