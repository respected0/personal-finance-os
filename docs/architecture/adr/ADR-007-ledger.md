# ADR-007 — Ledger

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Transfer, kart ödemesi, yatırım ve cashback gibi akışlarda çift sayımın yapısal olarak önlenmesi ve posted kayıtların denetlenebilir kalması gerekir.

## Karar

Her kullanıcı olayı tek transaction header ve aynı database transaction’ında yazılan dengeli, immutable posting bacaklarıyla kaydedilecektir.

## Sonuçlar

Posted kayıt değiştirilemez veya silinemez; düzeltme ters kayıt ve gerekirse yeni işlemle yapılır. İlk uygulama maliyeti daha yüksektir, fakat finansal doğruluk yapısal olarak korunur.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, tek işlem ve dengeli kayıt motoru
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-007
