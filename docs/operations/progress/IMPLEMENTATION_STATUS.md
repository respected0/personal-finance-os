# Uygulama Durumu

- Güncellendi: 2026-08-04 20:46 TRT
- Son tamamlanan ana aşama: P0-B3 B083–B091 ve formal G7; PR #29–#31 10/10 CI PASS.
- Tamamlanan backlog maddeleri: B001–B091 `main` üzerinde.
- Devam eden iş: PRE-RC READINESS kanıt ve toplu denetim dilimi.
- Henüz başlanmayan backlog maddeleri: B092–B104 RC. RC bu görevde başlatılmadı.
- Son doğrulanmış ürün `main` SHA: `cc9bfa3cba92d3857f39e74b81e572fa042f6d75`.
- Güncel çalışma branch'i: `docs/pre-rc-readiness`.
- Açık PR: PRE-RC kanıt commit'i sonrasında açılacak.
- Son PASS sonuçları: PR #31 10/10 CI; 127 unit, exact 200-case recommendation property, UAT-14 gerçek Chromium, OpenAPI 3.1 lint/bundle/breaking, Auth/TOTP/AAL2, RLS/cross-user, fixture, secret ve gerçek PostgreSQL acceptance PASS. Fresh migration ve iki reset checksum'u `998787558c5f0eca306f3996ebbfce925f4e675e58538a9efa606547ddd8d226`, drift 0.
- Son FAIL komutu ve kök nedeni: PR #31 ilk head'inde eski generic `role=status` locator'ı yeni UAT-14 feedback status'u ile strict-mode belirsizliği oluşturdu. UAT-14 adımı akış sonuna taşındı ve locator exact erişilebilir adla sınırlandı; ürün davranışı değiştirilmedi. Yeni head 10/10 PASS.
- Migration listesi: 16 ileri yönlü SQL migration; son ikisi `20260805000000_p0_b3_recommendations.sql` ve `20260805010000_p0_b3_monthly_reviews.sql`.
- Bilinen teknik borç ve uyarılar: Next.js `middleware.ts` deprecation uyarısı; yerel host Playwright `libnspr4.so` eksikliği. İzole GitHub runner browser kabulü PASS. Production kaynakları bilinçli olarak oluşturulmadı.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: PRE-RC için yok. Gerçek Supabase/Vercel/object-storage, production secret, DNS ve gerçek kullanıcı/veri işleri RC/production handoff dışında oluşturulmadı.
- Bir sonraki kesin adım: PRE-RC kanıtını kontrol et, PR'da 10/10 CI PASS al, main'e birleştir ve PRE-RC READY noktasında dur.
- Devam etmek için ilk komut: `pnpm check`

## Bağlayıcı kapılar

| Kapı                   | Durum      | Kanıt                                         |
| ---------------------- | ---------- | --------------------------------------------- |
| G1 Foundation          | PASS       | `docs/operations/gates/G1-foundation.md`      |
| G2 P0-A0 Ledger Kernel | PASS       | `docs/operations/gates/G2-ledger-kernel.md`   |
| P0-A1 / G3             | PASS       | `docs/operations/gates/G3-p0-a-daily.md`      |
| P0-A2 / G4 ön kontrolü | PASS       | `docs/operations/gates/G4-p0-a2-precheck.md`  |
| P0-A3 / formal G4      | PASS       | `docs/operations/gates/G4-p0-a-complete.md`   |
| P0-B1 / G5             | PASS       | `docs/operations/gates/G5-p0-b-planning.md`   |
| P0-B2 / G6             | PASS       | `docs/operations/gates/G6-p0-b-investment.md` |
| P0-B3 / G7             | PASS       | `docs/operations/gates/G7-p0-b-advice.md`     |
| PRE-RC                 | DENETİMDE  | `docs/operations/gates/PRE-RC-readiness.md`   |
| RC                     | BAŞLANMADI | B092–B104                                     |
