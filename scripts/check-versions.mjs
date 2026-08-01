import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageFiles = [
  "package.json",
  "apps/web/package.json",
  "packages/domain/package.json",
  "packages/db/package.json",
  "packages/contracts/package.json",
  "packages/ui/package.json",
  "packages/test-kit/package.json",
];
const errors = [];
const requiredVersions = new Map([
  ["@typescript/native", "npm:typescript@7.0.2"],
  ["@redocly/cli", "2.41.1"],
  ["@types/node", "24.13.3"],
  ["@types/react", "19.2.18"],
  ["typescript", "npm:@typescript/typescript6@6.0.2"],
  ["next", "16.2.12"],
  ["react", "19.2.8"],
  ["react-dom", "19.2.8"],
  ["eslint", "10.8.0"],
  ["eslint-config-next", "16.2.12"],
  ["eslint-plugin-boundaries", "7.1.0"],
  ["prettier", "3.9.6"],
  ["zod", "4.4.3"],
  ["pino", "10.3.1"],
  ["pino-pretty", "13.1.3"],
  ["supabase", "2.110.0"],
  ["drizzle-kit", "0.31.10"],
  ["vitest", "4.1.10"],
]);
const observed = new Map();

for (const packageFile of packageFiles) {
  const manifest = JSON.parse(
    await readFile(path.resolve(packageFile), "utf8"),
  );
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (
        version === "latest" ||
        version.includes("*") ||
        version.startsWith("^") ||
        version.startsWith("~")
      ) {
        errors.push(`${packageFile}: ${name} tam sürüm değil (${version}).`);
      }
      observed.set(name, version);
    }
  }
}

for (const [name, version] of requiredVersions) {
  if (observed.get(name) !== version) {
    errors.push(
      `${name} sürümü ${version} olmalı; bulunan: ${observed.get(name) ?? "yok"}.`,
    );
  }
}

const rootManifest = JSON.parse(await readFile("package.json", "utf8"));
if (rootManifest.packageManager !== "pnpm@11.18.0") {
  errors.push("packageManager pnpm@11.18.0 olmalı.");
}
if (rootManifest.engines?.node !== "24.18.0") {
  errors.push("Node engine 24.18.0 olmalı.");
}
if (rootManifest.engines?.pnpm !== "11.18.0") {
  errors.push("pnpm engine 11.18.0 olmalı.");
}

const contractToolPolicy = await readFile(
  "scripts/contracts/common.mjs",
  "utf8",
);
if (!contractToolPolicy.includes('expectedOasdiffVersion = "v1.26.1"')) {
  errors.push("oasdiff sürümü exact v1.26.1 olmalı.");
}
if (
  !contractToolPolicy.includes(
    "sha256:aae8cfcf7d18d3b0ebce6bdf407623bf8788ca318c7a0440627aaf583ed3e9f4",
  )
) {
  errors.push("oasdiff 1.26.1 immutable container digest’i eksik.");
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("Bağımlılık sürümleri tam ve bağlayıcı tabanla uyumlu.");
