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

const rpcSignature = rlsHarnessMigration.match(
  /create\s+function\s+app_identity\.create_rls_probe_parent\s*\(([^)]*)\)/i,
);
if (!rpcSignature || /user_id/i.test(rpcSignature[1])) {
  errors.push("B008 RPC istemciden user_id parametresi alamaz.");
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
if (rootManifest.devDependencies?.supabase !== "2.110.0") {
  errors.push("Supabase CLI devDependency tam 2.110.0 olmalı.");
}
if (dbManifest.devDependencies?.["drizzle-kit"] !== "0.31.10") {
  errors.push("drizzle-kit devDependency tam 0.31.10 olmalı.");
}

const disallowedDependencies = ["drizzle-orm", "postgres", "testcontainers"];
for (const manifest of [rootManifest, dbManifest]) {
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    for (const dependency of disallowedDependencies) {
      if (manifest[field]?.[dependency]) {
        errors.push(`B004 kapsam dışı dependency: ${dependency}.`);
      }
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
