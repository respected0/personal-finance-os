"use client";

import {
  categoryCreateSchema,
  financialAccountCreateSchema,
  institutionCreateSchema,
  transactionEntryDraftSchema,
  type TransactionCommandInput,
  type TransactionEntryDraft,
} from "@personal-finance-os/contracts";
import {
  formatTrMoney,
  Money,
  parseTrMoney,
} from "@personal-finance-os/domain";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { CardWorkspace } from "./card-workspace";
import { SubscriptionWorkspace } from "./subscription-workspace";
import { ReceivablesWorkspace } from "./receivables-workspace";

interface AccountBalance {
  accountId: string;
  currency: string;
  asOf: string | null;
  calculatedOriginal: string;
  calculatedBase: string;
}

interface FinancialAccount {
  id: string;
  institutionId?: string;
  ledgerAccountId: string;
  name: string;
  accountType: "bank" | "cash" | "wallet" | "credit_card" | "investment";
  currency: string;
  openingDate: string;
  status: "active" | "archived";
  rowVersion: number;
  balance: AccountBalance;
}

interface Institution {
  id: string;
  name: string;
  institutionType: "bank" | "wallet" | "broker" | "other";
  active: boolean;
  rowVersion: number;
}

interface Category {
  id: string;
  name: string;
  categoryType: "income" | "expense";
  active: boolean;
  sortOrder: number;
  rowVersion: number;
}

interface HistoryItem {
  id: string;
  type: string;
  occurredAt: string;
  economicDate: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  engineVersion: string;
}

interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
  aggregate: {
    personalExpense: string;
    normalIncome: string;
    net: string;
  };
}

interface PreviewResult {
  previewHash: string;
  engineVersion: string;
  effects: {
    personalExpenseDelta: string;
    normalIncomeDelta: string;
    netWorthDelta: string;
  };
}

interface ProblemDetails {
  status?: number;
  code?: string;
  title?: string;
}

interface AccountDraft {
  name: string;
  accountType: FinancialAccount["accountType"];
  currency: string;
  openingDate: string;
  institutionId: string;
}

interface InstitutionDraft {
  name: string;
  institutionType: Institution["institutionType"];
}

interface CategoryDraft {
  name: string;
  categoryType: Category["categoryType"];
}

const emptyHistory: HistoryPage = {
  items: [],
  nextCursor: null,
  aggregate: {
    personalExpense: "0.00",
    normalIncome: "0.00",
    net: "0.00",
  },
};

const transactionLabels: Record<string, string> = {
  expense: "Gider",
  income: "Gelir",
  transfer: "Transfer",
  opening_balance: "Açılış bakiyesi",
};

function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentMonthRange(): { from: string; to: string } {
  const [year, month] = todayInIstanbul().split("-");
  const lastDay = new Date(
    Date.UTC(Number(year), Number(month), 0),
  ).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function exactDisplay(amount: string, currency = "TRY"): string {
  try {
    return `${formatTrMoney(Money.from(amount, currency))} ${currency}`;
  } catch {
    return `— ${currency}`;
  }
}

function exactNetWorth(accounts: readonly FinancialAccount[]): Money {
  return accounts.reduce((total, account) => {
    if (account.status !== "active") return total;
    const value = Money.from(account.balance.calculatedBase, "TRY");
    return account.accountType === "credit_card"
      ? total.subtract(value)
      : total.add(value);
  }, Money.zero("TRY"));
}

function accountKind(account: FinancialAccount): "bank" | "cash" {
  if (account.accountType !== "bank" && account.accountType !== "cash") {
    throw new Error("P0-A1 işlemleri yalnız banka veya nakit hesabı kullanır.");
  }
  return account.accountType;
}

function problemMessage(problem: ProblemDetails, fallback: string): string {
  if (problem.code === "mfa_required") {
    return "Bu kayıt için AAL2 doğrulaması gerekiyor.";
  }
  if (problem.code === "unauthenticated") {
    return "Oturum bulunamadı. Önce güvenli giriş yapın.";
  }
  return problem.title ?? fallback;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
  });
  const body = (await response.json()) as T | ProblemDetails;
  if (!response.ok) {
    throw new Error(
      problemMessage(body as ProblemDetails, "İstek tamamlanamadı."),
    );
  }
  return body as T;
}

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id} role="alert">
      {message}
    </p>
  );
}

export function DailyCoreApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<HistoryPage>(emptyHistory);
  const [dashboard, setDashboard] = useState<HistoryPage>(emptyHistory);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const entryHeading = useRef<HTMLHeadingElement>(null);

  const activeAccounts = useMemo(
    () => accounts.filter(({ status }) => status === "active"),
    [accounts],
  );
  const transactionAccounts = useMemo(
    () =>
      activeAccounts.filter(
        ({ accountType, currency }) =>
          currency === "TRY" &&
          (accountType === "bank" || accountType === "cash"),
      ),
    [activeAccounts],
  );

  const {
    register,
    watch,
    reset,
    setError,
    handleSubmit,
    formState: { errors },
  } = useForm<TransactionEntryDraft>({
    defaultValues: {
      type: "expense",
      amountInput: "",
      date: todayInIstanbul(),
      sourceAccountId: "",
      targetAccountId: "",
      categoryId: "",
      feeInput: "",
    },
  });
  const draft = watch();

  const accountForm = useForm<AccountDraft>({
    defaultValues: {
      name: "",
      accountType: "bank",
      currency: "TRY",
      openingDate: todayInIstanbul(),
      institutionId: "",
    },
  });
  const institutionForm = useForm<InstitutionDraft>({
    defaultValues: { name: "", institutionType: "bank" },
  });
  const categoryForm = useForm<CategoryDraft>({
    defaultValues: { name: "", categoryType: "expense" },
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const historyQuery = new URLSearchParams();
    const currentSearchParams = new URLSearchParams(queryString);
    for (const key of [
      "period_from",
      "period_to",
      "account",
      "type",
      "category",
    ]) {
      const value = currentSearchParams.get(key);
      if (value) historyQuery.set(key, value);
    }
    historyQuery.set("limit", "25");
    const month = currentMonthRange();
    const dashboardQuery = new URLSearchParams({
      period_from: month.from,
      period_to: month.to,
      limit: "5",
    });
    try {
      const [
        nextAccounts,
        nextInstitutions,
        nextCategories,
        nextHistory,
        nextDashboard,
      ] = await Promise.all([
        jsonRequest<FinancialAccount[]>("/api/v1/accounts"),
        jsonRequest<Institution[]>("/api/v1/institutions"),
        jsonRequest<Category[]>("/api/v1/categories"),
        jsonRequest<HistoryPage>(
          `/api/v1/transactions?${historyQuery.toString()}`,
        ),
        jsonRequest<HistoryPage>(
          `/api/v1/transactions?${dashboardQuery.toString()}`,
        ),
      ]);
      setAccounts(nextAccounts);
      setInstitutions(nextInstitutions);
      setCategories(nextCategories);
      setHistory(nextHistory);
      setDashboard(nextDashboard);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Finans özeti yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const buildCommand = useCallback(
    (candidate: TransactionEntryDraft): TransactionCommandInput => {
      const parsed = transactionEntryDraftSchema.safeParse(candidate);
      if (!parsed.success) throw new Error("Zorunlu alanları tamamlayın.");
      const amount = parseTrMoney(parsed.data.amountInput).toCanonical();
      const base = {
        amount,
        currency: "TRY",
        economicDate: parsed.data.date,
        occurredAt: `${parsed.data.date}T12:00:00+03:00`,
      } as const;
      if (parsed.data.type === "expense") {
        const source = transactionAccounts.find(
          ({ id }) => id === parsed.data.sourceAccountId,
        );
        if (!source) throw new Error("Geçerli kaynak hesap seçin.");
        return {
          ...base,
          type: "expense",
          sourceAccountId: source.id,
          sourceKind: accountKind(source),
          categoryId: parsed.data.categoryId,
        };
      }
      if (parsed.data.type === "income") {
        const target = transactionAccounts.find(
          ({ id }) => id === parsed.data.targetAccountId,
        );
        if (!target) throw new Error("Geçerli hedef hesap seçin.");
        return {
          ...base,
          type: "income",
          targetAccountId: target.id,
          targetKind: accountKind(target),
          categoryId: parsed.data.categoryId,
          incomeClass: "normal",
        };
      }
      const source = transactionAccounts.find(
        ({ id }) => id === parsed.data.sourceAccountId,
      );
      const target = transactionAccounts.find(
        ({ id }) => id === parsed.data.targetAccountId,
      );
      if (!source || !target) throw new Error("Kaynak ve hedef hesap seçin.");
      return {
        ...base,
        type: "transfer",
        sourceAccountId: source.id,
        sourceKind: accountKind(source),
        targetAccountId: target.id,
        targetKind: accountKind(target),
        ...(parsed.data.feeInput
          ? { feeAmount: parseTrMoney(parsed.data.feeInput).toCanonical() }
          : {}),
      };
    },
    [transactionAccounts],
  );

  const requestPreview = useCallback(
    async (candidate: TransactionEntryDraft) => {
      const command = buildCommand(candidate);
      return jsonRequest<PreviewResult>("/api/v1/transactions/preview", {
        method: "POST",
        body: JSON.stringify(command),
      });
    },
    [buildCommand],
  );

  useEffect(() => {
    setPreview(null);
    setPreviewError("");
    const parsed = transactionEntryDraftSchema.safeParse(draft);
    if (!parsed.success) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      requestPreview(parsed.data)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch((error) => {
          if (!cancelled) {
            setPreviewError(
              error instanceof Error ? error.message : "Etki hesaplanamadı.",
            );
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    draft.type,
    draft.amountInput,
    draft.date,
    draft.sourceAccountId,
    draft.targetAccountId,
    draft.categoryId,
    draft.feeInput,
    requestPreview,
  ]);

  function openEntry() {
    setEntryOpen(true);
    setNotice("");
    window.setTimeout(() => entryHeading.current?.focus(), 0);
  }

  async function submitEntry(candidate: TransactionEntryDraft) {
    const parsed = transactionEntryDraftSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          setError(field as keyof TransactionEntryDraft, {
            type: "validate",
            message: issue.message,
          });
        }
      }
      return;
    }
    setSaving(true);
    setPreviewError("");
    try {
      const freshPreview = await requestPreview(parsed.data);
      const command = buildCommand(parsed.data);
      await jsonRequest("/api/v1/transactions", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          command,
          previewHash: freshPreview.previewHash,
        }),
      });
      setNotice(`${transactionLabels[command.type]} kaydedildi.`);
      setEntryOpen(false);
      setPreview(null);
      reset({
        type: "expense",
        amountInput: "",
        date: todayInIstanbul(),
        sourceAccountId: "",
        targetAccountId: "",
        categoryId: "",
        feeInput: "",
      });
      await loadData();
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "İşlem kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(queryString);
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(next.size ? `/?${next.toString()}` : "/", { scroll: false });
  }

  async function createAccount(input: AccountDraft) {
    const candidate = {
      name: input.name,
      accountType: input.accountType,
      currency: input.currency,
      openingDate: input.openingDate,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
    };
    const parsed = financialAccountCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      accountForm.setError("name", {
        message: "Hesap bilgilerini kontrol edin.",
      });
      return;
    }
    try {
      await jsonRequest("/api/v1/accounts", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      accountForm.reset({
        name: "",
        accountType: "bank",
        currency: "TRY",
        openingDate: todayInIstanbul(),
        institutionId: "",
      });
      setNotice("Hesap oluşturuldu.");
      await loadData();
    } catch (error) {
      accountForm.setError("name", {
        message:
          error instanceof Error ? error.message : "Hesap oluşturulamadı.",
      });
    }
  }

  async function createInstitution(input: InstitutionDraft) {
    const parsed = institutionCreateSchema.safeParse(input);
    if (!parsed.success) {
      institutionForm.setError("name", {
        message: "Kurum bilgilerini kontrol edin.",
      });
      return;
    }
    try {
      await jsonRequest("/api/v1/institutions", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      institutionForm.reset({ name: "", institutionType: "bank" });
      setNotice("Kurum oluşturuldu.");
      await loadData();
    } catch (error) {
      institutionForm.setError("name", {
        message:
          error instanceof Error ? error.message : "Kurum oluşturulamadı.",
      });
    }
  }

  async function createCategory(input: CategoryDraft) {
    const parsed = categoryCreateSchema.safeParse(input);
    if (!parsed.success) {
      categoryForm.setError("name", {
        message: "Kategori bilgilerini kontrol edin.",
      });
      return;
    }
    try {
      await jsonRequest("/api/v1/categories", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      categoryForm.reset({ name: "", categoryType: "expense" });
      setNotice("Kategori oluşturuldu.");
      await loadData();
    } catch (error) {
      categoryForm.setError("name", {
        message:
          error instanceof Error ? error.message : "Kategori oluşturulamadı.",
      });
    }
  }

  async function archiveAccount(account: FinancialAccount) {
    try {
      await jsonRequest(`/api/v1/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "if-match": String(account.rowVersion) },
        body: JSON.stringify({ status: "archived" }),
      });
      setNotice(`${account.name} arşivlendi.`);
      await loadData();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Hesap arşivlenemedi.",
      );
    }
  }

  const netWorth = useMemo(() => exactNetWorth(accounts), [accounts]);
  const selectedSource = accounts.find(
    ({ id }) => id === draft.sourceAccountId,
  );
  const selectedTarget = accounts.find(
    ({ id }) => id === draft.targetAccountId,
  );
  const entryAmount = useMemo(() => {
    try {
      return parseTrMoney(draft.amountInput);
    } catch {
      return null;
    }
  }, [draft.amountInput]);
  const feeAmount = useMemo(() => {
    try {
      return draft.feeInput ? parseTrMoney(draft.feeInput) : Money.zero("TRY");
    } catch {
      return null;
    }
  }, [draft.feeInput]);
  const sourceOutflow = useMemo(() => {
    if (!entryAmount) return null;
    if (draft.type !== "transfer") return entryAmount;
    return entryAmount.add(feeAmount ?? Money.zero("TRY"));
  }, [draft.type, entryAmount, feeAmount]);

  return (
    <main className="app-shell pb-28 md:pb-12">
      <header className="app-header">
        <div>
          <p className="eyebrow">Kişisel Finans İşletim Sistemi</p>
          <h1>Bugünün finans görünümü</h1>
          <p className="muted">Ledger kaynaklı, güncel ve denetlenebilir.</p>
        </div>
        <div className="header-actions">
          <button
            className="secondary-button"
            onClick={() => setSetupOpen((open) => !open)}
            type="button"
          >
            Hesapları yönet
          </button>
          {!entryOpen && (
            <button
              className="primary-button desktop-primary"
              onClick={openEntry}
              type="button"
            >
              + İşlem
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <section className="error-banner" role="alert">
          <strong>Finans verisi açılamadı.</strong>
          <span>{loadError}</span>
          {loadError.includes("Oturum") && (
            <a href="/auth">Güvenli girişe git</a>
          )}
        </section>
      )}
      {notice && (
        <p className="notice-banner" role="status">
          {notice}
        </p>
      )}

      <section className="metric-grid" aria-label="Finans özeti">
        <article className="metric-card metric-card-hero">
          <span>Net servet</span>
          <strong data-testid="net-worth">
            {exactDisplay(netWorth.toCanonical())}
          </strong>
          <small>Aktif hesapların ledger projection toplamı</small>
        </article>
        <article className="metric-card">
          <span>Bu dönem gelir</span>
          <strong data-testid="period-income">
            {exactDisplay(dashboard.aggregate.normalIncome)}
          </strong>
          <small>Normal gelir sınıflandırması</small>
        </article>
        <article className="metric-card">
          <span>Bu dönem gider</span>
          <strong data-testid="period-expense">
            {exactDisplay(dashboard.aggregate.personalExpense)}
          </strong>
          <small>Transfer anaparası hariç</small>
        </article>
        <article className="metric-card">
          <span>Dönem neti</span>
          <strong data-testid="period-net">
            {exactDisplay(dashboard.aggregate.net)}
          </strong>
          <small>Aynı geçmiş filtresinden</small>
        </article>
      </section>

      <CardWorkspace
        accounts={accounts}
        categories={categories}
        onCommitted={loadData}
      />

      <SubscriptionWorkspace
        accounts={accounts}
        categories={categories}
        onCommitted={loadData}
      />

      <ReceivablesWorkspace accounts={accounts} onCommitted={loadData} />

      {setupOpen && (
        <section className="panel setup-panel" aria-labelledby="setup-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Başlangıç ve bakım</p>
              <h2 id="setup-title">Hesaplarını hazırla</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setSetupOpen(false)}
              type="button"
            >
              Kapat
            </button>
          </div>
          <div className="setup-grid">
            <form onSubmit={institutionForm.handleSubmit(createInstitution)}>
              <h3>Kurum ekle</h3>
              <label>
                Ad
                <input {...institutionForm.register("name")} />
              </label>
              <label>
                Tür
                <select {...institutionForm.register("institutionType")}>
                  <option value="bank">Banka</option>
                  <option value="wallet">Cüzdan</option>
                  <option value="broker">Aracı kurum</option>
                  <option value="other">Diğer</option>
                </select>
              </label>
              <FieldError
                id="institution-name-error"
                message={institutionForm.formState.errors.name?.message}
              />
              <button className="secondary-button" type="submit">
                Kurum oluştur
              </button>
            </form>
            <form onSubmit={accountForm.handleSubmit(createAccount)}>
              <h3>Hesap ekle</h3>
              <label>
                Hesap adı
                <input {...accountForm.register("name")} />
              </label>
              <label>
                Tür
                <select {...accountForm.register("accountType")}>
                  <option value="bank">Banka</option>
                  <option value="cash">Nakit</option>
                  <option value="wallet">Cüzdan</option>
                  <option value="credit_card">Kredi kartı</option>
                  <option value="investment">Yatırım</option>
                </select>
              </label>
              <label>
                Kurum
                <select {...accountForm.register("institutionId")}>
                  <option value="">Kurumsuz</option>
                  {institutions
                    .filter(({ active }) => active)
                    .map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="two-columns">
                <label>
                  Para
                  <input maxLength={3} {...accountForm.register("currency")} />
                </label>
                <label>
                  Açılış tarihi
                  <input type="date" {...accountForm.register("openingDate")} />
                </label>
              </div>
              <FieldError
                id="account-name-error"
                message={accountForm.formState.errors.name?.message}
              />
              <button className="secondary-button" type="submit">
                Hesap oluştur
              </button>
            </form>
            <form onSubmit={categoryForm.handleSubmit(createCategory)}>
              <h3>Kategori ekle</h3>
              <label>
                Ad
                <input {...categoryForm.register("name")} />
              </label>
              <label>
                Tür
                <select {...categoryForm.register("categoryType")}>
                  <option value="expense">Gider</option>
                  <option value="income">Gelir</option>
                </select>
              </label>
              <FieldError
                id="category-name-error"
                message={categoryForm.formState.errors.name?.message}
              />
              <button className="secondary-button" type="submit">
                Kategori oluştur
              </button>
            </form>
          </div>
        </section>
      )}

      {entryOpen && (
        <section className="entry-layout" aria-labelledby="entry-title">
          <form
            className="panel entry-form"
            onSubmit={handleSubmit(submitEntry)}
            noValidate
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Hızlı yol</p>
                <h2 id="entry-title" ref={entryHeading} tabIndex={-1}>
                  Yeni işlem
                </h2>
              </div>
              <button
                className="text-button"
                onClick={() => setEntryOpen(false)}
                type="button"
              >
                Vazgeç
              </button>
            </div>
            <fieldset className="type-switcher">
              <legend className="sr-only">İşlem türü</legend>
              {(["expense", "income", "transfer"] as const).map((type) => (
                <label
                  key={type}
                  className={draft.type === type ? "selected" : ""}
                >
                  <input type="radio" value={type} {...register("type")} />
                  {transactionLabels[type]}
                </label>
              ))}
            </fieldset>
            <label htmlFor="entry-amount">
              Tutar
              <input
                id="entry-amount"
                inputMode="decimal"
                placeholder="427,50"
                aria-describedby="amount-help amount-error"
                {...register("amountInput", { required: "Tutar gerekli." })}
              />
            </label>
            <p className="field-help" id="amount-help">
              Türkçe biçim kullan: 1.250,00
            </p>
            <FieldError
              id="amount-error"
              message={errors.amountInput?.message}
            />
            <label htmlFor="entry-date">
              Tarih
              <input
                id="entry-date"
                type="date"
                {...register("date", { required: "Tarih gerekli." })}
              />
            </label>
            {(draft.type === "expense" || draft.type === "transfer") && (
              <label htmlFor="source-account">
                Kaynak hesap
                <select
                  id="source-account"
                  aria-describedby="source-error"
                  {...register("sourceAccountId")}
                >
                  <option value="">Hesap seç</option>
                  {transactionAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <FieldError
              id="source-error"
              message={errors.sourceAccountId?.message}
            />
            {(draft.type === "income" || draft.type === "transfer") && (
              <label htmlFor="target-account">
                Hedef hesap
                <select
                  id="target-account"
                  aria-describedby="target-error"
                  {...register("targetAccountId")}
                >
                  <option value="">Hesap seç</option>
                  {transactionAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <FieldError
              id="target-error"
              message={errors.targetAccountId?.message}
            />
            {(draft.type === "expense" || draft.type === "income") && (
              <label htmlFor="entry-category">
                Kategori
                <select
                  id="entry-category"
                  aria-describedby="category-error"
                  {...register("categoryId")}
                >
                  <option value="">Kategori seç</option>
                  {categories
                    .filter(({ categoryType }) => categoryType === draft.type)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <FieldError
              id="category-error"
              message={errors.categoryId?.message}
            />
            {draft.type === "transfer" && (
              <label htmlFor="entry-fee">
                Transfer ücreti <span className="optional">İsteğe bağlı</span>
                <input
                  id="entry-fee"
                  inputMode="decimal"
                  placeholder="0,00"
                  {...register("feeInput")}
                />
              </label>
            )}
            <button
              className="primary-button save-button"
              disabled={saving}
              type="submit"
            >
              {saving ? "Kaydediliyor…" : "İşlemi kaydet"}
            </button>
          </form>

          <aside
            className="panel impact-panel"
            aria-live="polite"
            aria-label="İşlem etki özeti"
          >
            <p className="eyebrow">Kaydetmeden önce</p>
            <h2>Etki özeti</h2>
            {!preview && !previewError && (
              <p className="muted">
                Alanları tamamladığında kesin ledger önizlemesi burada görünür.
              </p>
            )}
            {previewError && (
              <p className="field-error" role="alert">
                {previewError}
              </p>
            )}
            {preview && (
              <div className="impact-stack" data-testid="effect-summary">
                {(draft.type === "expense" || draft.type === "transfer") &&
                  selectedSource &&
                  sourceOutflow && (
                    <div className="impact-row">
                      <span>{selectedSource.name}</span>
                      <span>
                        {exactDisplay(
                          selectedSource.balance.calculatedOriginal,
                          selectedSource.currency,
                        )}{" "}
                        →{" "}
                        <strong>
                          {exactDisplay(
                            Money.from(
                              selectedSource.balance.calculatedOriginal,
                              selectedSource.currency,
                            )
                              .subtract(sourceOutflow)
                              .toCanonical(),
                            selectedSource.currency,
                          )}
                        </strong>
                      </span>
                    </div>
                  )}
                {(draft.type === "income" || draft.type === "transfer") &&
                  selectedTarget &&
                  entryAmount && (
                    <div className="impact-row">
                      <span>{selectedTarget.name}</span>
                      <span>
                        {exactDisplay(
                          selectedTarget.balance.calculatedOriginal,
                          selectedTarget.currency,
                        )}{" "}
                        →{" "}
                        <strong>
                          {exactDisplay(
                            Money.from(
                              selectedTarget.balance.calculatedOriginal,
                              selectedTarget.currency,
                            )
                              .add(entryAmount)
                              .toCanonical(),
                            selectedTarget.currency,
                          )}
                        </strong>
                      </span>
                    </div>
                  )}
                <div className="impact-row">
                  <span>Gider etkisi</span>
                  <strong>
                    {exactDisplay(preview.effects.personalExpenseDelta)}
                  </strong>
                </div>
                <div className="impact-row">
                  <span>Gelir etkisi</span>
                  <strong>
                    {exactDisplay(preview.effects.normalIncomeDelta)}
                  </strong>
                </div>
                <div className="impact-row">
                  <span>Net servet etkisi</span>
                  <strong>{exactDisplay(preview.effects.netWorthDelta)}</strong>
                </div>
                <small>Motor: {preview.engineVersion}</small>
              </div>
            )}
          </aside>
        </section>
      )}

      <section className="content-grid">
        <article className="panel accounts-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Projection</p>
              <h2>Hesaplar</h2>
            </div>
            <span className="count-pill">{activeAccounts.length}</span>
          </div>
          <div className="account-list">
            {activeAccounts.length === 0 && !loading && (
              <p className="empty-state">
                İlk hesabını “Hesapları yönet” alanından ekle.
              </p>
            )}
            {activeAccounts.map((account) => (
              <div className="account-row" key={account.id}>
                <div className="account-mark" aria-hidden="true">
                  {account.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                </div>
                <div>
                  <strong>{account.name}</strong>
                  <small>{account.accountType.replace("_", " ")}</small>
                </div>
                <div className="account-value">
                  <strong>
                    {exactDisplay(
                      account.balance.calculatedOriginal,
                      account.currency,
                    )}
                  </strong>
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => void archiveAccount(account)}
                  >
                    Arşivle
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article
          className="panel history-panel"
          aria-labelledby="history-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Banka dökümü görünümü</p>
              <h2 id="history-title">Geçmiş</h2>
            </div>
            {loading && <span className="muted">Yükleniyor…</span>}
          </div>
          <div className="filter-grid" aria-label="Geçmiş filtreleri">
            <label htmlFor="history-period-from">
              Başlangıç
              <input
                id="history-period-from"
                type="date"
                value={searchParams.get("period_from") ?? ""}
                onChange={(event) =>
                  setFilter("period_from", event.target.value)
                }
              />
            </label>
            <label htmlFor="history-period-to">
              Bitiş
              <input
                id="history-period-to"
                type="date"
                value={searchParams.get("period_to") ?? ""}
                onChange={(event) => setFilter("period_to", event.target.value)}
              />
            </label>
            <label htmlFor="history-account-filter">
              Hesap
              <select
                id="history-account-filter"
                value={searchParams.get("account") ?? ""}
                onChange={(event) => setFilter("account", event.target.value)}
              >
                <option value="">Tümü</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="history-type-filter">
              Tür
              <select
                id="history-type-filter"
                value={searchParams.get("type") ?? ""}
                onChange={(event) => setFilter("type", event.target.value)}
              >
                <option value="">Tümü</option>
                <option value="expense">Gider</option>
                <option value="income">Gelir</option>
                <option value="transfer">Transfer</option>
                <option value="opening_balance">Açılış</option>
              </select>
            </label>
            <label htmlFor="history-category-filter">
              Kategori
              <select
                id="history-category-filter"
                value={searchParams.get("category") ?? ""}
                onChange={(event) => setFilter("category", event.target.value)}
              >
                <option value="">Tümü</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="history-list" data-testid="history-list">
            {history.items.length === 0 && !loading && (
              <p className="empty-state">Bu filtrede hareket yok.</p>
            )}
            {history.items.map((item) => (
              <article className="history-row" key={item.id}>
                <div>
                  <strong>{transactionLabels[item.type] ?? item.type}</strong>
                  <small>
                    {item.economicDate} · {item.engineVersion}
                  </small>
                </div>
                <strong
                  className={
                    item.type === "income"
                      ? "positive"
                      : item.type === "expense"
                        ? "negative"
                        : ""
                  }
                >
                  {exactDisplay(item.amount, item.currency)}
                </strong>
              </article>
            ))}
          </div>
          <div className="history-total" data-testid="history-aggregate">
            <span>Filtrelenmiş toplam</span>
            <span>
              Gelir {exactDisplay(history.aggregate.normalIncome)} · Gider{" "}
              {exactDisplay(history.aggregate.personalExpense)}
            </span>
          </div>
        </article>
      </section>

      {!entryOpen && (
        <button
          className="primary-button mobile-primary"
          onClick={openEntry}
          type="button"
        >
          + İşlem
        </button>
      )}
    </main>
  );
}
