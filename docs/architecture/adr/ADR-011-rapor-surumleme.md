# ADR-011 — Rapor sürümleme

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Geçmiş ay işlemleri düzeltilebilir olmalı; buna karşılık önceki rapor ve karar izleri sessizce değişmemelidir.

## Karar

Raporlar posted ledger’dan yeniden hesaplanacak ve immutable `monthly_report_versions` snapshot’ları tutulacaktır; geriye tarihli değişiklik yeni sürüm üretir.

## Sonuçlar

Canlı gerçek ile kapanış kanıtı birlikte korunur. Snapshot invalidation ve yeniden üretim işi gerekir; eski sürümler silinmez.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-011
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-011
