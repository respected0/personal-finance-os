# Codex Devir Notu

- Devir tarihi: 2026-08-04 14:51 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036;
  P0-A2 B037–B050. P0-A3 B051–B056 main üzerinde. Son doğrulanmış main SHA:
  `f009fdd660994571c2616c55299b834b5c942c7e`.
- Kısmen tamamlanan görev: P0-A3 B057–B060, branch
  `feat/p0-a3-data-lifecycle`. Migration, typed repository/contracts,
  OpenAPI/API, responsive UI, taze TOTP proof ve gerçek PostgreSQL acceptance
  hazır; commit/PR henüz yok.
- Açık PR/CI: Yok. Son birleşen PR #18, B054–B056 için 10/10 CI PASS.
- Commitlenmemiş dosyalar: `git status --short` ile data lifecycle migration,
  repository, contracts, routes, UI, tests, workflow, lockfile ve bu progress/
  handoff değişiklikleri.
- Son çalıştırılan komutlar: `pnpm data-lifecycle:integration` PASS;
  `pnpm db:smoke` PASS (fresh, iki eşit checksum, drift 0); `pnpm check` PASS
  (113 unit); `pnpm security:secret-scan` ve runtime credential scan PASS.
- Son FAIL ve kök neden: JSON çift kodlama, tablo başına `created_at` varsayımı ve
  provider token payload okuması sırasıyla native JSON binding, REPEATABLE READ
  snapshot ve server-signed HttpOnly TOTP proof ile düzeltildi. Güncel head'de
  bilinen FAIL yok.
- Kalan kabul kriterleri: B057–B060 commit/push/PR ve 10/10 CI; B061 UAT-01–09,
  12,13,15,16 + security/restore formal G4. Sonrasında P0-B1, P0-B2, P0-B3 ve
  PRE-RC denetimi.
- Doğrudan devam talimatı: Branch'i commit/push et, PR aç, `gh pr checks --watch`
  ile tamamını bekle; yalnız PASS ise merge et. Güncel main'den B061 formal G4
  branch'i açıp bağlayıcı toplu acceptance/gate kanıtını tamamla.
- İlk komutlar: `git diff --check`; `git status --short --branch`;
  `pnpm security:secret-scan`.
- Yapılmaması gerekenler: Değişiklikleri reset/restore/clean ile silme; history
  rewrite/force push; formal G4 öncesi P0-B1'i main'e alma; production veya remote
  Supabase/Vercel/object-storage kaynağı oluşturma; passphrase/secret loglama.
- Oluşturulmayan production kaynakları: Supabase production projesi, Vercel
  deployment, production secret, gerçek kullanıcı daveti, object storage,
  production/gerçek veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B057–B060 PR'ı CI PASS ile merge edilip B061 formal
  G4 PASS olmadan P0-B1'e geçilmez.
