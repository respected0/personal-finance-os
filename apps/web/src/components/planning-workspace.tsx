"use client";

import { formatTrMoney, Money } from "@personal-finance-os/domain";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Account {
  readonly id: string;
  readonly name: string;
  readonly accountType: string;
  readonly status: "active" | "archived";
  readonly balance: { readonly calculatedBase: string };
}
interface Category {
  readonly id: string;
  readonly name: string;
  readonly categoryType: "income" | "expense";
  readonly active: boolean;
}
interface BudgetLine {
  readonly id: string;
  readonly categoryId: string;
  readonly plannedAmount: string;
  readonly actualAmount: string;
  readonly forecastAmount: string;
  readonly thresholdReached: boolean;
}
interface Budget {
  readonly id: string;
  readonly period: string;
  readonly status: "draft" | "active" | "archived";
  readonly rowVersion: number;
  readonly actualFormula: string;
  readonly forecastFormula: string;
  readonly lines: readonly BudgetLine[];
}
interface Goal {
  readonly id: string;
  readonly title: string;
  readonly targetAmount: string;
  readonly targetDate: string;
  readonly priority: number;
  readonly riskLevel: "low" | "medium" | "high";
  readonly status: "active" | "completed" | "archived";
  readonly rowVersion: number;
  readonly allocatedValue: string;
  readonly actualContributionAmount: string;
  readonly progressAmount: string;
  readonly ledgerPostingCount: 0;
}

function currentPeriod() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}
function display(value: string) {
  return `${formatTrMoney(Money.from(value, "TRY"))} TRY`;
}
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json()) as T | { title?: string };
  if (!response.ok) {
    const error = new Error(
      (body as { title?: string }).title ?? "Planlama isteği tamamlanamadı.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body as T;
}

export function PlanningWorkspace({
  accounts,
  categories,
  refreshToken,
}: {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly refreshToken: string;
}) {
  const [period, setPeriod] = useState(currentPeriod());
  const [budget, setBudget] = useState<Budget | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [goals, setGoals] = useState<readonly Goal[]>([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [selectedGoal, setSelectedGoal] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const expenseCategories = useMemo(
    () =>
      categories.filter(
        (item) => item.active && item.categoryType === "expense",
      ),
    [categories],
  );

  const load = useCallback(async () => {
    const [goalResult, budgetResult] = await Promise.allSettled([
      json<readonly Goal[]>("/api/v1/goals"),
      json<Budget>(`/api/v1/budgets/${period}`),
    ]);
    if (goalResult.status === "fulfilled") setGoals(goalResult.value);
    if (budgetResult.status === "fulfilled") {
      setBudget(budgetResult.value);
      setAmounts(
        Object.fromEntries(
          budgetResult.value.lines.map((line) => [
            line.categoryId,
            line.plannedAmount,
          ]),
        ),
      );
    } else if ((budgetResult.reason as { status?: number }).status === 404) {
      setBudget(null);
      setAmounts({});
    } else {
      setError("Planlama verileri yüklenemedi.");
    }
  }, [period]);
  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    try {
      const lines = expenseCategories.flatMap((category) => {
        const value = amounts[category.id]?.trim();
        return value
          ? [
              {
                categoryId: category.id,
                plannedAmount: value.replace(",", "."),
                rolloverPolicy: "none",
                warningThreshold: "0.8000",
              },
            ]
          : [];
      });
      const saved = await json<Budget>(`/api/v1/budgets/${period}`, {
        method: "PUT",
        headers: { "if-match": String(budget?.rowVersion ?? 0) },
        body: JSON.stringify({ status: "active", lines }),
      });
      setBudget(saved);
      setNotice("Aylık bütçe exact decimal değerlerle güncellendi.");
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Bütçe kaydedilemedi.",
      );
    }
  }

  async function addGoal(event: React.FormEvent) {
    event.preventDefault();
    try {
      await json<Goal>("/api/v1/goals", {
        method: "POST",
        body: JSON.stringify({
          title: goalTitle,
          targetAmount: goalAmount.replace(",", "."),
          targetDate: goalDate,
          priority: 1,
          riskLevel: "low",
        }),
      });
      setGoalTitle("");
      setGoalAmount("");
      setGoalDate("");
      await load();
      setNotice("Hedef oluşturuldu; hesap bakiyesi ve net servet değişmedi.");
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Hedef oluşturulamadı.",
      );
    }
  }

  async function allocate(event: React.FormEvent) {
    event.preventDefault();
    const goal = goals.find((item) => item.id === selectedGoal);
    if (!goal) return;
    try {
      await json<Goal>(`/api/v1/goals/${goal.id}/allocations`, {
        method: "POST",
        headers: { "if-match": String(goal.rowVersion) },
        body: JSON.stringify({
          accountId: selectedAccount,
          allocatedValue: allocationAmount.replace(",", "."),
          effectiveFrom: new Date().toISOString().slice(0, 10),
        }),
      });
      setAllocationAmount("");
      await load();
      setNotice(
        "Sanal tahsis kaydedildi: ledger 0, bakiye 0, net servet 0 etki.",
      );
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Tahsis kaydedilemedi.",
      );
    }
  }

  return (
    <section
      className="panel planning-workspace"
      aria-labelledby="planning-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">P0-B planlama</p>
          <h2 id="planning-title">Bütçe ve hedefler</h2>
          <p className="muted">
            Tahsis sanaldır; bakiye ve net servet etkisi daima sıfırdır.
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
      <form className="management-form" onSubmit={saveBudget}>
        <label>
          Dönem
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </label>
        {expenseCategories.map((category) => (
          <label key={category.id}>
            {category.name} limiti
            <input
              inputMode="decimal"
              placeholder="0,0000"
              value={amounts[category.id] ?? ""}
              onChange={(event) =>
                setAmounts((current) => ({
                  ...current,
                  [category.id]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <button className="primary-button" type="submit">
          Bütçeyi kaydet
        </button>
      </form>
      {budget && (
        <div className="planning-grid" data-testid="budget-projection">
          {budget.lines.map((line) => (
            <article
              key={line.id}
              className={line.thresholdReached ? "warning-card" : ""}
            >
              <strong>
                {categories.find((item) => item.id === line.categoryId)?.name ??
                  "Kategori"}
              </strong>
              <span>Limit {display(line.plannedAmount)}</span>
              <span>Gerçekleşen {display(line.actualAmount)}</span>
              <span>Tahmin {display(line.forecastAmount)}</span>
              <small>
                {budget.actualFormula}; {budget.forecastFormula}
              </small>
            </article>
          ))}
        </div>
      )}
      <div className="planning-grid">
        <form className="management-form" onSubmit={addGoal}>
          <h3>Hedef oluştur</h3>
          <label>
            Hedef adı
            <input
              value={goalTitle}
              onChange={(event) => setGoalTitle(event.target.value)}
              required
            />
          </label>
          <label>
            Hedef tutarı
            <input
              inputMode="decimal"
              value={goalAmount}
              onChange={(event) => setGoalAmount(event.target.value)}
              required
            />
          </label>
          <label>
            Hedef tarihi
            <input
              type="date"
              value={goalDate}
              onChange={(event) => setGoalDate(event.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit">
            Hedef ekle
          </button>
        </form>
        <form className="management-form" onSubmit={allocate}>
          <h3>Sanal tahsis</h3>
          <label>
            Hedef
            <select
              value={selectedGoal}
              onChange={(event) => setSelectedGoal(event.target.value)}
              required
            >
              <option value="">Seç</option>
              {goals
                .filter((goal) => goal.status === "active")
                .map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Kaynak hesap
            <select
              value={selectedAccount}
              onChange={(event) => setSelectedAccount(event.target.value)}
              required
            >
              <option value="">Seç</option>
              {accounts
                .filter(
                  (account) =>
                    account.status === "active" &&
                    account.accountType !== "credit_card",
                )
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {display(account.balance.calculatedBase)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Tahsis değeri
            <input
              inputMode="decimal"
              value={allocationAmount}
              onChange={(event) => setAllocationAmount(event.target.value)}
              required
            />
          </label>
          <p className="muted">Etki: ledger 0 · bakiye 0 · net servet 0</p>
          <button className="primary-button" type="submit">
            Tahsis et
          </button>
        </form>
      </div>
      <div className="planning-grid" data-testid="goal-progress">
        {goals.map((goal) => (
          <article key={goal.id}>
            <strong>{goal.title}</strong>
            <span>
              İlerleme {display(goal.progressAmount)} /{" "}
              {display(goal.targetAmount)}
            </span>
            <span>
              Tahsis {display(goal.allocatedValue)} · Katkı{" "}
              {display(goal.actualContributionAmount)}
            </span>
            <small>
              Öncelik {goal.priority} · Risk {goal.riskLevel} · Ledger posting{" "}
              {goal.ledgerPostingCount}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
