"use client";

import { useState } from "react";

interface ExportResult {
  readonly id: string;
  readonly format: "csv" | "full_fidelity";
  readonly checksum: string;
  readonly expiresAt: string;
  readonly contentBase64: string | null;
}

interface DeletionResult {
  readonly id: string;
  readonly status: "pending" | "cancelled";
  readonly scheduledFor: string;
  readonly backupExpiresAt: string;
}

interface Problem {
  readonly title?: string;
  readonly code?: string;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = (await response.json()) as T | Problem;
  if (!response.ok) {
    const problem = body as Problem;
    throw new Error(
      problem.code === "step_up_required"
        ? "Bu hassas işlem için son 5 dakika içinde TOTP doğrulaması yapın."
        : (problem.title ?? "Veri yaşam döngüsü işlemi tamamlanamadı."),
    );
  }
  return body as T;
}

export function DataLifecycleWorkspace() {
  const [totpCode, setTotpCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [deletion, setDeletion] = useState<DeletionResult | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function establishStepUp() {
    try {
      await request<{ verifiedAt: string; expiresAt: string }>(
        "/api/v1/auth/step-up",
        { method: "POST", body: JSON.stringify({ code: totpCode }) },
      );
      setTotpCode("");
      setNotice(
        "TOTP doğrulandı; hassas işlemler için 5 dakikalık pencere açıldı.",
      );
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "TOTP doğrulanamadı.",
      );
    }
  }

  async function createExport(format: "csv" | "full_fidelity") {
    try {
      const result = await request<ExportResult>("/api/v1/exports", {
        method: "POST",
        body: JSON.stringify({
          format,
          scope: ["all-owned-data"],
          ...(format === "full_fidelity" ? { passphrase } : {}),
        }),
      });
      setLastExport(result);
      setPassphrase("");
      setError("");
      setNotice(
        format === "csv"
          ? "UTF-8 CSV paketi hazırlandı; geri yükleme kaynağı değildir."
          : "Şifreli tam sadakatli yedek ve checksum hazırlandı.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Export oluşturulamadı.",
      );
    }
  }

  async function requestDeletion() {
    try {
      const result = await request<DeletionResult>(
        "/api/v1/account/deletion-requests",
        {
          method: "POST",
          body: JSON.stringify({ confirmation: "HESABIMI SIL" }),
        },
      );
      setDeletion(result);
      setNotice("7 günlük iptal edilebilir silme bekleme süresi başladı.");
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Silme talebi başlatılamadı.",
      );
    }
  }

  async function cancelDeletion() {
    if (!deletion) return;
    try {
      const result = await request<DeletionResult>(
        `/api/v1/account/deletion-requests/${deletion.id}`,
        { method: "DELETE" },
      );
      setDeletion(result);
      setNotice("Silme talebi bekleme süresi içinde iptal edildi.");
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Silme talebi iptal edilemedi.",
      );
    }
  }

  return (
    <section
      className="panel data-lifecycle-workspace"
      aria-labelledby="data-lifecycle-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Taşınabilirlik ve hesap yaşam döngüsü</p>
          <h2 id="data-lifecycle-title">Verilerim</h2>
          <p className="muted">
            Export, restore ve hesap silme işlemleri son 5 dakika içinde TOTP
            step-up doğrulaması gerektirir.
          </p>
        </div>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      <div className="sensitive-step-up">
        <label>
          6 haneli TOTP kodu
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={totpCode}
            onChange={(event) =>
              setTotpCode(event.target.value.replace(/\D/gu, ""))
            }
          />
        </label>
        <button
          type="button"
          disabled={totpCode.length !== 6}
          onClick={() => void establishStepUp()}
        >
          Hassas işlem doğrulaması
        </button>
      </div>
      <div className="data-lifecycle-grid">
        <article>
          <h3>Dışa aktar</h3>
          <p className="muted">
            CSV insan incelemesi içindir. Tam yedek ZIP içeriği Argon2id ve
            AES-256-GCM ile korunur.
          </p>
          <label>
            Recovery passphrase
            <input
              type="password"
              minLength={12}
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => void createExport("csv")}
            >
              CSV hazırla
            </button>
            <button
              type="button"
              disabled={passphrase.length < 12}
              onClick={() => void createExport("full_fidelity")}
            >
              Şifreli yedek hazırla
            </button>
          </div>
          {lastExport && (
            <p className="trace-line">
              {lastExport.format} · checksum {lastExport.checksum.slice(0, 12)}…
              · son erişim{" "}
              {new Date(lastExport.expiresAt).toLocaleTimeString("tr-TR")}
            </p>
          )}
        </article>
        <article>
          <h3>Hesabı sil</h3>
          <p className="muted">
            Aktif veriler, exportlar, oturumlar ve anahtar ilişkileri kapsam
            içindedir. Provider backup son yok olma tarihi receipt üzerinde
            tutulur.
          </p>
          {deletion?.status === "pending" ? (
            <>
              <p>
                Planlanan purge:{" "}
                {new Date(deletion.scheduledFor).toLocaleString("tr-TR")}
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void cancelDeletion()}
              >
                Silme talebini iptal et
              </button>
            </>
          ) : (
            <button
              type="button"
              className="danger-button"
              onClick={() => void requestDeletion()}
            >
              7 günlük silme sürecini başlat
            </button>
          )}
        </article>
      </div>
    </section>
  );
}
