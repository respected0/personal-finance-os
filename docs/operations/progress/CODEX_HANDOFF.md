# Codex Devir Notu

- Devir tarihi: 2026-08-04 15:41 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036;
  P0-A2 B037–B050; P0-A3 B051–B061/formal G4. Son doğrulanmış main SHA
  `1712869160c2e46700b8cd44da51fb8ccf388c1d`; PR #20 10/10 CI PASS ile
  birleşti.
- Kısmen tamamlanan görev: P0-B1 B062–B067, branch
  `feat/p0-b1-budget-goal-planning`. Migration, typed contract, repository,
  API, UI, browser senaryosu ve gerçek PostgreSQL acceptance hazır; commit/PR
  bekliyor.
- Açık PR/CI: Yok. Bu branch push edilmedi. Son birleşen PR #20.
- Commitlenmemiş dosyalar: `git status --short` ile görülen B062–B067 migration,
  planning contract/repository/API/UI/test ve progress dosyaları.
- Son PASS komutları: `pnpm planning:integration`; `pnpm db:smoke` (fresh,
  PostgreSQL 17, reset checksum iki kez
  `3daee384e6459e8e05fc161e3838ca390d47f84387bff475bdb686e25d819b8b`,
  drift 0); `pnpm rls:integration`; `pnpm data-lifecycle:integration`;
  `pnpm check` (115 unit); OpenAPI breaking diff; secret/runtime scans.
- Son FAIL ve kök neden: İlk local start seed whitelist yeni planning tablolarını
  reddetti; whitelist yalnız schema-izin ve sıfır-row kontrolleriyle genişletildi.
  OpenAPI export schemaVersion 18 denemesi breaking bulundu; yeni tablolar
  arşive eklenirken dış format sürümü 17’de korundu. Güncel head’de FAIL yok.
- Kalan kabul kriterleri: B062–B067 browser kabulünün CI Ubuntu runner’da PASS
  olması ve PR merge; B068–B072/G5; B073–B082/G6; B083–B091/G7; PRE-RC.
- Doğrudan devam talimatı: browser script değişikliği sonrası `pnpm format &&
pnpm check`; diff/secret taraması; commit/push/PR; `gh pr checks --watch` ile
  10/10 PASS bekle, merge et. Sonra B068–B072 dilimine geç.
- İlk komutlar: `git status --short --branch`; `git diff --check`; `pnpm check`.
- Yapılmaması gerekenler: mevcut branch değişikliklerini silme; P0-B1 G5 PASS
  olmadan P0-B2’yi main’e alma; RC B092+ başlatma; production kaynak/secret veya
  gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi,
  object storage, production secret, gerçek kullanıcı daveti ve production veri
  migration’ı yok.
- Sonraki büyük aşamaya geçiş: B062–B067 PR 10/10 CI PASS ve merge sonrasında
  B068 expected-payment ile devam edilebilir.
