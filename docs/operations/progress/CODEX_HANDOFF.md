# Codex Devir Notu

- Devir tarihi: 2026-08-04 17:17 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061/formal G4; P0-B1 B062–B072/formal G5.
- Son doğrulanmış main SHA: `c775d7e667de08db4f03e35ab34c546ee1c8e193`; PR #23 10/10 CI PASS ile birleşti.
- Kısmen tamamlanan görev: B073 instrument registry ve manuel/reference market-price geçmişi; migration, typed contract, repository, `/api/v1/market-prices`, RLS ve gerçek PostgreSQL kabulü çalışma alanında hazır.
- Son çalışma branch'i ve commit: `feat/p0-b2-instrument-prices`, henüz B073 commit'i yok; branch tabanı `c775d7e667de08db4f03e35ab34c546ee1c8e193`.
- Açık PR/CI: Yok; yerel tam kapıdan sonra B073 PR'ı açılacak.
- Commitlenmemiş dosyalar: B073 migration/contracts/repository/API/tests, schema/lifecycle/seed/contract-policy script güncellemeleri ve bu iki progress belgesi.
- Son PASS komutları: `pnpm check` (120 unit); `pnpm contracts:check`; `pnpm investment:integration`; `pnpm db:smoke` (iki reset checksum `415e1c001373a49d58e578fd1bf8cf60192574528f78c0d72e5b28337e05c585`, drift 0); `pnpm rls:integration`; `pnpm data-lifecycle:integration`; secret/runtime/browser-storage taramaları. Gerçek PostgreSQL B073 exact decimal, zaman damgası/kaynak/estimated, append-only fiyat geçmişi, latest projection ve cross-user RLS PASS.
- Son FAIL ve kök neden: İlk `pnpm contracts:check`, yeni GET endpoint zorunlu 4XX yanıtı içermediği için Redocly FAIL; Problem Details `401` eklendi ve yeniden çalışma PASS. Yerel Chromium `libnspr4.so` olmadığı için başlamıyor; GitHub browser runner etkilenmiyor.
- Mevcut migration: `20260804213000_p0_b2_instrument_prices.sql`.
- Kalan kabul kriterleri: B073 tam check/migration-reset-drift/security/CI/merge; B074–B082 ve G6; B083–B091 ve G7; PRE-RC readiness. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: B073 tam yerel kalite ve DB kapısını çalıştır; PASS ise commit/push/PR/CI/merge et, ardından bağlayıcı sırada B074–B075 trade/lot dilimine geç.
- İlk komutlar: `git diff --check`; `pnpm check`; `pnpm db:smoke`.
- Yapılmaması gerekenler: mevcut branch değişikliklerini silme; G6 PASS olmadan P0-B3'ü main'e alma; P0-B1 kanonik yatırılabilir tutarını P0-B3'te yeniden hesaplama; RC B092+ başlatma; production kaynak/secret veya gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi, object storage, production secret, gerçek kullanıcı daveti ve production veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B073 doğrulama/PR/CI/merge sonrası B074–B075 ile P0-B2 sürdürülür.
