# ADR-009 — Şifreleme kapsamı

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Tam istemci tarafı E2EE; sunucu raporu, arama, öneri ve çok cihaz senkronunu P0 için aşırı karmaşıklaştırır. Yalnız sağlayıcı at-rest koruması ise seçili metinleri ayrıcalıklı veri erişimine açık bırakır.

## Karar

TLS ve sağlayıcı at-rest korumasına ek olarak seçili serbest metin ve hesap tanımlayıcılarında uygulama katmanı AES-256-GCM kullanılacaktır.

## Sonuçlar

Not, karşı taraf ve açıklamalar ek korunur; tutar ve raporlanan alanlar sunucuda sorgulanabilir kalır. Bu nedenle sağlayıcı/DB admin erişimine karşı kalan risk açıkça kabul edilir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-009
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Veritabani_API_Guvenlik_Teknik_Eki_v1.1.1.docx`, şema genel kuralları / Encryption
