# ADR-005 — Veri erişimi ve migration

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Sıradan sorgularda tip güvenliği gerekirken ledger constraint, trigger ve function kuralları doğrudan incelenebilir SQL gerektirir.

## Karar

Drizzle ORM/query builder ile elle yazılmış, sıralı ve incelenebilir SQL migration dosyaları birlikte kullanılacaktır; ledger bütünlük kuralları raw SQL olacaktır.

## Sonuçlar

Type-safe sorgu ile SQL görünürlüğü birlikte sağlanır. Drizzle şeması ile özel SQL arasındaki drift, schema-diff ve migration testleriyle engellenmelidir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-005
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-005
