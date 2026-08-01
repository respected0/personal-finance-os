"use client";

import { subscriptionCreateSchema } from "@personal-finance-os/contracts";
import {
  formatTrMoney,
  Money,
  parseTrMoney,
} from "@personal-finance-os/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface PaymentAccount {
  readonly id: string;
  readonly name: string;
  readonly accountType:
    "bank" | "cash" | "wallet" | "credit_card" | "investment";
  readonly currency: string;
  readonly status: "active" | "archived";
}

interface ExpenseCategory {
  readonly id: string;
  readonly name: string;
  readonly categoryType: "income" | "expense";
  readonly active: boolean;
}

interface SubscriptionCycle {
  readonly id: string;
  readonly period: string;
  readonly renewalDate: string;
  readonly chargeTransactionId: string | null;
  readonly chargeTotal: string;
  readonly cashbackTotal: string;
  readonly actualNet: string;
}

interface Subscription {
  readonly id: string;
  readonly name: string;
  readonly billingDay: number;
  readonly paymentAccountId: string;
  readonly expectedGross: string;
  readonly cashbackRate: string;
  readonly cashbackCap: string;
  readonly expectedCashback: string;
  readonly expectedNet: string;
  readonly active: boolean;
  readonly rowVersion: number;
  readonly cycles: readonly SubscriptionCycle[];
}

interface ProblemDetails {
  readonly title?: string;
  readonly code?: string;
}

interface CreateDraft {
  name: string;
  billingDay: number;
  paymentAccountId: string;
  expectedGrossInput: string;
  cashbackPercent: number;
  cashbackCapInput: string;
}

interface ChargeDraft {
  cycleId: string;
  amountInput: string;
  categoryId: string;
  date: string;
}

interface CashbackDraft {
  cycleId: string;
  amountInput: string;
  targetAccountId: string;
  date: string;
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
  return `${date}T12:00:00+03:00`;
}

function exactDisplay(amount: string): string {
  return `${formatTrMoney(Money.from(amount, "TRY"))} TRY`;
}

function canonicalPercent(percent: number): string {
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
    throw new Error("Cashback oranı 0–100 arasında tam sayı olmalı.");
  }
  return percent === 100 ? "1.00" : `0.${String(percent).padStart(2, "0")}`;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json()) as T | ProblemDetails;
  if (!response.ok) {
    const problem = body as ProblemDetails;
    throw new Error(
      problem.code === "mfa_required"
        ? "Bu finansal yazma için AAL2 doğrulaması gerekiyor."
        : (problem.title ?? "İstek tamamlanamadı."),
    );
  }
  return body as T;
}

export function SubscriptionWorkspace({
  accounts,
  categories,
  onCommitted,
}: {
  readonly accounts: readonly PaymentAccount[];
  readonly categories: readonly ExpenseCategory[];
  readonly onCommitted: () => Promise<void>;
}) {
  const [subscriptions, setSubscriptions] = useState<readonly Subscription[]>(
    [],
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        ({ accountType, currency, status }) =>
          status === "active" &&
          currency === "TRY" &&
          (accountType === "bank" ||
            accountType === "cash" ||
            accountType === "credit_card"),
      ),
    [accounts],
  );

  const loadSubscriptions = useCallback(async () => {
    try {
      setSubscriptions(
        await jsonRequest<readonly Subscription[]>("/api/v1/subscriptions"),
      );
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Abonelikler yüklenemedi.",
      );
    }
  }, []);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const createForm = useForm<CreateDraft>({
    defaultValues: {
      name: "",
      billingDay: 12,
      paymentAccountId: "",
      expectedGrossInput: "",
      cashbackPercent: 10,
      cashbackCapInput: "",
    },
  });
  const chargeForm = useForm<ChargeDraft>({
    defaultValues: {
      cycleId: "",
      amountInput: "",
      categoryId: "",
      date: todayInIstanbul(),
    },
  });
  const cashbackForm = useForm<CashbackDraft>({
    defaultValues: {
      cycleId: "",
      amountInput: "",
      targetAccountId: "",
      date: todayInIstanbul(),
    },
  });

  const cycles = subscriptions.flatMap((subscription) =>
    subscription.cycles.map((cycle) => ({ ...cycle, subscription })),
  );
  const unchargedCycles = cycles.filter(
    ({ chargeTransactionId }) => !chargeTransactionId,
  );
  const chargedCycles = cycles.filter(
    ({ chargeTransactionId }) => chargeTransactionId,
  );

  async function createSubscription(input: CreateDraft) {
    try {
      const body = subscriptionCreateSchema.parse({
        name: input.name,
        billingDay: input.billingDay,
        paymentAccountId: input.paymentAccountId,
        expectedGross: parseTrMoney(input.expectedGrossInput).toCanonical(),
        cashbackRate: canonicalPercent(input.cashbackPercent),
        cashbackCap: parseTrMoney(input.cashbackCapInput).toCanonical(),
      });
      await jsonRequest("/api/v1/subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice("Abonelik ve benzersiz aylık yenileme döngüsü oluşturuldu.");
      createForm.reset();
      await loadSubscriptions();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Abonelik oluşturulamadı.",
      );
    }
  }

  async function chargeCycle(input: ChargeDraft) {
    try {
      await jsonRequest(`/api/v1/subscription-cycles/${input.cycleId}/charge`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          amount: parseTrMoney(input.amountInput).toCanonical(),
          currency: "TRY",
          occurredAt: occurredAt(input.date),
          economicDate: input.date,
          categoryId: input.categoryId,
        }),
      });
      setNotice("Abonelik tahsilatı brüt gider olarak kaydedildi.");
      chargeForm.reset();
      await Promise.all([loadSubscriptions(), onCommitted()]);
    } catch (chargeError) {
      setError(
        chargeError instanceof Error
          ? chargeError.message
          : "Tahsilat kaydedilemedi.",
      );
    }
  }

  async function creditCashback(input: CashbackDraft) {
    try {
      const account = paymentAccounts.find(
        ({ id }) => id === input.targetAccountId,
      );
      if (!account) throw new Error("Cashback hedef hesabını seçin.");
      await jsonRequest(
        `/api/v1/subscription-cycles/${input.cycleId}/cashback`,
        {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({
            amount: parseTrMoney(input.amountInput).toCanonical(),
            currency: "TRY",
            occurredAt: occurredAt(input.date),
            economicDate: input.date,
            targetAccountId: account.id,
            targetKind:
              account.accountType === "credit_card"
                ? "card"
                : account.accountType,
          }),
        },
      );
      setNotice(
        "Cashback bağlı gider mahsuplaşması olarak kaydedildi; normal gelir 0.",
      );
      cashbackForm.reset();
      await Promise.all([loadSubscriptions(), onCommitted()]);
    } catch (cashbackError) {
      setError(
        cashbackError instanceof Error
          ? cashbackError.message
          : "Cashback kaydedilemedi.",
      );
    }
  }

  return (
    <section
      className="panel subscription-workspace"
      aria-labelledby="subscriptions-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Abonelik merkezi</p>
          <h2 id="subscriptions-title">Yenileme ve cashback</h2>
        </div>
        <span className="count-pill">{subscriptions.length}</span>
      </div>
      <p className="muted">
        Brüt tahsilat ve cashback iki bağlı ledger işlemidir; normal gelir
        üretilmez.
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

      <div
        className="subscription-summary-grid"
        data-testid="subscription-summary"
      >
        {subscriptions.map((subscription) => {
          const cycle = subscription.cycles[0];
          return (
            <article className="subscription-summary" key={subscription.id}>
              <strong>{subscription.name}</strong>
              <span>
                Beklenen brüt {exactDisplay(subscription.expectedGross)}
              </span>
              <span>
                Beklenen cashback {exactDisplay(subscription.expectedCashback)}
              </span>
              <span>Beklenen net {exactDisplay(subscription.expectedNet)}</span>
              {cycle && (
                <>
                  <small>Yenileme {cycle.renewalDate}</small>
                  <span>Gerçek net {exactDisplay(cycle.actualNet)}</span>
                  <small>
                    {cycle.chargeTransactionId
                      ? "Tahsilat ve cashback bağlantısı aktif"
                      : "Tahsilat bekleniyor"}
                  </small>
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className="subscription-action-grid">
        <form
          className="compact-form"
          onSubmit={createForm.handleSubmit(createSubscription)}
        >
          <h3>Abonelik ekle</h3>
          <label>
            Abonelik adı
            <input {...createForm.register("name", { required: true })} />
          </label>
          <label>
            Ödeme hesabı
            <select
              {...createForm.register("paymentAccountId", { required: true })}
            >
              <option value="">Hesap seç</option>
              {paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <div className="two-columns">
            <label>
              Beklenen brüt
              <input
                inputMode="decimal"
                placeholder="1.200,00"
                {...createForm.register("expectedGrossInput", {
                  required: true,
                })}
              />
            </label>
            <label>
              Yenileme günü
              <input
                type="number"
                min="1"
                max="31"
                {...createForm.register("billingDay", { valueAsNumber: true })}
              />
            </label>
          </div>
          <div className="two-columns">
            <label>
              Cashback %
              <input
                type="number"
                min="0"
                max="100"
                {...createForm.register("cashbackPercent", {
                  valueAsNumber: true,
                })}
              />
            </label>
            <label>
              Cashback tavanı
              <input
                inputMode="decimal"
                placeholder="120,00"
                {...createForm.register("cashbackCapInput", { required: true })}
              />
            </label>
          </div>
          <button className="secondary-button" type="submit">
            Aboneliği kaydet
          </button>
        </form>

        <form
          className="compact-form"
          onSubmit={chargeForm.handleSubmit(chargeCycle)}
        >
          <h3>Brüt tahsilatı kaydet</h3>
          <label>
            Tahsilat döngüsü
            <select {...chargeForm.register("cycleId", { required: true })}>
              <option value="">Döngü seç</option>
              {unchargedCycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.subscription.name} · {cycle.period}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tahsilat kategorisi
            <select {...chargeForm.register("categoryId", { required: true })}>
              <option value="">Kategori seç</option>
              {categories
                .filter(
                  ({ active, categoryType }) =>
                    active && categoryType === "expense",
                )
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="two-columns">
            <label>
              Brüt tahsilat
              <input
                inputMode="decimal"
                placeholder="1.200,00"
                {...chargeForm.register("amountInput", { required: true })}
              />
            </label>
            <label>
              Tahsilat tarihi
              <input
                type="date"
                {...chargeForm.register("date", { required: true })}
              />
            </label>
          </div>
          <button className="primary-button" type="submit">
            Tahsilatı kaydet
          </button>
        </form>

        <form
          className="compact-form"
          onSubmit={cashbackForm.handleSubmit(creditCashback)}
        >
          <h3>Cashback kaydet</h3>
          <label>
            Cashback döngüsü
            <select {...cashbackForm.register("cycleId", { required: true })}>
              <option value="">Döngü seç</option>
              {chargedCycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.subscription.name} · kalan net{" "}
                  {exactDisplay(cycle.actualNet)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cashback hedefi
            <select
              {...cashbackForm.register("targetAccountId", { required: true })}
            >
              <option value="">Hesap seç</option>
              {paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <div className="two-columns">
            <label>
              Cashback tutarı
              <input
                inputMode="decimal"
                placeholder="120,00"
                {...cashbackForm.register("amountInput", { required: true })}
              />
            </label>
            <label>
              Cashback tarihi
              <input
                type="date"
                {...cashbackForm.register("date", { required: true })}
              />
            </label>
          </div>
          <button className="primary-button" type="submit">
            Cashback kaydet
          </button>
        </form>
      </div>
    </section>
  );
}
