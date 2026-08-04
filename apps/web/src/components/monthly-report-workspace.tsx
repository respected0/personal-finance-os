"use client";

import { formatTrMoney, Money } from "@personal-finance-os/domain";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Account {
  readonly id: string;
  readonly name: string;
  readonly status: "active" | "archived";
}

interface Category {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

interface Report {
  readonly id: string | null;
  readonly period: string;
  readonly version: number | null;
  readonly source: "live" | "version";
  readonly sourceHighWatermark: string;
  readonly engineVersion: string;
  readonly ruleVersion: string;
  readonly checksum: string;
  readonly metrics: {
    readonly income: string;
    readonly grossExpense: string;
    readonly refunds: string;
    readonly netExpense: string;
    readonly outflow: string;
    readonly savings: string;
    readonly breakdown: readonly {
      readonly categoryId: string | null;
      readonly income: string;
      readonly grossExpense: string;
      readonly refunds: string;
      readonly netExpense: string;
    }[];
    readonly trend: readonly {
      readonly date: string;
      readonly income: string;
      readonly netExpense: string;
      readonly savings: string;
    }[];
  };
}

interface Problem {
  readonly title?: string;
  readonly code?: string;
}

function currentPeriod(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function display(value: string): string {
  return `${formatTrMoney(Money.from(value, "TRY"))} TRY`;
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
        ? "Sürüm oluşturmak için AAL2 doğrulaması gerekiyor."
        : (problem.title ?? "Aylık rapor yüklenemedi."),
    );
  }
  return body as T;
}

export function MonthlyReportWorkspace({
  accounts,
  categories,
  refreshToken,
}: {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly refreshToken: string;
}) {
  const [period, setPeriod] = useState(currentPeriod());
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [version, setVersion] = useState("latest");
  const [reason, setReason] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [decision, setDecision] = useState("hold");

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ version });
      if (accountId) query.set("account", accountId);
      if (categoryId) query.set("category", categoryId);
      const next = await request<Report>(
        `/api/v1/reports/monthly/${period}?${query.toString()}`,
      );
      setReport(next);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Aylık rapor yüklenemedi.",
      );
    }
  }, [accountId, categoryId, period, version]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function preserveVersion(event: React.FormEvent) {
    event.preventDefault();
    try {
      const created = await request<Report>(
        `/api/v1/reports/monthly/${period}/versions`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      setAccountId("");
      setCategoryId("");
      setVersion(String(created.version));
      setReport(created);
      setReason("");
      setNotice(
        `Aylık rapor v${created.version} değişmez kanıt olarak saklandı.`,
      );
      setError("");
    } catch (versionError) {
      setError(
        versionError instanceof Error
          ? versionError.message
          : "Rapor sürümü oluşturulamadı.",
      );
    }
  }

  async function completeReview(event: React.FormEvent) {
    event.preventDefault();
    if (!report?.id || report.source !== "version") {
      setError("Aylık inceleme önce değişmez bir rapor sürümü gerektirir.");
      return;
    }
    try {
      const investable = await request<{ readonly id: string }>(
        "/api/v1/planning/investable-runs",
      );
      await request("/api/v1/monthly-reviews", {
        method: "POST",
        body: JSON.stringify({
          period,
          reportVersionId: report.id,
          investableRunId: investable.id,
          checklist: {
            report: true,
            budget: true,
            goals: true,
            investments: true,
            recommendations: true,
          },
          decision,
        }),
      });
      setNotice(
        `Aylık inceleme rapor v${report.version} ve kanonik yatırılabilir run ile tamamlandı.`,
      );
      setError("");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Aylık inceleme tamamlanamadı.",
      );
    }
  }

  return (
    <section
      className="panel monthly-report-workspace"
      aria-labelledby="monthly-report-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Ledger raporu</p>
          <h2 id="monthly-report-title">Aylık rapor</h2>
          <p className="muted">
            Transfer, kart ödeme, yatırım anaparası ve alacak tahsilatı gelir ya
            da gider olarak çift sayılmaz.
          </p>
        </div>
        {report && (
          <span className="count-pill">
            {report.source === "live" ? "Canlı" : `Sürüm ${report.version}`}
          </span>
        )}
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
      <div className="report-filter-grid">
        <label>
          Dönem
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </label>
        <label>
          Hesap
          <select
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setVersion("latest");
            }}
          >
            <option value="">Tümü</option>
            {accounts
              .filter(({ status }) => status === "active")
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Kategori
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setVersion("latest");
            }}
          >
            <option value="">Tümü</option>
            {categories
              .filter(({ active }) => active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Görünüm
          <input
            value={version}
            onChange={(event) => setVersion(event.target.value || "latest")}
            disabled={Boolean(accountId || categoryId)}
          />
        </label>
      </div>
      {report && (
        <>
          <div className="report-metric-grid">
            <article>
              <span>Gelir</span>
              <strong>{display(report.metrics.income)}</strong>
            </article>
            <article>
              <span>Brüt gider</span>
              <strong>{display(report.metrics.grossExpense)}</strong>
            </article>
            <article>
              <span>İade / cashback</span>
              <strong>{display(report.metrics.refunds)}</strong>
            </article>
            <article>
              <span>Net gider</span>
              <strong data-testid="report-expense">
                {display(report.metrics.netExpense)}
              </strong>
            </article>
            <article>
              <span>Çıkış</span>
              <strong>{display(report.metrics.outflow)}</strong>
            </article>
            <article>
              <span>Tasarruf</span>
              <strong>{display(report.metrics.savings)}</strong>
            </article>
          </div>
          <div className="report-detail-grid">
            <div>
              <h3>Kategori kırılımı</h3>
              {report.metrics.breakdown.map((row) => (
                <p key={row.categoryId ?? "uncategorized"}>
                  <strong>
                    {row.categoryId
                      ? (categoryNames.get(row.categoryId) ??
                        "Arşivli kategori")
                      : "Kategorisiz"}
                  </strong>
                  <span>
                    Net {display(row.netExpense)} · Gelir {display(row.income)}
                  </span>
                </p>
              ))}
            </div>
            <div>
              <h3>Günlük trend</h3>
              {report.metrics.trend.map((row) => (
                <p key={row.date}>
                  <strong>{row.date}</strong>
                  <span>
                    Net gider {display(row.netExpense)} · Tasarruf{" "}
                    {display(row.savings)}
                  </span>
                </p>
              ))}
            </div>
          </div>
          <p className="report-trace">
            Watermark {report.sourceHighWatermark} · {report.engineVersion} ·{" "}
            {report.ruleVersion} · {report.checksum.slice(0, 12)}…
          </p>
        </>
      )}
      <form className="report-version-form" onSubmit={preserveVersion}>
        <label>
          Sürüm oluşturma gerekçesi
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
          />
        </label>
        <button className="secondary-button" type="submit">
          Yeni sürümü koru
        </button>
      </form>
      <form className="report-version-form" onSubmit={completeReview}>
        <div>
          <h3>10 dakikalık aylık inceleme</h3>
          <p className="muted">
            Rapor → bütçe → hedef → yatırım → öneri kontrol listesi tek akışta
            tamamlanır; kaynak sürümler sonradan değişmez.
          </p>
        </div>
        <label>
          Karar
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
          >
            <option value="hold">Planı koru</option>
            <option value="adjust_budget">Bütçeyi ayarla</option>
            <option value="adjust_goal">Hedefi ayarla</option>
            <option value="review_investment">
              Yatırımı yeniden değerlendir
            </option>
          </select>
        </label>
        <button className="secondary-button" type="submit">
          İncelemeyi tamamla
        </button>
      </form>
    </section>
  );
}
