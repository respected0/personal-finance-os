# ADR-014 — Test

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Finans motoru yalnız UI üzerinden doğrulanamaz; saf domain değişmezleri, gerçek PostgreSQL kısıtları ve gerçek tarayıcı akışları ayrı kanıtlar gerektirir.

## Karar

Vitest ve fast-check, gerçek PostgreSQL/Testcontainers entegrasyonu, Playwright E2E/390×844/görsel testleri ve ortak UAT-01–16 fixture sözleşmesi kullanılacaktır.

## Sonuçlar

Unit/property, DB ve tarayıcı katmanları birbirini tamamlar. CI süresi ve fixture disiplini artar; her katmanın kabul kanıtı ayrı tutulur.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-014
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-014
