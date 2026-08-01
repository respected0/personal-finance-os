import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const targets = [
  ".env.example",
  "apps/web/src",
  "packages/contracts/src",
  "packages/db/src",
  "packages/domain/src",
  "packages/ui/src",
];
const forbiddenPatterns = [
  [/SUPABASE_SERVICE_ROLE_KEY/u, "Supabase service-role environment key"],
  [/SUPABASE_SECRET_KEY/u, "Supabase secret environment key"],
  [/\bservice[_-]role\b/iu, "service-role credential reference"],
  [/\bserviceRole(?:Key|Client|Credential)\b/u, "service-role adapter"],
];
const errors = [];

async function scan(target) {
  const targetStat = await stat(target);
  if (targetStat.isDirectory()) {
    for (const entry of await readdir(target)) {
      await scan(path.join(target, entry));
    }
    return;
  }
  if (!/\.(?:env|js|jsx|mjs|ts|tsx)$/u.test(target)) {
    return;
  }

  const source = await readFile(target, "utf8");
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(source)) {
      errors.push(`${target}: yasak ${label}.`);
    }
  }
}

for (const target of targets) {
  await scan(target);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  "Runtime credential taraması başarılı: normal browser/BFF source service-role referansı 0.",
);
