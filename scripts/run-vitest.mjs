import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const temporaryDirectory = path.resolve(".tmp", "vitest");
const vitestEntryPoint = path.resolve(
  path.dirname(fileURLToPath(import.meta.resolve("vitest"))),
  "..",
  "vitest.mjs",
);

await mkdir(temporaryDirectory, { recursive: true });

const result = spawnSync(process.execPath, [vitestEntryPoint, "run"], {
  stdio: "inherit",
  env: {
    ...process.env,
    TEMP: temporaryDirectory,
    TMP: temporaryDirectory,
    TMPDIR: temporaryDirectory,
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
