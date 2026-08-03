# Codex Devir Notu

- Devir tarihi: 2026-08-03 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036;
  P0-A2 B037–B043. Son main SHA:
  `a53bd226c0857587a0fddbd350d9cf564e2c51f5`.
- Kısmen tamamlanan görev: P0-A2 B044–B048. Branch
  `feat/p0-a2-sharing-receivables`; değişiklikler commit edilmedi.
- Açık PR/CI: Açık PR yok. PR #13 main’e 10/10 CI ile merge edildi.
- Commitlenmemiş dosyalar: `git status --short` ile doğrulanmalı; B044–B048 migration,
  contract, DB repository, API routes, test ve CI değişiklikleri içerir.
- Son çalıştırılan komutlar: `git diff --check`, `format:check`, `lint`, `typecheck`,
  110 unit test, `build`, migration policy ve OpenAPI lint/bundle PASS. `contracts:diff`
  ve `security:secret-scan`, Docker tabanlı araçları çalıştırırken WSL integration
  hatasıyla ENGELLİ.
- Kanıtlanan kök neden: Docker Desktop WSL integration erişimi yok. Geçici Node 24.18.0
  + pnpm 11.18.0 ile proje kodu statik olarak doğrulandı. İşletim sistemi ayarı
  değiştirilmemelidir.
- Kalan kabul kriterleri: B044 exact toplam; UAT-06, UAT-07, UAT-08; FOR UPDATE /
  SERIALIZABLE concurrency; migration/reset/drift; contract; RLS; secret scan; P0-A2
  B049/B050 ve gate.
- Doğrudan devam talimatı: Önce `node --version && pnpm --version && docker info`
  çalıştır. Erişim varsa `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:unit`, `pnpm check`, `pnpm sharing:integration`, ardından DB reset/checksum/
  drift ve secret scan. Hataları B044–B048 sınırında en küçük değişiklikle düzelt.
- Yapılmaması gerekenler: Mevcut değişiklikleri reset/restore/clean ile silme; branch
  değiştirme veya history rewrite yapma; production/remote Supabase kaynağı oluşturma.
- Oluşturulmayan production kaynakları: Supabase production projesi, Vercel deployment,
  production secret, gerçek kullanıcı daveti ve gerçek veri migration’ı yok.
- Sonraki büyük aşama: P0-A2 ancak B044–B050 doğrulanıp gate PASS olduktan sonra P0-A3’e
  geçebilir.
