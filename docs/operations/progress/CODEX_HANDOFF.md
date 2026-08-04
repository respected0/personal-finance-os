# Codex Devir Notu

- Devir tarihi: 2026-08-04 16:20 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036;
  P0-A2 B037–B050; P0-A3 B051–B061/formal G4. Son doğrulanmış main SHA
  `a6aab8dfd682ebafd415347779c1d57e8f543784`; PR #21 B062–B067 10/10 CI PASS ile birleşti.
- Kısmen tamamlanan görev: P0-B1 B068–B072, branch `feat/p0-b1-expected-investable`. Migration, typed contract, repository, API, UI, browser senaryosu ve gerçek PostgreSQL acceptance hazır; tam gate/PR bekliyor.
- Açık PR/CI: Yok. Bu branch push edilmedi. Son birleşen PR #20.
- Commitlenmemiş dosyalar: `git status --short` ile görülen B068–B072 migration,
  planning contract/repository/API/UI/test ve progress dosyaları.
- Son PASS komutları: `pnpm planning:integration`; `pnpm db:smoke` (fresh, PostgreSQL 17, iki reset checksum `186931110f4d76515e618578556944500b20af651a6ccd3ed9e499af36c99afb`, drift 0); `pnpm rls:integration`; `pnpm data-lifecycle:integration`; `pnpm check` (118 unit); OpenAPI additive diff; secret/runtime scans.
- Son FAIL ve kök neden: PR #22 ilk head browser işinde desktop expected realization net serveti doğru olarak +5.000 TRY değiştirdi, fakat ardından çalışan mobile fixture eski sabitleri bekledi; ardışık UAT beklentileri düzeltildi. Yerel Chromium `libnspr4.so` olmadığı için başlamıyor.
- Kalan kabul kriterleri: B068–B072 browser kabulünün CI Ubuntu runner’da PASS olması, tam DB drift/security ve PR merge; B073–B082/G6; B083–B091/G7; PRE-RC.
- Doğrudan devam talimatı: `pnpm check`; migration/reset/drift/security; commit/push/PR; `gh pr checks --watch` ile 10/10 PASS bekle, merge et. Sonra B073–B082'ye geç.
- İlk komutlar: `git status --short --branch`; `git diff --check`; `pnpm check`.
- Yapılmaması gerekenler: mevcut branch değişikliklerini silme; P0-B1 G5 PASS
  olmadan P0-B2’yi main’e alma; RC B092+ başlatma; production kaynak/secret veya
  gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi,
  object storage, production secret, gerçek kullanıcı daveti ve production veri
  migration’ı yok.
- Sonraki büyük aşamaya geçiş: B062–B067 PR 10/10 CI PASS ve merge sonrasında
  B068 expected-payment ile devam edilebilir.
