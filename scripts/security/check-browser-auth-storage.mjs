import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const roots = ["apps/web/src"];
const forbiddenPatterns = [
  [/\blocalStorage\b/u, "localStorage auth storage"],
  [/\bsessionStorage\b/u, "sessionStorage auth storage"],
  [/\bSUPABASE_SERVICE_ROLE_KEY\b/u, "service_role environment variable"],
  [/\bservice_role\b/iu, "service_role credential"],
  [/\baccess_token\b/u, "provider access token"],
  [/\brefresh_token\b/u, "provider refresh token"],
  [/persistSession\s*:\s*true/u, "persistent browser auth session"],
];
const errors = [];

async function visit(target) {
  const targetStat = await stat(target);
  if (targetStat.isDirectory()) {
    const entries = await readdir(target);
    for (const entry of entries) {
      await visit(path.join(target, entry));
    }
    return;
  }
  if (!/\.(?:js|jsx|ts|tsx|mjs)$/u.test(target)) {
    return;
  }

  const content = await readFile(target, "utf8");
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(content)) {
      errors.push(`${target}: yasak ${label}.`);
    }
  }
}

for (const root of roots) {
  await visit(root);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  "Browser auth storage taraması başarılı: local/session storage token 0, service_role 0.",
);
