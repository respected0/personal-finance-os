import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  bundledOpenApi,
  contractTemporaryDirectory,
  projectRoot,
  run,
  runOasdiff,
  runRedocly,
  toContainerPath,
} from "./common.mjs";

const baseIndex = process.argv.indexOf("--base");
const requestedBase = baseIndex >= 0 ? process.argv[baseIndex + 1] : "main";
if (!requestedBase || !/^(?:origin\/)?main$/.test(requestedBase)) {
  throw new Error("Contract diff base yalnız main veya origin/main olabilir.");
}

const baseCandidates = [...new Set([requestedBase, "origin/main", "main"])];
const contractFiles = [
  "packages/contracts/openapi/openapi.yaml",
  "packages/contracts/openapi/components/problem-details.yaml",
];
let selectedBase;
let baseRoot;

for (const candidate of baseCandidates) {
  const result = run("git", ["show", `${candidate}:${contractFiles[0]}`], {
    allowFailure: true,
    quiet: true,
  });
  if (result.status === 0) {
    selectedBase = candidate;
    baseRoot = result.stdout;
    break;
  }
}

if (!selectedBase || !baseRoot) {
  console.log(
    "OpenAPI breaking diff: PASS (main üzerinde B005 baseline henüz yok).",
  );
  process.exit(0);
}

const baseDirectory = path.join(contractTemporaryDirectory, "base");
await mkdir(path.join(baseDirectory, "components"), { recursive: true });
await writeFile(path.join(baseDirectory, "openapi.yaml"), baseRoot, "utf8");

for (const contractFile of contractFiles.slice(1)) {
  const result = run("git", ["show", `${selectedBase}:${contractFile}`], {
    quiet: true,
  });
  await writeFile(
    path.join(baseDirectory, "components", path.basename(contractFile)),
    result.stdout,
    "utf8",
  );
}

const baseBundle = path.join(contractTemporaryDirectory, "base.bundle.yaml");
runRedocly([
  "bundle",
  path.join(baseDirectory, "openapi.yaml"),
  "--config",
  ".redocly.yaml",
  "--output",
  baseBundle,
]);

runOasdiff([
  "breaking",
  toContainerPath(baseBundle),
  toContainerPath(bundledOpenApi),
  "--allow-external-refs=false",
  "--color=never",
  "--format=text",
  "--fail-on=ERR",
]);

console.log(`OpenAPI breaking diff (${selectedBase}): PASS`);
