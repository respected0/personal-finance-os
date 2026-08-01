import { Suspense } from "react";
import { DailyCoreApp } from "../components/daily-core-app";

export default function Home() {
  return (
    <Suspense
      fallback={<main className="app-shell">Finans özeti yükleniyor…</main>}
    >
      <DailyCoreApp />
    </Suspense>
  );
}
