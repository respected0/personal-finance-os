# ADR-001 — Topoloji

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Tek kullanıcılı başlangıç yükü, finans motorunun atomik işlem sınırı ve ileride çok cihaz ile banka entegrasyonuna açılma gereği birlikte ele alınmalıdır.

## Karar

Tek Next.js uygulama dağıtımı, ayrı domain paketleri ve tek PostgreSQL kullanan modüler monolit uygulanacaktır.

## Sonuçlar

Başlangıç operasyonu ve atomik finans işlemleri sade kalır. Paket sınırları lint/import kurallarıyla korunmalıdır; webhook veya uzun iş yükü büyürse ayrı worker sonradan değerlendirilebilir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-001
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-001
