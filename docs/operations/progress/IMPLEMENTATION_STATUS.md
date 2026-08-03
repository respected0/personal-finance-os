# Uygulama Durumu

- Güncellendi: 2026-08-03 TRT
- Son tamamlanan ana aşama: P0-A2 abonelik/cashback (B042–B043, PR #13 merged)
- Tamamlanan backlog maddeleri: B001–B043 (`a53bd226c0857587a0fddbd350d9cf564e2c51f5` üzerinde)
- Devam eden backlog maddesi: P0-A2 B044–B048 ortak gider, alacak ve tahsilat
- Henüz başlanmayan backlog maddeleri: B049–B104; P0-A3, P0-B1, P0-B2, P0-B3, RC
- Son doğrulanmış main SHA: `a53bd226c0857587a0fddbd350d9cf564e2c51f5`
- Güncel çalışma branch'i: `feat/p0-a2-sharing-receivables`
- Açık PR: [#14](https://github.com/respected0/personal-finance-os/pull/14), açık;
  `43b2c80` üzerinden CI çalışıyor.
- Son PASS sonuçları: PR #13 için 10/10 CI; PostgreSQL 17.6; Supabase CLI 2.110.0;
  P0-A2 B037–B043 gerçek PostgreSQL, browser, fresh migration, iki reset, checksum,
  drift, Auth/RLS ve secret scan PASS. Bu dilimde geçici Node 24.18.0 + pnpm 11.18.0 ile
  `format:check`, `lint`, `typecheck`, 110 unit test, `build`, migration policy ve
  OpenAPI lint/bundle PASS.
- Son FAIL komutu ve kök nedeni: `pnpm contracts:check` OpenAPI lint/bundle sonrasında
  Docker tabanlı `oasdiff` çağrısında; `pnpm security:secret-scan` Docker tabanlı
  gitleaks çağrısında başarısız oldu. `docker`, `docker compose` ve `docker info` Docker
  Desktop WSL integration etkin değil hatası veriyor. Bu makine/WSL engelidir; işletim
  sistemi ayarı değiştirilmedi.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0 `20260801173000_p0_a0_ledger_kernel.sql`;
  P0-A1 `20260801212000_p0_a1_daily_core.sql`; P0-A2
  `20260801231500_p0_a2_card_flows.sql`, `20260801234500_p0_a2_subscriptions.sql`,
  henüz commit edilmemiş `20260803000000_p0_a2_sharing_receivables.sql`.
- Bilinen teknik borç ve uyarılar: B044–B048 API, repository, migration, unit ve gerçek
  PostgreSQL acceptance test yüzeyi yazılıyor; yerelde Node/Docker olmadığı için henüz
  doğrulanmadı. SQL migration tek şema otoritesi olarak korunuyor.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Docker Desktop WSL integration
  erişiminin geri gelmesi gerekiyor. CI mevcut GitHub altyapısında Docker tabanlı
  acceptance, breaking-diff ve secret-scan kontrollerini çalıştırabilir.
- Bir sonraki kesin adım: `ad186e6` branch'ini push et ve PR aç; CI'da `sharing:integration`,
  fresh migration/reset/drift, secret scan ve OpenAPI breaking diff PASS ise B044–B048'i main'e
  al. Yerel Docker erişimi geri gelirse aynı kontrolleri tekrar çalıştır.
- Devam etmek için ilk komut: `node --version && pnpm --version && docker info`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                                    |
| ---------------------- | ------------ | ------------------------------------------------------------------------ |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                                 |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`                              |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10                |
| P0-A2                  | DEVAM EDİYOR | B037–B043 main’de PASS; B044–B048 uygulanıyor, runtime doğrulama ENGELLİ |
| P0-A3                  | BAŞLANMADI   | P0-A2 gate bağımlılığı                                                   |
| P0-B1                  | BAŞLANMADI   | P0-A3 gate bağımlılığı                                                   |
| P0-B2                  | BAŞLANMADI   | P0-B1 gate bağımlılığı                                                   |
| P0-B3                  | BAŞLANMADI   | P0-B1 çıktısını tüketir                                                  |
| RC                     | BAŞLANMADI   | Önceki kapılar sonrasında                                                |
