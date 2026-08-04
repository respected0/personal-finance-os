# Codex Devir Notu

- Devir tarihi: 2026-08-04 18:06 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061/formal G4; P0-B1 B062–B072/formal G5.
- Son doğrulanmış main SHA: `1633501b084a7ca34d526275d20ed540f73ff103`; B074–B075 PR #25 10/10 CI PASS ile birleşti.
- Kısmen tamamlanan görev: B076–B077 fee-after-proceeds yatırım satışı, FIFO lot tüketimi/quantity cap/idempotency ve as-of portfolio valuation.
- Son çalışma branch'i ve commit: `feat/p0-b2-sell-portfolio`, henüz B076–B077 commit'i yok; branch tabanı `1633501b084a7ca34d526275d20ed540f73ff103`.
- Açık PR/CI: Yok; yerel tam kapıdan sonra B076–B077 PR'ı açılacak.
- Commitlenmemiş dosyalar: B076–B077 typed contract/repository/API/DB tests, OpenAPI/contract-policy ve progress belgeleri.
- Son PASS komutları: `pnpm check` (123 unit); `pnpm contracts:check`; `pnpm investment:integration`; `pnpm db:smoke` (iki reset checksum `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`, drift 0); `pnpm rls:integration`; `pnpm data-lifecycle:integration`; secret/runtime/browser-storage taramaları. Gerçek PostgreSQL B076 sell/proceeds/cost/gain, oversell partial-state 0, idempotent replay; B077 quantity/cost/value/P&L/time/source/missing-price ve cross-user PASS.
- Son FAIL ve kök neden: İlk sell preview assertion canonical Money `927.00` yerine numeric storage scale `927.0000` bekliyordu; test canonical formata düzeltildi. İlk OpenAPI response union taslağı breaking sayıldı; mevcut buy response garantileri korunarak sell kanıtı additive alanlara taşındı ve breaking diff PASS. Yerel Chromium `libnspr4.so` olmadığı için başlamıyor; GitHub browser runner etkilenmiyor.
- Mevcut migration: `20260804230000_p0_b2_investment_trades_lots.sql`; B073 migration main üzerinde.
- Kalan kabul kriterleri: B076–B077 tam kapı/CI/merge; B078–B082 ve G6; B083–B091 ve G7; PRE-RC readiness. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: B076–B077 tam yerel kalite ve DB kapısını çalıştır; PASS ise commit/push/PR/CI/merge et, ardından B078–B082 UI/invariant/atomic/E2E ve G6'ya geç.
- İlk komutlar: `git diff --check`; `pnpm check`; `pnpm db:smoke`.
- Yapılmaması gerekenler: mevcut branch değişikliklerini silme; G6 PASS olmadan P0-B3'ü main'e alma; P0-B1 kanonik yatırılabilir tutarını P0-B3'te yeniden hesaplama; RC B092+ başlatma; production kaynak/secret veya gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi, object storage, production secret, gerçek kullanıcı daveti ve production veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B073 doğrulama/PR/CI/merge sonrası B074–B075 ile P0-B2 sürdürülür.
