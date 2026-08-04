"use client";

import { formatTrMoney, Money } from "@personal-finance-os/domain";
import { useCallback, useEffect, useState } from "react";

interface Recommendation {
  readonly id: string;
  readonly investableRunId: string;
  readonly ruleCode: string;
  readonly ruleVersion: number;
  readonly period: string;
  readonly usedThreshold: string;
  readonly observedAmount: string;
  readonly differenceAmount: string;
  readonly impactAmount: string;
  readonly alternativeAmount: string;
  readonly status: "active" | "later" | "dismissed" | "done";
  readonly evidence: {
    readonly formula: string;
    readonly sourceWatermark: string;
  };
}

function display(value: string): string {
  return `${formatTrMoney(Money.from(value, "TRY"))} TRY`;
}

function period(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export function RecommendationWorkspace({
  refreshToken,
}: {
  readonly refreshToken: string;
}) {
  const [items, setItems] = useState<readonly Recommendation[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/recommendations?period=${period()}`);
    if (!response.ok) throw new Error("Öneriler yüklenemedi.");
    setItems((await response.json()) as readonly Recommendation[]);
  }, []);

  useEffect(() => {
    void load().catch((reason) =>
      setError(
        reason instanceof Error ? reason.message : "Öneriler yüklenemedi.",
      ),
    );
  }, [load, refreshToken]);

  async function feedback(
    id: string,
    value: "helpful" | "later" | "dismissed" | "done",
  ) {
    const response = await fetch(`/api/v1/recommendations/${id}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback: value }),
    });
    if (!response.ok) {
      setError("Bu işlem için güncel AAL2 doğrulaması gerekiyor.");
      return;
    }
    setNotice("Geri bildirim sürümlü öneriye kaydedildi.");
    setError("");
    await load();
  }

  return (
    <section
      className="panel recommendation-workspace"
      aria-labelledby="recommendation-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">P0-B karar masası</p>
          <h2 id="recommendation-title">Açıklanabilir öneriler</h2>
          <p className="muted">
            Hedef, yatırım ve öneri aynı kanonik yatırılabilir tutar kanıtına
            bağlanır.
          </p>
        </div>
        <span className="count-pill">{items.length} öneri</span>
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
      {items.length === 0 && (
        <p className="empty-state">Bu dönem için etkin öneri yok.</p>
      )}
      <div className="recommendation-grid">
        {items.map((item) => (
          <article key={item.id} data-testid="recommendation-card">
            <h3>
              {item.ruleCode} · v{item.ruleVersion}
            </h3>
            <p>
              <strong>Kanonik tutar:</strong> {display(item.observedAmount)}
            </p>
            <p>
              <strong>Kullanılan eşik:</strong> {display(item.usedThreshold)}
            </p>
            <p>
              <strong>Fark:</strong> {display(item.differenceAmount)}
            </p>
            <p>
              <strong>Etki:</strong> {display(item.impactAmount)}
            </p>
            <p>
              <strong>Alternatif:</strong> {display(item.alternativeAmount)}
            </p>
            <small>
              Kaynak run: {item.investableRunId} · {item.evidence.formula}
            </small>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => void feedback(item.id, "helpful")}
              >
                Yararlı
              </button>
              <button
                type="button"
                onClick={() => void feedback(item.id, "later")}
              >
                Sonra
              </button>
              <button
                type="button"
                onClick={() => void feedback(item.id, "dismissed")}
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => void feedback(item.id, "done")}
              >
                Tamamlandı
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
