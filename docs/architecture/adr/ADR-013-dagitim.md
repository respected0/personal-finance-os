# ADR-013 — Dağıtım

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Tek kullanıcı için sunucu işletme yükü düşük tutulmalı; web/API, veritabanı ve auth standart teknolojilerle taşınabilir kalmalıdır.

## Karar

Web/API Vercel’de, PostgreSQL/Auth/Storage Supabase’te barındırılacak; DNS/alan adı bağımsız sağlayıcıda tutulacaktır.

## Sonuçlar

SSL/CDN ve preview dağıtımları düşük operasyonla sağlanır. İki sağlayıcı, plan sınırları ve bölgesel gecikme izlenmelidir; ücretsiz plan gerçek üretim dayanıklılığı sayılmaz.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-013
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-013
