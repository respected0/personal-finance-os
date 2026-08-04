# Codex Devir Notu

- Devir tarihi: 2026-08-04 20:02 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061/formal G4; P0-B1 B062–B072/formal G5; P0-B2 B073–B082/formal G6.
- Son doğrulanmış main SHA: `1877aef7a6adc2f0ec2f27cfefdedde7b815697b`; PR #29 dahil 10/10 CI PASS.
- Kısmen tamamlanan görev: B091 formal G7 ve UAT-14 browser E2E; ürün B083–B090 main üzerinde.
- Son çalışma branch'i ve commit: `test/p0-b3-uat14-g7`, henüz commit yok; taban `ebe38baa69b7b1b8e3419cf6f2c120bb830b8dd2`.
- Açık PR/CI: UAT-14/G7 commit sonrasında açılacak.
- Commitlenmemiş dosyalar: B083–B085 migration, domain/contracts/repository/API/OpenAPI, DB acceptance, CI wiring, schema mirror, seed/policy ve progress/handoff güncellemeleri; kesin liste `git status --short` ile alınmalı.
- Son PASS komutları: B086–B090 `pnpm check` (127 unit + exact property), `pnpm recommendation:integration`, `pnpm db:smoke` fresh + iki reset checksum `998787558c5f0eca306f3996ebbfce925f4e675e58538a9efa606547ddd8d226`, drift 0; secret scan PASS.
- Son FAIL ve kök neden: Seed allow-list yeni recommendation tablolarını tanımıyordu ve fresh migration'ı güvenli biçimde reddetti; allow-list güncellendi, ürün satırları hâlâ yasak. Ardından immutable P0-B1 run'ına `FOR SHARE` okuması UPDATE privilege gerektirdi; gereksiz kilit kaldırıldı ve runtime ayrıcalığı genişletilmedi. Son koşu PASS.
- Migration durumu: `20260805000000_p0_b3_recommendations.sql` fresh migration PASS; recommendation rules reference registry migration içindedir, seed ürün verisi 0 kalır.
- Kalan kabul kriterleri: B091 UAT-14 browser + formal G7 PR/10-of-10 CI/merge; PRE-RC readiness audit. RC B092+ başlatılmayacak.
- Doğrudan devam talimatı: `pnpm check`; DB smoke ve security taramalarını çalıştır; PASS ise commit/push/PR aç, `gh pr checks <PR> --watch --interval 20`, yalnız 10/10 PASS sonrası merge; sonra B091/G7'ye geç.
- İlk komutlar: `git diff --check`; `pnpm check`; `pnpm db:smoke`.
- Yapılmaması gerekenler: mevcut değişiklikleri silme; P0-B1 kanonik yatırılabilir tutarını yeniden hesaplama; B083 dışındaki R-02–R-15 ürün semantiği uydurma; RC B092+ başlatma; production kaynak/secret veya gerçek veri oluşturma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi, object storage, production secret, gerçek kullanıcı daveti ve production veri migration'ı yok.
- Sonraki büyük aşamaya geçiş: B083–B085 10/10 CI PASS ile main'e birleşince B086–B090 explainable UI/monthly review/desktop composition dilimine geçilebilir.
