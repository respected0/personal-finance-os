import { readFile } from "node:fs/promises";

const workflows = new Map([
  [
    ".github/workflows/quality.yml",
    [
      "quality / format",
      "quality / lint",
      "quality / typecheck",
      "quality / unit",
    ],
  ],
  [".github/workflows/security.yml", ["security / secret-scan"]],
  [".github/workflows/migration-smoke.yml", ["database / migration-smoke"]],
]);
const actionShaPattern = /uses:\s+actions\/[a-z-]+@[0-9a-f]{40}$/gm;
const floatingActionPattern =
  /uses:\s+[^\s]+@(v?\d+(?:\.\d+)*|main|master|latest)\s*$/gm;
const errors = [];
const allContents = [];

for (const [file, requiredChecks] of workflows) {
  const content = await readFile(file, "utf8");
  allContents.push(content);

  if (!content.includes("permissions:\n  contents: read")) {
    errors.push(`${file}: workflow permission contents: read olmalı.`);
  }
  if (/permissions:[\s\S]{0,120}\bwrite\b/.test(content)) {
    errors.push(`${file}: geniş write permission yasaktır.`);
  }
  if (floatingActionPattern.test(content)) {
    errors.push(`${file}: floating action referansı bulundu.`);
  }
  for (const check of requiredChecks) {
    if (!content.includes(`name: ${check}`)) {
      errors.push(`${file}: required check eksik: ${check}.`);
    }
  }
  if (
    !content.includes("pnpm install --frozen-lockfile") &&
    file !== ".github/workflows/security.yml"
  ) {
    errors.push(`${file}: frozen lockfile kurulumu eksik.`);
  }
}

const combined = allContents.join("\n");
const actionReferences =
  combined.match(/uses:\s+actions\/[a-z-]+@[^\s]+/g) ?? [];
const pinnedActionReferences = combined.match(actionShaPattern) ?? [];
if (actionReferences.length !== pinnedActionReferences.length) {
  errors.push(
    "Bütün GitHub Actions referansları 40 karakter commit SHA olmalı.",
  );
}
if (/secrets\.|SUPABASE_SERVICE_ROLE|PRODUCTION/i.test(combined)) {
  errors.push(
    "Workflow production secret veya service_role referansı içeremez.",
  );
}
if (!combined.includes("npm install --global pnpm@11.18.0")) {
  errors.push("CI pnpm 11.18.0 exact kurulumunu kullanmalı.");
}
if (!combined.includes("pnpm db:smoke")) {
  errors.push("database / migration-smoke pnpm db:smoke çalıştırmalı.");
}

const protectionDocument = await readFile(
  "docs/operations/github-branch-protection.md",
  "utf8",
);
for (const checks of workflows.values()) {
  for (const check of checks) {
    if (!protectionDocument.includes(`\`${check}\``)) {
      errors.push(
        `Branch protection belgesinde required check eksik: ${check}.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  "CI policy doğrulaması başarılı: 6 required check, dar izinler, immutable action referansları.",
);
