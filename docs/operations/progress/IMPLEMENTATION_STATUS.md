# Uygulama Durumu

- Güncellendi: 2026-08-04 14:51 TRT
- Son tamamlanan ana aşama: P0-A2 B037–B050; G4 ön kontrolü PASS
- Tamamlanan backlog maddeleri: B001–B056 main üzerinde. PR #18 B054–B056
  aylık rapor dilimini 10/10 CI PASS ile `f009fdd660994571c2616c55299b834b5c942c7e`
  olarak main'e taşıdı. P0-A3 B057–B060 çalışma branch'inde uygulanıp yerel kabul
  zincirinden geçti.
- Devam eden backlog maddesi: P0-A3 B057–B060 export/restore/deletion PR kapanışı
- Henüz başlanmayan backlog maddeleri: B061–B104; P0-A3 formal G4, P0-B1,
  P0-B2, P0-B3 ve RC
- Son doğrulanmış main SHA: `f009fdd660994571c2616c55299b834b5c942c7e`
- Güncel çalışma branch'i: `feat/p0-a3-data-lifecycle`
- Açık PR: Yok; B057–B060 branch'i commit/push sonrasında açılacak.
- Son PASS sonuçları: PR #18 10/10 CI. B057 UTF-8 CSV ve decimal string;
  B058 tek `REPEATABLE READ` snapshot, manifest+NDJSON ZIP, ciphertext checksum,
  Argon2id (65536 KiB/3/1) + AES-256-GCM, yanlış checksum/passphrase negatifleri;
  B059 `pg_temp` quarantine, relationship/ledger/report farkı 0; B060 taze
  server-signed TOTP proof, 7 gün hold, cancel, write lock, gerçek purge,
  orphan user row 0 ve backup-expiry receipt PASS. Fresh migration, iki reset
  checksum `d1543af423b85834d9be298396be2db3dcb6c9baabafac569c74a992cb75349b`,
  drift 0; 113 unit, build, OpenAPI breaking diff, secret/runtime scan ve tam
  `pnpm check` PASS.
- Son FAIL komutu ve kök nedeni: İlk data lifecycle kabulünde `scope` JSON
  string olarak çift kodlandı; native `tx.json` ile düzeltildi. Bazı ilişki
  tablolarında `created_at` olmadığı görüldü; tüm tabloları aynı anda temsil eden
  `REPEATABLE READ` snapshot'a geçirildi. Fresh proof için provider token payload
  okuma girişimi auth-storage politikası tarafından reddedildi; tokena dokunmayan,
  TOTP challenge sonrası HttpOnly/server-signed 5 dakikalık proof ile değiştirildi.
  Tüm düzeltmelerden sonra tam zincir PASS.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0 `20260801173000_p0_a0_ledger_kernel.sql`;
  P0-A1 `20260801212000_p0_a1_daily_core.sql`; P0-A2
  `20260801231500_p0_a2_card_flows.sql`, `20260801234500_p0_a2_subscriptions.sql`,
  `20260803000000_p0_a2_sharing_receivables.sql`; P0-A3
  `20260804130000_p0_a3_reconciliation_reversal.sql`,
  `20260804143000_p0_a3_monthly_reports.sql`,
  `20260804160000_p0_a3_data_lifecycle.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser `libnspr4.so` eksikliği
  nedeniyle browser kabulü GitHub Ubuntu runner'ında doğrulanır. Restore apply,
  bağlayıcı gereği mevcut veri için explicit merge/import stratejisi olmadan 409
  fail-closed döner; P0-A3 kanıtı quarantine dry-run'dır.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production Supabase,
  Vercel, secret, gerçek kullanıcı/veri veya object storage oluşturulmadı.
- Bir sonraki kesin adım: B057–B060 diff/secret kanıtını commit et, push/PR aç,
  10/10 CI sonucunu bekle; yalnız PASS ise merge et ve B061 formal G4'e geç.
- Devam etmek için ilk komut: `git diff --check && git status --short --branch`

## Bağlayıcı kapılar

| Kapı                   | Durum      | Kanıt                                                     |
| ---------------------- | ---------- | --------------------------------------------------------- |
| G1 Foundation          | PASS       | `docs/operations/gates/G1-foundation.md`                  |
| G2 P0-A0 Ledger Kernel | PASS       | `docs/operations/gates/G2-ledger-kernel.md`               |
| P0-A1 / G3             | PASS       | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10 |
| P0-A2 / G4 ön kontrolü | PASS       | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16  |
| P0-A3 / formal G4      | DEVAM      | B051–B056 main; B057–B060 local PASS; B061 bekliyor       |
| P0-B1                  | BAŞLANMADI | Formal G4 bağımlılığı                                     |
| P0-B2                  | BAŞLANMADI | P0-B1 gate bağımlılığı                                    |
| P0-B3                  | BAŞLANMADI | P0-B1 kanonik çıktısını tüketir                           |
| RC                     | BAŞLANMADI | Önceki kapılar sonrasında                                 |
