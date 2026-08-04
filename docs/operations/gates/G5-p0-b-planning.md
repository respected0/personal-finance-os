# G5 — P0-B1 Planlama Kapısı

- Kapsam: B062–B072
- Sonuç: Yerel kabul PASS; GitHub PR/CI kanıtı merge sonrasında bu dosyada kesinleştirilecektir.
- Şema: `20260804173000_p0_b1_budget_goals.sql`, `20260804190000_p0_b1_expected_investable.sql`
- Bütçe gerçekleşeni yalnız posted expense posting rollerinden türetilir.
- Hedef tahsisi sanaldır; ledger, hesap bakiyesi ve net servet etkisi sıfırdır; INV-07 SERIALIZABLE/FOR UPDATE sınırı negatif eşzamanlılık testiyle korunur.
- Beklenen ödeme gerçekleşmeden önce gelir, net servet ve planlama etkisi `0.0000`'dır; gerçekleşme aynı transaction içinde kilitlenir ve tam bir kez posted gelir üretir.
- Kanonik yatırılabilir tutar `max(0, doğrulanmış likit - taahhütlü çıkış - işletme tamponu - yakın dönem hedef rezervi)` formülünün sürümlü, değiştirilemez sonucudur.
- Beklenen ödeme ve şüpheli alacak kanıtta görünür, formüle dahil edilen tutarları `0.0000`'dır.
- Typed contract, REST `/api/v1`, OpenAPI 3.1, mobile-first web ve sentetik PostgreSQL/browser kabul zinciri aynı dilimde tutulur.

## Kabul kanıtları

- Unit/decimal float boundary: PASS (118 test)
- PostgreSQL B062–B072, RLS cross-user, encryption-at-rest ve UAT-09/UAT-11: PASS
- Fresh migration PASS; iki reset checksum `186931110f4d76515e618578556944500b20af651a6ccd3ed9e499af36c99afb`; drift 0
- `pnpm check`, OpenAPI additive diff, secret/runtime credential scan: PASS
- RLS ve data-lifecycle full-fidelity kabulü: PASS
- Yerel browser: Linux `libnspr4.so` makine bağımlılığı eksik; ürün build PASS ve browser senaryosu GitHub Ubuntu runner'ında zorunlu CI kanıtı olarak çalışacak
- GitHub PR/CI: merge sonrasında PR ve merge SHA ile güncellenecek
