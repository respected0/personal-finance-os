# Codex Devir Notu

- Devir tarihi: 2026-08-04 17:36 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061/formal G4; P0-B1 B062–B072/formal G5.
- Son doğrulanmış main SHA: `b3037361079460a59839f8001db508a98edd5156`; B073 PR #24 10/10 CI PASS ile birleşti.
- Kısmen tamamlanan görev: B074–B075 atomik yatırım alımı, dengeli ledger, tüketim gideri 0, fee-inclusive lot ve idempotency.
- Son çalışma branch'i ve commit: `feat/p0-b2-investment-buy-lots`, henüz B074–B075 commit'i yok; branch tabanı `b3037361079460a59839f8001db508a98edd5156`.
- Açık PR/CI: Yok; yerel tam kapıdan sonra B074–B075 PR'ı açılacak.
- Commitlenmemiş dosyalar: B074–B075 migration/contracts/repository/API/DB tests, Drizzle/lifecycle/seed/contract-policy güncellemeleri ve progress belgeleri.
- Son PASS komutları: `pnpm check` (122 unit); `pnpm contracts:check`; `pnpm investment:integration`; `pnpm db:smoke` (iki reset checksum `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`, drift 0); `pnpm rls:integration`; `pnpm data-lifecycle:integration`; secret/runtime/browser-storage taramaları. Gerçek PostgreSQL B074–B075 atomic trade+ledger+lot, fee-inclusive cost, expense/income/net-worth 0, idempotency ve partial-state rollback PASS.
- Son FAIL ve kök neden: İlk B074–B075 integration fixture sentetik institution/account audit çağrısında request kimliği vermedi; audit NOT NULL doğru biçimde reddetti. Sentetik `requestId` eklendi ve yeniden çalışma PASS. Yerel Chromium `libnspr4.so` olmadığı için başlamıyor; GitHub browser runner etkilenmiyor.
- Mevcut migration: `20260804230000_p0_b2_investment_trades_lots.sql`; B073 migration main üzerinde.
- Kalan kabul kriterleri: B074–B075 tam kapı/CI/merge; B076–B082 ve G6; B083–B091 ve G7; PRE-RC readiness. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: B074–B075 tam yerel kalite ve DB kapısını çalıştır; PASS ise commit/push/PR/CI/merge et, ardından bağlayıcı sırada B076–B077 satış/portfolio dilimine geç.
- İlk komutlar: `git diff --check`; `pnpm check`; `pnpm db:smoke`.
- Yapılmaması gerekenler: mevcut branch değişikliklerini silme; G6 PASS olmadan P0-B3'ü main'e alma; P0-B1 kanonik yatırılabilir tutarını P0-B3'te yeniden hesaplama; RC B092+ başlatma; production kaynak/secret veya gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi, object storage, production secret, gerçek kullanıcı daveti ve production veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B073 doğrulama/PR/CI/merge sonrası B074–B075 ile P0-B2 sürdürülür.
