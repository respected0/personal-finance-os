# Codex Devir Notu

- Devir tarihi: 2026-08-04 15:06 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036;
  P0-A2 B037–B050; P0-A3 ürün kapsamı B051–B060 main üzerinde. Son doğrulanmış
  main SHA: `b3cf7ae4a0c2d3b7733d8bae9766d906d445f9b2`.
- Kısmen tamamlanan görev: B061 formal G4 gate closure, branch
  `docs/p0-a3-formal-g4`. `G4-p0-a-complete.md` hazır; commit/PR bekliyor.
- Açık PR/CI: Yok. Son birleşen PR #19, B057–B060 için 10/10 CI PASS.
- Commitlenmemiş dosyalar: Formal G4 kanıtı ve progress/handoff güncellemeleri.
- Son çalıştırılan komutlar: PR #19 `gh pr checks --watch` 10/10 PASS; GitHub
  database/auth/RLS job log denetimi PASS; main/origin eşit ve temizdi.
- Son FAIL ve kök neden: Güncel ürün head'inde veya PR #19 CI'da FAIL yok.
- Kalan kabul kriterleri: B061 docs PR 10/10 CI ve merge; P0-B1 B062–B072;
  P0-B2 B073–B082; P0-B3 B083–B091; PRE-RC denetimi. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: Gate docs değişikliklerinde `pnpm check`, secret scan
  ve diff-check çalıştır; commit/push/PR aç, tüm kontrolleri bekle ve yalnız PASS
  ise merge et. Sonra bağlayıcı belgelerden B062–B072'yi ayrıntılı çıkar.
- İlk komutlar: `git status --short --branch`; `git diff --check`; `pnpm check`.
- Yapılmaması gerekenler: Formal G4 merge olmadan P0-B1'i main'e alma; reset/
  restore/clean/history rewrite; production veya ücretli kaynak; gerçek veri.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi,
  object storage, production secret, gerçek kullanıcı daveti, production/gerçek
  veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B061 PR 10/10 CI PASS ve main merge sonrasında
  P0-B1 B062 ile başlanabilir.
