# ADR-004 — Veritabanı

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Finansal kayıtlar exact sayısal tip, transaction, ilişkisel bütünlük, constraint ve satır düzeyi yetkilendirme gerektirir.

## Karar

Veritabanı PostgreSQL olacak; yönetilen başlangıç sağlayıcısı olarak Supabase kullanılacaktır.

## Sonuçlar

`NUMERIC`, transaction, FK/CHECK ve RLS kullanılabilir. Ücretsiz katmanın otomatik yedek taşımaması ve sağlayıcı bağımlılığı veri yaşam döngüsü kapılarıyla yönetilmelidir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-004
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-004
