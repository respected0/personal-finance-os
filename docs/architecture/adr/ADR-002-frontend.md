# ADR-002 — Frontend

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Mobil hızlı giriş ile masaüstü analiz aynı responsive ürün ve ortak TypeScript sözleşmeleri üzerinden sunulmalıdır.

## Karar

TypeScript, Next.js App Router ve React kullanılacak; sayfalar server-first olacak, yalnız etkileşimli adalar client component olacaktır.

## Sonuçlar

Responsive web/PWA, SSR/BFF ve API tek projede birleşir. Server/client sınırı disiplin ister; native mobil uygulama P0 kapsamında değildir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-002
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-002
