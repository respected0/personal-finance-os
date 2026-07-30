# ADR-015 — Repository

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Domain motoru UI ve DB’den ayrılmalı; buna karşılık şema, API ve uygulama değişiklikleri aynı repository içinde atomik yapılabilmelidir.

## Karar

`apps/web` ile `packages/domain`, `db`, `contracts`, `ui` ve `test-kit` içeren pnpm workspace kullanılacaktır. Turborepo veya Nx ilk gün eklenmeyecektir.

## Sonuçlar

Paketler açık public export’larla ayrılır ve import sınırları ESLint ile korunur. Küçük proje için klasör sayısı artar, ancak gelecekte worker veya başka istemci eklenebilir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-015
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-015
