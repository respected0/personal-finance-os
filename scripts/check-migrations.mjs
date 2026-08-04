import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  findForbiddenMigrationPatterns,
  findForbiddenSeedPatterns,
} from "./lib/migration-policy.mjs";

const rootDirectory = process.cwd();
const errors = [];
const migrationDirectory = path.join(rootDirectory, "supabase", "migrations");
const foundationMigrationName = "00000000000000_m0_foundation.sql";
const rlsHarnessMigrationName = "00000000000001_m0_rls_harness.sql";
const ledgerKernelMigrationName = "20260801173000_p0_a0_ledger_kernel.sql";
const dailyCoreMigrationName = "20260801212000_p0_a1_daily_core.sql";
const cardFlowsMigrationName = "20260801231500_p0_a2_card_flows.sql";
const subscriptionMigrationName = "20260801234500_p0_a2_subscriptions.sql";
const sharingMigrationName = "20260803000000_p0_a2_sharing_receivables.sql";
const reconciliationMigrationName =
  "20260804130000_p0_a3_reconciliation_reversal.sql";

async function read(relativePath) {
  return readFile(path.join(rootDirectory, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (!migrationFiles.includes(foundationMigrationName)) {
  errors.push(`Eksik foundation migration: ${foundationMigrationName}.`);
}
if (!migrationFiles.includes(rlsHarnessMigrationName)) {
  errors.push(`Eksik B008 RLS migration: ${rlsHarnessMigrationName}.`);
}
if (!migrationFiles.includes(ledgerKernelMigrationName)) {
  errors.push(`Eksik P0-A0 ledger migration: ${ledgerKernelMigrationName}.`);
}
if (!migrationFiles.includes(dailyCoreMigrationName)) {
  errors.push(`Eksik P0-A1 daily core migration: ${dailyCoreMigrationName}.`);
}
if (!migrationFiles.includes(cardFlowsMigrationName)) {
  errors.push(`Eksik P0-A2 card migration: ${cardFlowsMigrationName}.`);
}
if (!migrationFiles.includes(subscriptionMigrationName)) {
  errors.push(
    `Eksik P0-A2 subscription migration: ${subscriptionMigrationName}.`,
  );
}
if (!migrationFiles.includes(sharingMigrationName)) {
  errors.push(`Eksik P0-A2 sharing migration: ${sharingMigrationName}.`);
}
if (!migrationFiles.includes(reconciliationMigrationName)) {
  errors.push(
    `Eksik P0-A3 reconciliation migration: ${reconciliationMigrationName}.`,
  );
}

const versions = new Set();
for (const migrationFile of migrationFiles) {
  const match = migrationFile.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
  if (!match) {
    errors.push(`Geçersiz migration dosya adı: ${migrationFile}.`);
    continue;
  }
  if (versions.has(match[1])) {
    errors.push(`Tekrarlanan migration sürümü: ${match[1]}.`);
  }
  versions.add(match[1]);

  const migration = await read(`supabase/migrations/${migrationFile}`);
  errors.push(
    ...findForbiddenMigrationPatterns(migration, {
      foundation: migrationFile === foundationMigrationName,
    }).map((error) => `${migrationFile}: ${error}`),
  );
}

const foundationMigration = await read(
  `supabase/migrations/${foundationMigrationName}`,
);
for (const requiredPattern of [
  [/\bcreate\s+schema\s+if\s+not\s+exists\s+app_identity\b/i, "app_identity"],
  [/\bcreate\s+schema\s+if\s+not\s+exists\s+app_private\b/i, "app_private"],
  [/\bcreate\s+role\s+pfos_runtime\b/i, "pfos_runtime"],
  [/\bcreate\s+role\s+pfos_migrator\b/i, "pfos_migrator"],
  [/\bnologin\b/i, "NOLOGIN"],
]) {
  if (!requiredPattern[0].test(foundationMigration)) {
    errors.push(
      `Foundation migration zorunlu ${requiredPattern[1]} temelini içermiyor.`,
    );
  }
}

const rlsHarnessMigration = await read(
  `supabase/migrations/${rlsHarnessMigrationName}`,
);
for (const [pattern, message] of [
  [
    /create\s+table\s+app_identity\.rls_probe_parents/i,
    "B008 parent ownership probe eksik.",
  ],
  [
    /foreign\s+key\s*\(user_id,\s*parent_id\)[\s\S]*references\s+app_identity\.rls_probe_parents\s*\(user_id,\s*id\)/i,
    "B008 composite ownership FK eksik.",
  ],
  [
    /alter\s+table\s+app_identity\.rls_probe_parents\s+enable\s+row\s+level\s+security/i,
    "B008 parent RLS açık değil.",
  ],
  [
    /alter\s+table\s+app_identity\.rls_probe_children\s+enable\s+row\s+level\s+security/i,
    "B008 child RLS açık değil.",
  ],
  [
    /to\s+authenticated[\s\S]*auth\.uid\(\)/i,
    "B008 authenticated auth.uid() policy eksik.",
  ],
  [
    /security\s+definer[\s\S]*set\s+search_path\s*=\s*pg_catalog,\s*app_identity/i,
    "B008 SECURITY DEFINER sabit search_path kullanmıyor.",
  ],
  [
    /revoke\s+all[\s\S]*create_rls_probe_parent\(uuid,\s*text\)[\s\S]*from\s+public,\s*anon,\s*service_role/i,
    "B008 RPC geniş EXECUTE grant taşıyor.",
  ],
]) {
  if (!pattern.test(rlsHarnessMigration)) {
    errors.push(message);
  }
}

const dailyCoreMigration = await read(
  `supabase/migrations/${dailyCoreMigrationName}`,
);
for (const [pattern, message] of [
  [
    /create\s+table\s+app_identity\.profiles/i,
    "P0-A1 binding profiles ownership root eksik.",
  ],
  [
    /create\s+trigger\s+auth_user_ensure_profile[\s\S]*app_identity\.ensure_profile_for_auth_user/i,
    "P0-A1 invite-only auth user profile bootstrap trigger'ı eksik.",
  ],
  [
    /alter\s+table\s+app_identity\.profiles\s+force\s+row\s+level\s+security/i,
    "P0-A1 profiles forced RLS açık değil.",
  ],
  [
    /foreign\s+key\s*\(user_id\)\s+references\s+app_identity\.profiles/i,
    "P0-A1 ürün sahipliği profiles köküne bağlı değil.",
  ],
  [
    /create\s+table\s+app_private\.institutions/i,
    "B025 institutions tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.financial_accounts/i,
    "B025 financial_accounts tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.categories/i,
    "B027/B028 categories tablosu eksik.",
  ],
  [
    /alter\s+column\s+system_role\s+drop\s+not\s+null/i,
    "B025 account-specific ledger hesabı için system_role nullable değil.",
  ],
  [
    /unique\s*\(user_id\s*,\s*ledger_account_id\s*\)/i,
    "B025 financial account benzersiz ledger bağı eksik.",
  ],
  [
    /foreign\s+key\s*\(user_id\s*,\s*financial_account_id\s*,\s*ledger_account_id\s*\)[\s\S]*references\s+app_private\.financial_accounts/i,
    "B025 posting/account/ledger composite FK eksik.",
  ],
  [
    /foreign\s+key\s*\(user_id\s*,\s*category_id\s*\)[\s\S]*references\s+app_private\.categories/i,
    "B027/B028 transaction/category composite FK eksik.",
  ],
  [
    /name_algorithm[\s\S]*AEAD_AES_256_GCM[\s\S]*name_nonce[\s\S]*octet_length\(name_nonce\)\s*=\s*12[\s\S]*name_auth_tag/i,
    "B025 account adı AEAD envelope metadata sözleşmesi eksik.",
  ],
  [
    /create\s+unique\s+index\s+transactions_single_opening_account_idx/i,
    "B026 tek açılış işlemi DB invariant'ı eksik.",
  ],
  [
    /alter\s+table\s+app_private\.financial_accounts\s+force\s+row\s+level\s+security/i,
    "B025 financial_accounts forced RLS açık değil.",
  ],
  [
    /create\s+policy\s+financial_accounts_runtime_own[\s\S]*auth\.uid\(\)/i,
    "B025 financial_accounts owner RLS policy eksik.",
  ],
  [
    /daily core entities are archived, never hard-deleted/i,
    "B025 archive-only lifecycle trigger'ı eksik.",
  ],
]) {
  if (!pattern.test(dailyCoreMigration)) {
    errors.push(message);
  }
}

const rpcSignature = rlsHarnessMigration.match(
  /create\s+function\s+app_identity\.create_rls_probe_parent\s*\(([^)]*)\)/i,
);

const cardFlowsMigration = await read(
  `supabase/migrations/${cardFlowsMigrationName}`,
);
for (const [pattern, message] of [
  [
    /create\s+table\s+app_private\.credit_card_profiles/i,
    "B037 credit_card_profiles tablosu eksik.",
  ],
  [
    /credit_limit\s+numeric\s*\(19\s*,\s*4\)[\s\S]*credit_limit\s*>=\s*0/i,
    "B037 credit limit exact/non-negative politikası eksik.",
  ],
  [
    /create\s+table\s+app_private\.credit_card_statements/i,
    "B040 credit_card_statements tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.statement_payments/i,
    "B040 statement_payments tablosu eksik.",
  ],
  [
    /check\s*\(paid_amount\s*<=\s*closing_balance\)/i,
    "B040 statement over-allocation DB kontrolü eksik.",
  ],
  [
    /create\s+table\s+app_private\.installment_plans/i,
    "B041 installment_plans tablosu eksik.",
  ],
  [
    /recognition_policy[\s\S]*full_at_purchase/i,
    "B041 full_at_purchase politikası eksik.",
  ],
  [
    /create\s+constraint\s+trigger\s+installment_plans_deferred_total[\s\S]*deferrable\s+initially\s+deferred/i,
    "B041 installment exact toplam constraint trigger'ı eksik.",
  ],
  [
    /alter\s+table\s+app_private\.credit_card_profiles\s+force\s+row\s+level\s+security/i,
    "B037 credit_card_profiles forced RLS açık değil.",
  ],
]) {
  if (!pattern.test(cardFlowsMigration)) errors.push(message);
}
if (!rpcSignature || /user_id/i.test(rpcSignature[1])) {
  errors.push("B008 RPC istemciden user_id parametresi alamaz.");
}

const subscriptionMigration = await read(
  `supabase/migrations/${subscriptionMigrationName}`,
);
for (const [pattern, message] of [
  [
    /create\s+table\s+app_private\.subscriptions/i,
    "B042 subscriptions tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.subscription_cycles/i,
    "B042 subscription_cycles tablosu eksik.",
  ],
  [
    /unique\s*\(user_id,\s*subscription_id,\s*period\)/i,
    "B042 cycle aylık uniqueness eksik.",
  ],
  [
    /cashback_total[\s\S]*actual_net[\s\S]*subscription_cycles_deferred_net/i,
    "B043 gross/cashback/actual-net deferred invariant eksik.",
  ],
  [
    /alter\s+table\s+app_private\.subscription_cycles\s+force\s+row\s+level\s+security/i,
    "B042 subscription cycle forced RLS açık değil.",
  ],
]) {
  if (!pattern.test(subscriptionMigration)) errors.push(message);
}

const sharingMigration = await read(
  `supabase/migrations/${sharingMigrationName}`,
);
for (const [pattern, message] of [
  [
    /create\s+table\s+app_private\.counterparties/i,
    "B044/B045 person counterparty tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.shared_expenses/i,
    "B044 shared_expenses tablosu eksik.",
  ],
  [
    /target_owner\s*\+\s*target_rounding\s*\+\s*share_total\s*<>\s*target_total/i,
    "B044 owner/pay/rounding/pay toplam deferred invariant eksik.",
  ],
  [
    /create\s+table\s+app_private\.obligations/i,
    "B046 obligations tablosu eksik.",
  ],
  [
    /estimated_collectible_amount\s*<=\s*nominal_amount\s*-\s*collected_amount/i,
    "B046 tahsil edilebilir değer üst sınırı eksik.",
  ],
  [
    /create\s+table\s+app_private\.settlements/i,
    "B047 settlements tablosu eksik.",
  ],
  [
    /create\s+constraint\s+trigger\s+settlements_deferred_invariants/i,
    "B047/B048 deferred settlement invariant eksik.",
  ],
  [
    /alter\s+table\s+app_private\.obligations\s+force\s+row\s+level\s+security/i,
    "B046 obligations forced RLS açık değil.",
  ],
  [
    /set\s+search_path\s*=\s*pg_catalog\s*,\s*app_private/i,
    "B044-B048 trigger fonksiyonları sabit search_path kullanmıyor.",
  ],
]) {
  if (!pattern.test(sharingMigration)) errors.push(message);
}

const reconciliationMigration = await read(
  `supabase/migrations/${reconciliationMigrationName}`,
);
for (const [pattern, message] of [
  [
    /create\s+table\s+app_private\.balance_snapshots/i,
    "B051 balance_snapshots tablosu eksik.",
  ],
  [
    /difference\s+numeric\s*\(19\s*,\s*4\)[\s\S]*generated\s+always\s+as\s*\(stated_balance\s*-\s*calculated_balance\)\s+stored/i,
    "B051 stated-calculated generated exact difference eksik.",
  ],
  [
    /create\s+table\s+app_private\.reconciliation_sessions/i,
    "B051 reconciliation_sessions tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.reconciliation_items/i,
    "B052 reconciliation_items tablosu eksik.",
  ],
  [
    /resolution_type\s+text[\s\S]*missing_transaction[\s\S]*adjustment[\s\S]*accepted/i,
    "B052 bağlayıcı çözüm türleri eksik.",
  ],
  [
    /create\s+constraint\s+trigger\s+reconciliation_items_deferred_invariants/i,
    "B052 deferred reconciliation invariant eksik.",
  ],
  [
    /create\s+constraint\s+trigger\s+transactions_deferred_revision/i,
    "B053 exact reversal deferred invariant eksik.",
  ],
  [
    /revision\s+does\s+not\s+exactly\s+reverse\s+the\s+original\s+postings/i,
    "B053 exact original posting reversal kontrolü eksik.",
  ],
  [
    /alter\s+table\s+app_private\.reconciliation_items\s+force\s+row\s+level\s+security/i,
    "B051/B052 forced RLS açık değil.",
  ],
  [
    /set\s+search_path\s*=\s*pg_catalog\s*,\s*app_private/i,
    "B051-B053 trigger fonksiyonları sabit search_path kullanmıyor.",
  ],
]) {
  if (!pattern.test(reconciliationMigration)) errors.push(message);
}

const ledgerKernelMigration = await read(
  `supabase/migrations/${ledgerKernelMigrationName}`,
);
for (const [pattern, message] of [
  [
    /create\s+table\s+app_private\.ledger_accounts/i,
    "B016 ledger_accounts tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.transactions/i,
    "B016 transactions tablosu eksik.",
  ],
  [
    /create\s+table\s+app_private\.ledger_postings/i,
    "B016 ledger_postings tablosu eksik.",
  ],
  [
    /numeric\s*\(19\s*,\s*4\)/i,
    "B011/B016 numeric(19,4) para politikası eksik.",
  ],
  [/numeric\s*\(28\s*,\s*12\)/i, "B016 numeric(28,12) FX politikası eksik."],
  [
    /create\s+constraint\s+trigger\s+transactions_deferred_balance[\s\S]*deferrable\s+initially\s+deferred/i,
    "B017 deferred transaction denge trigger'ı eksik.",
  ],
  [
    /posting_count\s*<\s*2\s+or\s+debit_total\s*<>\s*credit_total/i,
    "B017 exact debit/credit denge kontrolü eksik.",
  ],
  [
    /posted transaction is immutable/i,
    "B018 posted transaction immutability trigger'ı eksik.",
  ],
  [
    /posted transaction cannot accept new ledger rows/i,
    "B018 posted transaction yeni posting/link kabulünü engellemiyor.",
  ],
  [
    /create\s+table\s+app_private\.idempotency_keys/i,
    "B019 idempotency store eksik.",
  ],
  [
    /primary\s+key\s*\(user_id\s*,\s*key\)/i,
    "B019 user-scoped idempotency anahtarı eksik.",
  ],
  [
    /create\s+table\s+app_private\.audit_events/i,
    "B022 append-only audit_events eksik.",
  ],
  [
    /create\s+table\s+app_private\.outbox_events/i,
    "B023 transactional outbox eksik.",
  ],
  [
    /security\s+definer[\s\S]*set\s+search_path\s*=\s*pg_catalog\s*,\s*app_private/i,
    "P0-A0 SECURITY DEFINER sabit search_path kullanmıyor.",
  ],
  [
    /alter\s+table\s+app_private\.transactions\s+enable\s+row\s+level\s+security/i,
    "P0-A0 transactions RLS açık değil.",
  ],
  [
    /revoke\s+all[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
    "P0-A0 ledger tablolarının geniş grant'leri kaldırılmamış.",
  ],
]) {
  if (!pattern.test(ledgerKernelMigration)) {
    errors.push(message);
  }
}

const seed = await read("supabase/seed.sql");
errors.push(...findForbiddenSeedPatterns(seed));

const config = await read("supabase/config.toml");
for (const [pattern, message] of [
  [/\[db\][\s\S]*?\bmajor_version\s*=\s*17\b/, "PostgreSQL major 17 değil."],
  [/\[db\.migrations\][\s\S]*?\benabled\s*=\s*true\b/, "Migration kapalı."],
  [
    /\[db\.seed\][\s\S]*?\bsql_paths\s*=\s*\["\.\/seed\.sql"\]/,
    "Seed yolu sabit değil.",
  ],
  [/\[studio\][\s\S]*?\benabled\s*=\s*false\b/, "Studio kapalı değil."],
  [/\[auth\][\s\S]*?\benabled\s*=\s*true\b/, "B007 local auth açık değil."],
  [
    /\[auth\][\s\S]*?\benable_signup\s*=\s*false\b/,
    "B007 public signup kapalı değil.",
  ],
  [
    /\[auth\.email\][\s\S]*?\benable_signup\s*=\s*true\b/,
    "B007 invited email login sağlayıcısı açık değil.",
  ],
  [
    /\[auth\.mfa\.totp\][\s\S]*?\benroll_enabled\s*=\s*true\b[\s\S]*?\bverify_enabled\s*=\s*true\b/,
    "B007 TOTP enroll/verify açık değil.",
  ],
]) {
  if (!pattern.test(config)) {
    errors.push(message);
  }
}

const rootManifest = await readJson("package.json");
const dbManifest = await readJson("packages/db/package.json");
const domainManifest = await readJson("packages/domain/package.json");
if (rootManifest.devDependencies?.supabase !== "2.110.0") {
  errors.push("Supabase CLI devDependency tam 2.110.0 olmalı.");
}
if (dbManifest.devDependencies?.["drizzle-kit"] !== "0.31.10") {
  errors.push("drizzle-kit devDependency tam 0.31.10 olmalı.");
}
if (rootManifest.devDependencies?.["fast-check"] !== "4.9.0") {
  errors.push("P0-A0 fast-check devDependency tam 4.9.0 olmalı.");
}
if (rootManifest.devDependencies?.["@vitest/coverage-v8"] !== "4.1.10") {
  errors.push("P0-A0 coverage-v8 devDependency tam 4.1.10 olmalı.");
}
if (domainManifest.dependencies?.["decimal.js"] !== "10.6.0") {
  errors.push("P0-A0 decimal.js dependency tam 10.6.0 olmalı.");
}
if (dbManifest.dependencies?.["drizzle-orm"] !== "0.45.2") {
  errors.push("P0-A0 drizzle-orm dependency tam 0.45.2 olmalı.");
}
if (dbManifest.dependencies?.postgres !== "3.4.9") {
  errors.push("P0-A0 postgres dependency tam 3.4.9 olmalı.");
}
for (const manifest of [rootManifest, dbManifest, domainManifest]) {
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    if (manifest[field]?.testcontainers) {
      errors.push("Henüz kullanılmayan testcontainers dependency eklenemez.");
    }
  }
}

const manifestScripts = JSON.stringify({
  ...rootManifest.scripts,
  ...dbManifest.scripts,
});
if (/drizzle\s+push/i.test(manifestScripts)) {
  errors.push("Package scriptlerinde drizzle push kullanılamaz.");
}

const dbScripts = await Promise.all(
  (await readdir(path.join(rootDirectory, "scripts", "db")))
    .filter((name) => name.endsWith(".mjs") && name !== "common.mjs")
    .map(async (name) => [name, await read(`scripts/db/${name}`)]),
);
for (const [name, source] of dbScripts) {
  if (/--linked|--db-url|--project-ref/.test(source)) {
    errors.push(`${name}: remote Supabase flag’i kullanılamaz.`);
  }
}

const commonScript = await read("scripts/db/common.mjs");
if (!/assertLocalCliArguments/.test(commonScript)) {
  errors.push(
    "Ortak DB çalıştırıcısı local/remote argüman kapısını içermiyor.",
  );
}

const migrationPolicy = await read("docs/operations/database-migrations.md");
if (!/drizzle push[^.]*forbidden/i.test(migrationPolicy)) {
  errors.push("Migration policy drizzle push yasağını açıkça taşımıyor.");
}
if (!/dashboard-only[^.]*forbidden/i.test(migrationPolicy)) {
  errors.push("Migration policy dashboard-only schema yasağını taşımıyor.");
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `Migration policy doğrulaması başarılı: ${migrationFiles.length} sıralı SQL migration, PostgreSQL 17, seed DML 0, remote/push yolu 0.`,
);
