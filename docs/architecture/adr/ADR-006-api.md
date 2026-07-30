# ADR-006 — API

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Bugünkü web istemcisinin yanında gelecekte mobil istemci ve banka adaptörleri için teknoloji bağımsız, sürümlü bir sözleşme gerekir.

## Karar

REST `/api/v1`, OpenAPI 3.1, Zod doğrulama, JSON string para alanları ve RFC 7807 problem details kullanılacaktır.

## Sonuçlar

İstemciler açık bir contract üzerinden gelişebilir. OpenAPI ile runtime doğrulama arasındaki drift contract test ve tek kaynak üretim süreciyle korunmalıdır.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-006
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-006
