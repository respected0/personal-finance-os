# G5 — P0-B1 Planlama Kapısı

- Kapsam: B062–B072
- Sonuç: **PASS**
- Uygulama PR'ları: [#21](https://github.com/respected0/personal-finance-os/pull/21), [#22](https://github.com/respected0/personal-finance-os/pull/22)
- Son ürün merge SHA: `940ee2aea5097e5bb8bac08bb57d8fbd83202f14`
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
- Browser UAT-09/UAT-11: PR #22 `auth / integration` PASS (3m21s); beklenen ödeme gerçekleşmesi sonrası desktop→mobile ardışık net-servet kanıtı PASS
- GitHub PR #22: 10/10 zorunlu kontrol PASS; database migration-smoke PASS (8m37s)
- Bağımlı P0-B2/G6 aşamasına geçiş: AÇIK
