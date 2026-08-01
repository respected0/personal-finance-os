import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const image =
  "rhysd/actionlint@sha256:ef8299f97635c4c30e2298f48f30763ab782a4ad2c95b744649439a039421e36";
const projectRoot = path.resolve(import.meta.dirname, "..", "..");

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--volume",
    `${projectRoot}:/repo:ro`,
    "--workdir",
    "/repo",
    image,
    "-color",
  ],
  { stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
