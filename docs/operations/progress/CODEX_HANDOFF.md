# Codex Devir Notu

- Devir tarihi: 2026-08-04 20:46 TRT.
- Tamamlanan aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036; P0-A2 B037–B050; P0-A3 B051–B061; P0-B1 B062–B072; P0-B2 B073–B082; P0-B3 B083–B091.
- Son doğrulanmış ürün `main` SHA: `cc9bfa3cba92d3857f39e74b81e572fa042f6d75`; PR #31 dahil 10/10 CI PASS.
- Devam eden iş: `docs/pre-rc-readiness` branch'inde PRE-RC toplu denetim kanıtı.
- Son çalışma branch'i ve commit: `docs/pre-rc-readiness`; henüz kanıt commit'i yok, taban `cc9bfa3cba92d3857f39e74b81e572fa042f6d75`.
- Açık PR/CI: Kanıt commit'i sonrasında açılacak.
- Commitlenmemiş dosyalar: yalnız G7 kapanışı, PRE-RC raporu ve progress/handoff güncellemeleri; kesin liste `git status --short` ile alınmalı.
- Son PASS komutları: PR #31 bütün 10 zorunlu kontrol; database migration-smoke 10m36s, auth/browser 3m28s, OpenAPI, RLS, fixture, unit, format/lint/typecheck ve secret scan PASS.
- Son FAIL ve kök neden: UAT-14 status mesajı eski generic browser locator'ını belirsizleştirdi; test gerçek erişilebilir ada sınırlandı ve yeni head 10/10 PASS oldu.
- Migration durumu: 16 ordered SQL migration; fresh migration PASS, reset checksum 1 = checksum 2 = `998787558c5f0eca306f3996ebbfce925f4e675e58538a9efa606547ddd8d226`, drift 0; PostgreSQL 17.6, Supabase CLI 2.110.0.
- Kalan kabul kriterleri: PRE-RC kanıt PR'ının 10/10 CI PASS olması, main'e birleşmesi ve final repository temizliği/eşitliği. RC B092–B104 başlanmadı.
- Doğrudan devam talimatı: `pnpm check`; secret scan ve diff kontrolünü çalıştır; kanıtı commit/push/PR yap; `gh pr checks <PR> --watch --interval 20`; yalnız 10/10 PASS sonrası merge; final SHA ve temizliği doğrula; PRE-RC READY noktasında dur.
- Yapılmaması gerekenler: RC B092+ başlatma; P0-B1 kanonik yatırılabilir tutarını P0-B3'te yeniden hesaplama; production kaynak/secret, gerçek kullanıcı veya gerçek finans verisi oluşturma; geçmişi yeniden yazma.
- Oluşturulmayan production kaynakları: Supabase/Vercel production projesi/deployment, object storage, production secret, DNS/domain, gerçek kullanıcı daveti ve production veri migration'ı.
- Sonraki büyük aşamaya geçiş: PRE-RC READY sonrasında kullanıcı denetimi gerekir; RC bu çalışma diliminde başlatılmaz.
