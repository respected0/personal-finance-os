# Codex Devir Notu

- Devir tarihi: 2026-08-04 18:36 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061/formal G4; P0-B1 B062–B072/formal G5. P0-B2 B073–B077 main üzerinde.
- Son doğrulanmış main SHA: `d0918bad190608d45cda71c979598a8e72353c11`; PR #24–#26 10/10 CI PASS.
- Kısmen tamamlanan görev: B078–B082 exact yatırım formu, allocation/cost/value/P&L UI, yalnız 1,31 g banka altını, transaction+ledger+lot atomic concurrency ve UAT-10.
- Son çalışma branch'i ve commit: `feat/p0-b2-investment-ui-g6`, henüz commit yok; taban `d0918bad190608d45cda71c979598a8e72353c11`.
- Açık PR/CI: Yok; ürün commit'inden sonra açılacak.
- Commitlenmemiş dosyalar: yatırım workspace/CSS/daily shell; portfolio allocation contract/repository; PostgreSQL concurrency ve browser UAT; CI investment acceptance; progress/handoff.
- Son PASS komutları: `pnpm check` (123 unit), `pnpm contracts:check`, `pnpm investment:integration`, `pnpm db:smoke` (checksum iki kez `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`, drift 0), `pnpm rls:integration`, `pnpm data-lifecycle:integration`, fixture ve secret/runtime taramaları.
- Son FAIL ve kök neden: `pnpm daily:browser` yerel Playwright executable başlamadan `libnspr4.so` eksikliğiyle FAIL; host shared-library sorunu, ürün/Docker/test assertion hatası değil. CI runner Chromium bağımlılıklarını kurar ve browser kanıtını verecek.
- Migration durumu: P0-B2 iki migration main üzerinde; bu dilim schema değişikliği yapmıyor.
- Kalan kabul kriterleri: B078–B082 PR CI browser/database dâhil 10/10 ve merge; formal G6; B083–B091/formal G7; PRE-RC readiness. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: diff/status kontrolünden sonra commit/push/PR aç; `gh pr checks <PR> --watch --interval 20`; FAIL logunu düzelt, yalnız 10/10 PASS sonrası merge; G6 kanıt PR'ını kapat ve B083'e geç.
- İlk komutlar: `git diff --check`; `git status --short --branch`; `git diff --stat`.
- Yapılmaması gerekenler: mevcut değişiklikleri silme; G6 PASS olmadan P0-B3'ü main'e alma; P0-B1 kanonik yatırılabilir tutarını yeniden hesaplama; RC B092+ başlatma; production kaynak/secret veya gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi, object storage, production secret, gerçek kullanıcı daveti ve production veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B078–B082 ve formal G6 10/10 CI PASS ile main'e birleşince B083–B091 P0-B3 başlanabilir.
