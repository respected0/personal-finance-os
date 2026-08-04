# Codex Devir Notu

- Devir tarihi: 2026-08-04 14:06 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036;
  P0-A2 B037–B050. Son doğrulanmış main SHA:
  `ace0d72cdce8828157df4b87a287b1be28826199`.
- Kısmen tamamlanan görev: P0-A3 B054–B056, branch
  `feat/p0-a3-monthly-reports`. Ledger-derived aggregate, typed/OpenAPI contract,
  AAL1/AAL2 routes, responsive report UI, immutable encrypted-reason versions,
  stale invalidation ve DB/API/browser-CI senaryosu eklendi. Yerel kabul ve
  `pnpm check` PASS; henüz commit/PR yok.
- Açık PR/CI: Yok. Son birleşen PR #17, B051–B053 için 10/10 CI PASS.
- Commitlenmemiş dosyalar: `git status --short` ile B054–B056 migration,
  report repository/contracts/API/UI/tests/workflow ve progress/handoff değişiklikleri.
- Son çalıştırılan komutlar: `pnpm db:smoke` PASS (iki eşit checksum, drift 0),
  `pnpm report:integration` PASS, `pnpm daily:api:integration` PASS ve tam
  `pnpm check` PASS (110 unit).
- Son FAIL ve kök neden: Bu dilimde FAIL yok. Önceki PR #17 `role=status`
  browser düzeltmesi yeni head üzerinde Auth/browser PASS oldu.
- Kalan kabul kriterleri: B054–B056 secret scan, commit/push/PR ve tüm CI;
  sonrasında P0-A3 B057–B061, formal G4. Ardından P0-B1, P0-B2, P0-B3 ve
  PRE-RC denetimi.
- Doğrudan devam talimatı: Branch'te `git diff --check` ve
  `pnpm security:secret-scan` çalıştır; commit/push/PR aç, `gh pr checks --watch`
  ile 10/10 sonucu bekle, yalnız PASS ise merge et ve B057–B060'a geç.
- İlk komutlar: `git status --short --branch`; `git diff --check`;
  `pnpm security:secret-scan`.
- Yapılmaması gerekenler: Değişiklikleri reset/restore/clean ile silme; history
  rewrite/force push yapma; formal G4 öncesi P0-B1'i main'e alma; production
  veya remote Supabase/Vercel kaynağı oluşturma.
- Oluşturulmayan production kaynakları: Supabase production projesi, Vercel
  deployment, production secret, gerçek kullanıcı daveti, production/gerçek veri
  migration'ı yok.
- Sonraki büyük aşamaya geçiş: B054–B056 PR'ı CI PASS ile merge edilince P0-A3
  B057–B060 export/restore/delete dilimine geçilebilir; P0-B1 için formal G4 gerekir.
