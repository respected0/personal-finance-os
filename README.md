# Personal Finance OS

Bu repository, Kişisel Finans İşletim Sistemi’nin M0 Foundation ilk implementasyon dilimini içerir.

## Kapsam

- B001: ADR-001–ADR-016 karar kayıtları
- B002: pnpm workspace ve import sınırları
- B003: pull request kalite ve secret-scan pipeline’ı
- B004: PostgreSQL 17 / Supabase local migration temeli
- B005: OpenAPI 3.1, problem details ve breaking-diff sözleşmesi
- B006: threat model, veri sınıfları ve kontrol sahipliği
- B009: request_id taşıyan structured redacted logging

B007, B008 ve B010 ile P0-A, P0-B ve RC özellikleri bu dilimde
uygulanmamıştır.

## Gereksinimler

- Node.js 24.18.0
- pnpm 11.18.0

## Doğrulama

```bash
pnpm install --frozen-lockfile
pnpm check
```

## Local Database

Docker uyumlu local container runtime çalışırken:

```bash
pnpm db:start
pnpm db:status
pnpm db:reset
pnpm db:checksum
pnpm db:smoke
pnpm db:stop
```

Komutlar repository içinde tam sürümü sabitlenmiş Supabase CLI’ı kullanır.
PostgreSQL major sürümü 17’dir. SQL migration dosyaları tek şema otoritesidir;
Drizzle push ve dashboard üzerinden kayıtsız şema değişikliği yasaktır.
