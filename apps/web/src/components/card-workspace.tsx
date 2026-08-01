"use client";

import {
  creditCardProfileCreateSchema,
  transactionCommandSchema,
  type TransactionCommandInput,
} from "@personal-finance-os/contracts";
import {
  formatTrMoney,
  Money,
  parseTrMoney,
} from "@personal-finance-os/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface CardAccount {
  readonly id: string;
  readonly name: string;
  readonly accountType:
    "bank" | "cash" | "wallet" | "credit_card" | "investment";
  readonly currency: string;
  readonly status: "active" | "archived";
  readonly balance: { readonly calculatedOriginal: string };
}

interface ExpenseCategory {
  readonly id: string;
  readonly name: string;
  readonly categoryType: "income" | "expense";
  readonly active: boolean;
}

interface CardProfile {
  readonly accountId: string;
  readonly creditLimit: string;
  readonly statementDay: number;
  readonly dueDay: number;
  readonly minimumPaymentRule:
    | {
        readonly type: "percentage";
        readonly rate: string;
        readonly minimumAmount: string;
      }
    | { readonly type: "fixed"; readonly amount: string };
  readonly active: boolean;
  readonly rowVersion: number;
}

interface CardStatement {
  readonly id: string;
  readonly cardAccountId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly closingBalance: string;
  readonly paidAmount: string;
  readonly outstandingAmount: string;
  readonly dueDate: string;
  readonly status: "open" | "partially_paid" | "paid" | "overdue";
}

interface PreviewResult {
  readonly previewHash: string;
  readonly engineVersion: string;
  readonly effects: {
    readonly personalExpenseDelta: string;
    readonly normalIncomeDelta: string;
    readonly netWorthDelta: string;
  };
}

interface ProblemDetails {
  readonly title?: string;
  readonly code?: string;
}

interface ProfileDraft {
  accountId: string;
  creditLimitInput: string;
  statementDay: number;
  dueDay: number;
  minimumRatePercent: number;
  minimumAmountInput: string;
}

interface CardExpenseDraft {
  cardAccountId: string;
  categoryId: string;
  amountInput: string;
  date: string;
  installmentCount: string;
  firstInstallmentDate: string;
}

interface CardPaymentDraft {
  bankAccountId: string;
  cardAccountId: string;
  statementId: string;
  amountInput: string;
  date: string;
}

type CardPaymentInput = Extract<
  TransactionCommandInput,
  { readonly type: "card_payment" }
>;

function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function exactDisplay(amount: string): string {
  return `${formatTrMoney(Money.from(amount, "TRY"))} TRY`;
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

function occurredAt(date: string): string {
  return `${date}T12:00:00+03:00`;
}

function percentRate(percent: number): string {
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
    throw new Error("Asgari ödeme oranı 0–100 arasında tam sayı olmalı.");
  }
  return percent === 100 ? "1.00" : `0.${String(percent).padStart(2, "0")}`;
}

function EffectSummary({
  preview,
}: {
  readonly preview: PreviewResult | null;
}) {
  if (!preview) {
    return (
      <p className="muted">Kesin ledger etkisini kaydetmeden önce önizleyin.</p>
    );
  }
  return (
    <div
      className="compact-impact"
      data-testid="card-effect-summary"
      aria-live="polite"
    >
      <span>Gider {exactDisplay(preview.effects.personalExpenseDelta)}</span>
      <span>Gelir {exactDisplay(preview.effects.normalIncomeDelta)}</span>
      <span>Net servet {exactDisplay(preview.effects.netWorthDelta)}</span>
      <small>Motor: {preview.engineVersion}</small>
    </div>
  );
}

export function CardWorkspace({
  accounts,
  categories,
  onCommitted,
}: {
  readonly accounts: readonly CardAccount[];
  readonly categories: readonly ExpenseCategory[];
  readonly onCommitted: () => Promise<void>;
}) {
  const [profiles, setProfiles] = useState<readonly CardProfile[]>([]);
  const [statements, setStatements] = useState<readonly CardStatement[]>([]);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [expensePreview, setExpensePreview] = useState<PreviewResult | null>(
    null,
  );
  const [paymentPreview, setPaymentPreview] = useState<PreviewResult | null>(
    null,
  );

  const cardAccounts = useMemo(
    () =>
      accounts.filter(
        ({ accountType, currency, status }) =>
          accountType === "credit_card" &&
          currency === "TRY" &&
          status === "active",
      ),
    [accounts],
  );
  const bankAccounts = useMemo(
    () =>
      accounts.filter(
        ({ accountType, currency, status }) =>
          accountType === "bank" && currency === "TRY" && status === "active",
      ),
    [accounts],
  );
  const profiledCards = useMemo(
    () =>
      cardAccounts.filter((account) =>
        profiles.some(({ accountId }) => accountId === account.id),
      ),
    [cardAccounts, profiles],
  );

  const loadCards = useCallback(async () => {
    setLoadError("");
    try {
      const nextProfiles =
        await jsonRequest<readonly CardProfile[]>("/api/v1/cards");
      const nextStatements = (
        await Promise.all(
          nextProfiles.map(({ accountId }) =>
            jsonRequest<readonly CardStatement[]>(
              `/api/v1/cards/${accountId}/statements`,
            ),
          ),
        )
      ).flat();
      setProfiles(nextProfiles);
      setStatements(nextStatements);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Kart bilgileri yüklenemedi.",
      );
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const profileForm = useForm<ProfileDraft>({
    defaultValues: {
      accountId: "",
      creditLimitInput: "",
      statementDay: 20,
      dueDay: 30,
      minimumRatePercent: 20,
      minimumAmountInput: "100,00",
    },
  });
  const expenseForm = useForm<CardExpenseDraft>({
    defaultValues: {
      cardAccountId: "",
      categoryId: "",
      amountInput: "",
      date: todayInIstanbul(),
      installmentCount: "",
      firstInstallmentDate: "",
    },
  });
  const paymentForm = useForm<CardPaymentDraft>({
    defaultValues: {
      bankAccountId: "",
      cardAccountId: "",
      statementId: "",
      amountInput: "",
      date: todayInIstanbul(),
    },
  });

  function buildExpense(input: CardExpenseDraft): TransactionCommandInput {
    const count = input.installmentCount
      ? Number(input.installmentCount)
      : undefined;
    const candidate = {
      type: "expense" as const,
      amount: parseTrMoney(input.amountInput).toCanonical(),
      currency: "TRY",
      occurredAt: occurredAt(input.date),
      economicDate: input.date,
      sourceAccountId: input.cardAccountId,
      sourceKind: "card" as const,
      categoryId: input.categoryId,
      ...(count !== undefined
        ? {
            installmentCount: count,
            firstInstallmentDate: input.firstInstallmentDate,
          }
        : {}),
    };
    return transactionCommandSchema.parse(candidate);
  }

  function buildPayment(input: CardPaymentDraft): CardPaymentInput {
    const amount = parseTrMoney(input.amountInput).toCanonical();
    return transactionCommandSchema.parse({
      type: "card_payment",
      amount,
      currency: "TRY",
      occurredAt: occurredAt(input.date),
      economicDate: input.date,
      bankAccountId: input.bankAccountId,
      cardAccountId: input.cardAccountId,
      ...(input.statementId
        ? { statementAllocations: [{ statementId: input.statementId, amount }] }
        : {}),
    }) as CardPaymentInput;
  }

  async function createProfile(input: ProfileDraft) {
    try {
      const body = creditCardProfileCreateSchema.parse({
        accountId: input.accountId,
        creditLimit: parseTrMoney(input.creditLimitInput).toCanonical(),
        statementDay: input.statementDay,
        dueDay: input.dueDay,
        minimumPaymentRule: {
          type: "percentage",
          rate: percentRate(input.minimumRatePercent),
          minimumAmount: parseTrMoney(input.minimumAmountInput).toCanonical(),
        },
      });
      await jsonRequest("/api/v1/cards", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice("Kart profili oluşturuldu; limit net servete eklenmedi.");
      profileForm.reset();
      await loadCards();
    } catch (error) {
      profileForm.setError("creditLimitInput", {
        message:
          error instanceof Error
            ? error.message
            : "Kart profili oluşturulamadı.",
      });
    }
  }

  async function previewExpense(
    input: CardExpenseDraft,
  ): Promise<PreviewResult> {
    setExpenseError("");
    const result = await jsonRequest<PreviewResult>(
      "/api/v1/transactions/preview",
      {
        method: "POST",
        body: JSON.stringify(buildExpense(input)),
      },
    );
    setExpensePreview(result);
    return result;
  }

  async function commitExpense(input: CardExpenseDraft) {
    try {
      const command = buildExpense(input);
      const freshPreview = await previewExpense(input);
      await jsonRequest("/api/v1/transactions", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          command,
          previewHash: freshPreview.previewHash,
        }),
      });
      setNotice(
        "Kart harcaması gider ve kart borcu olarak kaydedildi; banka değişmedi.",
      );
      expenseForm.reset();
      setExpensePreview(null);
      await onCommitted();
    } catch (error) {
      setExpenseError(
        error instanceof Error
          ? error.message
          : "Kart harcaması kaydedilemedi.",
      );
    }
  }

  async function previewPayment(
    input: CardPaymentDraft,
  ): Promise<PreviewResult> {
    setPaymentError("");
    const command = buildPayment(input);
    const result = await jsonRequest<PreviewResult>(
      `/api/v1/cards/${input.cardAccountId}/payments/preview`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: command.amount,
          currency: command.currency,
          occurredAt: command.occurredAt,
          economicDate: command.economicDate,
          bankAccountId: input.bankAccountId,
          ...(input.statementId
            ? {
                statementAllocations: [
                  { statementId: input.statementId, amount: command.amount },
                ],
              }
            : {}),
        }),
      },
    );
    setPaymentPreview(result);
    return result;
  }

  async function commitPayment(input: CardPaymentDraft) {
    try {
      const command = buildPayment(input);
      const freshPreview = await previewPayment(input);
      await jsonRequest("/api/v1/transactions", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          command,
          previewHash: freshPreview.previewHash,
        }),
      });
      setNotice(
        "Kart ödemesi banka ve kart borcunu azalttı; ikinci gider oluşmadı.",
      );
      paymentForm.reset();
      setPaymentPreview(null);
      await Promise.all([loadCards(), onCommitted()]);
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : "Kart ödemesi kaydedilemedi.",
      );
    }
  }

  const selectedPaymentCard = paymentForm.watch("cardAccountId");
  const selectedStatements = statements.filter(
    ({ cardAccountId, outstandingAmount }) =>
      cardAccountId === selectedPaymentCard &&
      Money.from(outstandingAmount, "TRY").compare(Money.zero("TRY")) > 0,
  );

  return (
    <section className="panel card-workspace" aria-labelledby="cards-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Kart merkezi</p>
          <h2 id="cards-title">Kart harcaması ve ödeme</h2>
        </div>
        <span className="count-pill">{profiles.length}</span>
      </div>
      <p className="muted">
        Kart limiti yalnız kullanılabilir kapasitedir; net servet hesabına
        katılmaz.
      </p>
      {loadError && (
        <p className="field-error" role="alert">
          {loadError}
        </p>
      )}
      {notice && (
        <p className="notice-banner" role="status">
          {notice}
        </p>
      )}

      <div className="card-summary-grid" data-testid="card-summary">
        {profiledCards.map((account) => {
          const profile = profiles.find(
            ({ accountId }) => accountId === account.id,
          );
          return (
            <article className="card-summary" key={account.id}>
              <strong>{account.name}</strong>
              <span>
                Borç {exactDisplay(account.balance.calculatedOriginal)}
              </span>
              <span>Limit {exactDisplay(profile?.creditLimit ?? "0.00")}</span>
              <small>
                Kesim {profile?.statementDay}. gün · Son ödeme {profile?.dueDay}
                . gün
              </small>
            </article>
          );
        })}
      </div>

      {cardAccounts.some(
        (account) =>
          !profiles.some(({ accountId }) => accountId === account.id),
      ) && (
        <form
          className="compact-form"
          onSubmit={profileForm.handleSubmit(createProfile)}
        >
          <h3>Kart profilini tamamla</h3>
          <label>
            Profil kartı
            <select {...profileForm.register("accountId", { required: true })}>
              <option value="">Kart seç</option>
              {cardAccounts
                .filter(
                  (account) =>
                    !profiles.some(({ accountId }) => accountId === account.id),
                )
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Kart limiti
            <input
              inputMode="decimal"
              placeholder="25.000,00"
              {...profileForm.register("creditLimitInput", { required: true })}
            />
          </label>
          <div className="two-columns">
            <label>
              Kesim günü
              <input
                type="number"
                min="1"
                max="31"
                {...profileForm.register("statementDay", {
                  valueAsNumber: true,
                })}
              />
            </label>
            <label>
              Son ödeme günü
              <input
                type="number"
                min="1"
                max="31"
                {...profileForm.register("dueDay", { valueAsNumber: true })}
              />
            </label>
          </div>
          <div className="two-columns">
            <label>
              Asgari oran %
              <input
                type="number"
                min="0"
                max="100"
                {...profileForm.register("minimumRatePercent", {
                  valueAsNumber: true,
                })}
              />
            </label>
            <label>
              Asgari alt sınır
              <input
                inputMode="decimal"
                {...profileForm.register("minimumAmountInput")}
              />
            </label>
          </div>
          {profileForm.formState.errors.creditLimitInput?.message && (
            <p className="field-error" role="alert">
              {profileForm.formState.errors.creditLimitInput.message}
            </p>
          )}
          <button className="secondary-button" type="submit">
            Kart profilini kaydet
          </button>
        </form>
      )}

      <div className="card-action-grid">
        <form
          className="compact-form"
          onSubmit={expenseForm.handleSubmit(commitExpense)}
          noValidate
        >
          <h3>Kart harcaması</h3>
          <label>
            Harcama kartı
            <select
              {...expenseForm.register("cardAccountId", { required: true })}
            >
              <option value="">Kart seç</option>
              {profiledCards.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Harcama kategorisi
            <select {...expenseForm.register("categoryId", { required: true })}>
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
              Harcama tutarı
              <input
                inputMode="decimal"
                placeholder="427,50"
                {...expenseForm.register("amountInput", { required: true })}
              />
            </label>
            <label>
              Harcama tarihi
              <input
                type="date"
                {...expenseForm.register("date", { required: true })}
              />
            </label>
          </div>
          <div className="two-columns">
            <label>
              Taksit sayısı <span className="optional">İsteğe bağlı</span>
              <input
                type="number"
                min="2"
                max="60"
                {...expenseForm.register("installmentCount")}
              />
            </label>
            <label>
              İlk taksit tarihi
              <input
                type="date"
                {...expenseForm.register("firstInstallmentDate")}
              />
            </label>
          </div>
          {expenseError && (
            <p className="field-error" role="alert">
              {expenseError}
            </p>
          )}
          <EffectSummary preview={expensePreview} />
          <div className="form-actions">
            <button
              className="text-button"
              type="button"
              onClick={expenseForm.handleSubmit(
                (input) =>
                  void previewExpense(input).catch((error) =>
                    setExpenseError(
                      error instanceof Error
                        ? error.message
                        : "Önizleme başarısız.",
                    ),
                  ),
              )}
            >
              Etkiyi göster
            </button>
            <button className="primary-button" type="submit">
              Harcamayı kaydet
            </button>
          </div>
        </form>

        <form
          className="compact-form"
          onSubmit={paymentForm.handleSubmit(commitPayment)}
          noValidate
        >
          <h3>Kart ödemesi</h3>
          <label>
            Ödeme banka hesabı
            <select
              {...paymentForm.register("bankAccountId", { required: true })}
            >
              <option value="">Hesap seç</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ödeme kartı
            <select
              {...paymentForm.register("cardAccountId", { required: true })}
            >
              <option value="">Kart seç</option>
              {profiledCards.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ekstre ilişkisi <span className="optional">İsteğe bağlı</span>
            <select {...paymentForm.register("statementId")}>
              <option value="">Ekstresiz ödeme</option>
              {selectedStatements.map((statement) => (
                <option key={statement.id} value={statement.id}>
                  {statement.periodEnd} · kalan{" "}
                  {exactDisplay(statement.outstandingAmount)}
                </option>
              ))}
            </select>
          </label>
          <div className="two-columns">
            <label>
              Ödeme tutarı
              <input
                inputMode="decimal"
                placeholder="200,00"
                {...paymentForm.register("amountInput", { required: true })}
              />
            </label>
            <label>
              Ödeme tarihi
              <input
                type="date"
                {...paymentForm.register("date", { required: true })}
              />
            </label>
          </div>
          {paymentError && (
            <p className="field-error" role="alert">
              {paymentError}
            </p>
          )}
          <EffectSummary preview={paymentPreview} />
          <div className="form-actions">
            <button
              className="text-button"
              type="button"
              onClick={paymentForm.handleSubmit(
                (input) =>
                  void previewPayment(input).catch((error) =>
                    setPaymentError(
                      error instanceof Error
                        ? error.message
                        : "Önizleme başarısız.",
                    ),
                  ),
              )}
            >
              Etkiyi göster
            </button>
            <button className="primary-button" type="submit">
              Ödemeyi kaydet
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
