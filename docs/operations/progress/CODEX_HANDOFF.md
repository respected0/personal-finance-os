# Codex Devir Notu

- Devir tarihi: 2026-08-04 13:29 TRT
- Tamamlanan ana aşamalar: M0 B001–B010; P0-A0 B011–B024; P0-A1 B025–B036;
  P0-A2 B037–B050. Son doğrulanmış main SHA:
  `e7809b187429877ddb0c025feb864e28b41e8dbe`.
- Kısmen tamamlanan görev: P0-A3 B051–B053, branch
  `feat/p0-a3-reconciliation-reversal`. SQL migration, typed contract, OpenAPI,
  repository, AAL2 BFF routes, responsive UI ve gerçek PostgreSQL/API/browser-CI
  senaryosu eklendi. Yerel DB/API kabulü ve `pnpm check` PASS; henüz commit/PR yok.
- Açık PR/CI: Yok. Son birleşen PR #16, P0-A2 G4 ön kontrol kanıtıdır.
- Commitlenmemiş dosyalar: `git status --short` ile B051–B053 migration,
  contracts, DB repository, API/UI, tests, workflow, progress/handoff değişiklikleri.
- Son çalıştırılan komutlar: `pnpm db:smoke` PASS (iki eşit checksum, drift 0),
  `pnpm reconciliation:integration` PASS, `pnpm daily:api:integration` PASS,
  `pnpm ledger:integration` PASS ve tam `pnpm check` PASS (110 unit).
- Son FAIL ve kök neden: PR #17 `auth / integration`, başarılı UAT-12 bildiriminde
  `role=status` olmadığı için Playwright seçicisi elementi bulamadı; erişilebilir
  canlı-bölge semantiği eklendi ve yeniden CI bekliyor. Seed beyaz listesi yeni P0-A3 tablolarını tanımadığı
  için ilk smoke batch'i reddetti; yalnız izinli tablo ve sıfır-satır kontrolü
  genişletildi. Testte ciphertext'i UTF-8'e çevirmeye çalışan negatif sorgu da
  düzeltildi. Ürün davranışında açık hata kalmadı.
- Kalan kabul kriterleri: B051–B053 secret scan, commit/push/PR ve tüm CI;
  sonrasında P0-A3 B054–B061, formal G4. Ardından P0-B1, P0-B2, P0-B3 ve
  PRE-RC denetimi.
- Doğrudan devam talimatı: Branch'te `git diff --check` ve
  `pnpm security:secret-scan` çalıştır; commit/push/PR aç, `gh pr checks --watch`
  ile 10/10 sonucu bekle, yalnız PASS ise merge et ve B054–B056'ya geç.
- İlk komutlar: `git status --short --branch`; `git diff --check`;
  `pnpm security:secret-scan`.
- Yapılmaması gerekenler: Değişiklikleri reset/restore/clean ile silme; history
  rewrite/force push yapma; formal G4 öncesi P0-B1'i main'e alma; production
  veya remote Supabase/Vercel kaynağı oluşturma.
- Oluşturulmayan production kaynakları: Supabase production projesi, Vercel
  deployment, production secret, gerçek kullanıcı daveti, production/gerçek veri
  migration'ı yok.
- Sonraki büyük aşamaya geçiş: B051–B053 PR'ı CI PASS ile merge edilince P0-A3
  B054–B056 raporlama dilimine geçilebilir; P0-B1 için formal G4 gerekir.
