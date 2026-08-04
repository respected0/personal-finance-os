# Uygulama Durumu

- Güncellendi: 2026-08-04 TRT
- Son tamamlanan ana aşama: P0-A2 B044–B048 ortak gider/alacak (PR #14 merged)
- Tamamlanan backlog maddeleri: B001–B048 (`ee1ff91e8c44b8d7b26c2344d3b8652038625edf` üzerinde)
- Devam eden backlog maddesi: P0-A2 B049–B050 hassas akış ekranları ve browser UAT
- Henüz başlanmayan backlog maddeleri: B051–B104; P0-A3, P0-B1, P0-B2, P0-B3, RC
- Son doğrulanmış main SHA: `ee1ff91e8c44b8d7b26c2344d3b8652038625edf`
- Güncel çalışma branch'i: `feat/p0-a2-sensitive-flow-ui`
- Açık PR: [#15](https://github.com/respected0/personal-finance-os/pull/15), açık;
  son commit `6a794ad`. B049 UI ve B050 UAT-06/07 browser genişletmesi için CI
  yeni head üzerinde yeniden planlanıyor.
- Son PASS sonuçları: PR #13 için 10/10 CI; PostgreSQL 17.6; Supabase CLI 2.110.0;
  P0-A2 B037–B043 gerçek PostgreSQL, browser, fresh migration, iki reset, checksum,
  drift, Auth/RLS ve secret scan PASS. Bu dilimde geçici Node 24.18.0 + pnpm 11.18.0 ile
  `format:check`, `lint`, `typecheck`, 110 unit test, `build`, migration policy ve
  OpenAPI lint/bundle PASS.
- Son FAIL komutu ve kök nedeni: PR #14 `database / migration-smoke` çalışmasında
  shared-expense alanı düzeltmesinden sonra `assert_settlement_invariants()`
  `obligations` trigger'ında olmayan `NEW.obligation_id` alanını çözmeye çalıştı.
  Migration'ın iki çok-tabla deferred trigger'ı artık tablo-bağımsız
  `to_jsonb(NEW)` record projeksiyonunu kullanıyor. Settlement preview'si
  stale outstanding değerini karar verici yapmıyor; gerçek aşım
  `SERIALIZABLE`/`FOR UPDATE` otoriter kontrolde 409 olarak reddediliyor. Yerelde
  `pnpm install --frozen-lockfile`, format, lint, typecheck, 110 unit test,
  build, migration policy ve OpenAPI lint/bundle PASS. `pnpm contracts:check` OpenAPI lint/bundle sonrasında
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
- Bir sonraki kesin adım: B050 browser UAT-06/07 genişletmesi eklendi; statik
  kontrol ve GitHub CI sonrasında UAT-08 görünürlüğünü, P0-A2 gate kanıtını tamamla.
- Devam etmek için ilk komut: `node --version && pnpm --version && docker info`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                           |
| ---------------------- | ------------ | --------------------------------------------------------------- |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                        |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`                     |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10       |
| P0-A2                  | DEVAM EDİYOR | B037–B048 main’de PASS; B049–B050 browser/gate kapanışı sürüyor |
| P0-A3                  | BAŞLANMADI   | P0-A2 gate bağımlılığı                                          |
| P0-B1                  | BAŞLANMADI   | P0-A3 gate bağımlılığı                                          |
| P0-B2                  | BAŞLANMADI   | P0-B1 gate bağımlılığı                                          |
| P0-B3                  | BAŞLANMADI   | P0-B1 çıktısını tüketir                                         |
| RC                     | BAŞLANMADI   | Önceki kapılar sonrasında                                       |
