# Güvenlik Kontrol Sahipliği

## Sorumluluk modeli

| Rol      | Sorumluluk                                                                             |
| -------- | -------------------------------------------------------------------------------------- |
| Security | Tehdit modeli, auth güven düzeyi, CSRF/CSP, anahtar ve webhook doğrulama sözleşmesi    |
| Backend  | RLS, yetkilendirme, parametreli veri erişimi, ledger grant/immutability ve idempotency |
| Domain   | Parasal kesinlik, posting değişmezleri ve deterministik hesaplama                      |
| Frontend | Güvenli render, unsafe HTML yasağı, session materyalini istemci saklamasına koymama    |
| DevOps   | Dependency/lockfile, secret yönetimi, backup, restore ve monitoring sınırları          |
| QA       | Negatif, concurrency, restore ve release kanıtlarının bağımsız doğrulanması            |

Birincil sahip kontrolün tasarım ve uygulama hesabını taşır. QA doğrulama bağımsızlığını korur. Backlog görevleri tamamlanmadan durum `Planlandı` olarak kalır.

## Tehdit-kontrol sahipliği

| Tehdit | Birincil sahip | Uygulayacak backlog | Zorunlu kanıt                                                  | Durum     |
| ------ | -------------- | ------------------- | -------------------------------------------------------------- | --------- |
| T-01   | Security       | B007, B099, B100    | Login/MFA/recovery E2E; revoke sonrası write 0; login alarmı   | Planlandı |
| T-02   | Backend        | B008                | Cross-user read/write matrisi; başka kullanıcı satır etkisi 0  | Planlandı |
| T-03   | Backend        | B017, B018, B022    | Posted UPDATE/DELETE denied; reversal ve audit izi             | Planlandı |
| T-04   | Backend        | B019, B021, B023    | Aynı key aynı sonuç; farklı payload 409; duplicate event 0     | Planlandı |
| T-05   | Frontend       | B097                | HttpOnly cookie incelemesi; XSS/CSP browser negatif testi      | Planlandı |
| T-06   | Security       | B097                | Cross-origin write reddi; Origin/SameSite/CSRF testi           | Planlandı |
| T-07   | Backend        | B005, B021, B097    | Injection fuzz; parametreli sorgu; allowlist sort              | Planlandı |
| T-08   | DevOps         | B058, B101, B102    | Şifreli export, link expiry, checksum ve restore drill         | Planlandı |
| T-09   | Backend        | B009                | Canary hassas değerlerin logda bulunmaması                     | Planlandı |
| T-10   | Domain         | B011, B024          | Float sınırı 0; random money/rounding property testi           | Planlandı |
| T-11   | Backend        | B048, B081          | İki paralel istekte tek geçerli final state                    | Planlandı |
| T-12   | DevOps         | B003, B104          | Exact lockfile, advisory/SBOM ve review kanıtı                 | Planlandı |
| T-13   | Security       | B007, B099          | Session list/revoke; revoked session write 0; offline secret 0 | Planlandı |
| T-14   | Security       | B008, B098          | Seçili alan AEAD, least privilege ve key-loss fail-closed      | Planlandı |
| T-15   | Backend        | B060, B101          | Aktif veri purge, backup expiry ve orphan data 0               | Planlandı |
| T-16   | Security       | B019, B104          | Sahte imza/stale timestamp/replay reddi; quarantine            | Planlandı |

## Değişiklik ve kabul

- Bir kayıt ancak ilgili backlog kabul kanıtı üretildiğinde uygulanmış sayılabilir.
- Kontrol sahibi ve doğrulayan rol aynı kişi olsa bile test kanıtı ayrı artefact olarak tutulur.
- Kalan risk `threat-register.json` içinde kayıtlıdır ve release review’da yeniden değerlendirilir.
