# ADR-003 — Backend

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

P0 için ayrı servis işletme maliyeti gereksizdir; buna karşılık finans iş mantığı UI veya framework route katmanına bağlanmamalıdır.

## Karar

Next.js Route Handlers arkasında frameworkten bağımsız application/domain katmanları ve sürümlü REST `/api/v1` sınırı kullanılacaktır.

## Sonuçlar

Tek dağıtım korunurken gelecekte mobil, banka adaptörü veya worker ayrıştırması mümkün kalır. Route handler içine domain mantığı taşınmamalıdır.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-003
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-003
