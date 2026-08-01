import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  bundledOpenApi,
  contractTemporaryDirectory,
  openApiRoot,
  runRedocly,
} from "./common.mjs";

await mkdir(contractTemporaryDirectory, { recursive: true });
runRedocly([
  "bundle",
  openApiRoot,
  "--config",
  ".redocly.yaml",
  "--output",
  bundledOpenApi,
]);

const bundle = await readFile(bundledOpenApi);
const checksum = createHash("sha256").update(bundle).digest("hex");
await writeFile(
  `${bundledOpenApi}.sha256`,
  `${checksum}  openapi.bundle.yaml\n`,
  "utf8",
);

console.log(`OpenAPI bundle checksum: ${checksum}`);
