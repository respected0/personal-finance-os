# Codex Devir Notu

- Devir tarihi: 2026-08-04 19:38 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061/formal G4; P0-B1 B062–B072/formal G5; P0-B2 B073–B082/formal G6.
- Son doğrulanmış main SHA: `82c483adecd91e4b2962640e7629eee234bf3106`; PR #24–#28 10/10 CI PASS.
- Kısmen tamamlanan görev: P0-B3 B083–B085 recommendation registry/settings/consumer engine; gerçek PostgreSQL acceptance PASS, tam kalite/migration drift kapısı ve PR henüz bekliyor.
- Son çalışma branch'i ve commit: `feat/p0-b3-recommendation-engine`, henüz commit yok; taban `82c483adecd91e4b2962640e7629eee234bf3106`.
- Açık PR/CI: Yok; B083–B085 tam yerel kapıdan sonra açılacak.
- Commitlenmemiş dosyalar: B083–B085 migration, domain/contracts/repository/API/OpenAPI, DB acceptance, CI wiring, schema mirror, seed/policy ve progress/handoff güncellemeleri; kesin liste `git status --short` ile alınmalı.
- Son PASS komutları: `pnpm check` (126 unit, build, OpenAPI, security/fixture); `pnpm recommendation:integration` gerçek PostgreSQL 17.6 üzerinde B083–B085 registry/override/canonical consumer/idempotency/RLS; `pnpm db:smoke` fresh + iki reset checksum `2afe45a905c9de8a5503176535ec6434adad7269248cf07f087ed2c5ada852fb`, drift 0; `pnpm rls:integration` PASS.
- Son FAIL ve kök neden: Seed allow-list yeni recommendation tablolarını tanımıyordu ve fresh migration'ı güvenli biçimde reddetti; allow-list güncellendi, ürün satırları hâlâ yasak. Ardından immutable P0-B1 run'ına `FOR SHARE` okuması UPDATE privilege gerektirdi; gereksiz kilit kaldırıldı ve runtime ayrıcalığı genişletilmedi. Son koşu PASS.
- Migration durumu: `20260805000000_p0_b3_recommendations.sql` fresh migration PASS; recommendation rules reference registry migration içindedir, seed ürün verisi 0 kalır.
- Kalan kabul kriterleri: B083–B085 tam `pnpm check`, fresh smoke/reset/checksum/drift/security, PR/10-of-10 CI/merge; B086–B090 ürün; B091/formal G7; PRE-RC readiness. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: `pnpm check`; DB smoke/reset/checksum/drift ve security taramalarını çalıştır; PASS ise commit/push/PR aç, `gh pr checks <PR> --watch --interval 20`, yalnız 10/10 PASS sonrası merge; sonra B086–B090'a geç.
- İlk komutlar: `git diff --check`; `pnpm check`; `pnpm db:smoke`.
- Yapılmaması gerekenler: mevcut değişiklikleri silme; P0-B1 kanonik yatırılabilir tutarını yeniden hesaplama; B083 dışındaki R-02–R-15 ürün semantiği uydurma; RC B092+ başlatma; production kaynak/secret veya gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi, object storage, production secret, gerçek kullanıcı daveti ve production veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B083–B085 10/10 CI PASS ile main'e birleşince B086–B090 explainable UI/monthly review/desktop composition dilimine geçilebilir.
