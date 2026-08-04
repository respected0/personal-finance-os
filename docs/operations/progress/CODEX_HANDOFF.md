# Codex Devir Notu

- Devir tarihi: 2026-08-04 18:36 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061/formal G4; P0-B1 B062–B072/formal G5. P0-B2 B073–B082 ürün kapsamı main üzerinde.
- Son doğrulanmış main SHA: `4e680acb1e19845ee4de1b5a3f3af44cbe958ebb`; PR #24–#27 10/10 CI PASS.
- Kısmen tamamlanan görev: Formal G6 kanıtı; B073–B082 ürün kapsamı tamamlandı.
- Son çalışma branch'i ve commit: `docs/p0-b2-g6-gate`, henüz commit yok; taban `4e680acb1e19845ee4de1b5a3f3af44cbe958ebb`.
- Açık PR/CI: Yok; gate commit'inden sonra açılacak.
- Commitlenmemiş dosyalar: G6 gate kanıtı ve progress/handoff güncellemesi.
- Son PASS komutları: `pnpm check` (123 unit), `pnpm contracts:check`, `pnpm investment:integration`, `pnpm db:smoke` (checksum iki kez `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`, drift 0), `pnpm rls:integration`, `pnpm data-lifecycle:integration`, fixture ve secret/runtime taramaları.
- Son FAIL ve kök neden: PR #27 ikinci browser çalışması mobil preview'da UAT-10 yatırım alımından önceki banka bakiyesini bekledi; doğru banka bakiyesi 1.320,00 TRY nakit çıkışı sonrası 22.060,00 TRY ve preview sonrası 22.047,66 TRY. Assertion canonical nakit etkisine güncellendi. İlk koşudaki stale üst özet callback'i de ürün tarafında düzeltildi.
- Migration durumu: P0-B2 iki migration main üzerinde; bu dilim schema değişikliği yapmıyor.
- Kalan kabul kriterleri: Formal G6 PR/CI/merge; B083–B091/formal G7; PRE-RC readiness. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: G6 gate belgesini commit/push/PR aç; `gh pr checks <PR> --watch --interval 20`; yalnız 10/10 PASS sonrası merge; B083–B091 bağlayıcı kapsamına geç.
- İlk komutlar: `git diff --check`; `git status --short --branch`; `git diff --stat`.
- Yapılmaması gerekenler: mevcut değişiklikleri silme; G6 PASS olmadan P0-B3'ü main'e alma; P0-B1 kanonik yatırılabilir tutarını yeniden hesaplama; RC B092+ başlatma; production kaynak/secret veya gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi, object storage, production secret, gerçek kullanıcı daveti ve production veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B078–B082 ve formal G6 10/10 CI PASS ile main'e birleşince B083–B091 P0-B3 başlanabilir.
