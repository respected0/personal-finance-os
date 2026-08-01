import path from "node:path";
import { projectRoot, runOasdiff, toContainerPath } from "./common.mjs";

const fixtureDirectory = path.join(
  projectRoot,
  "scripts/fixtures/contracts/breaking",
);
const result = runOasdiff(
  [
    "breaking",
    toContainerPath(path.join(fixtureDirectory, "base.yaml")),
    toContainerPath(path.join(fixtureDirectory, "revision.yaml")),
    "--allow-external-refs=false",
    "--color=never",
    "--format=text",
    "--fail-on=ERR",
  ],
  { allowFailure: true },
);

if (result.status === 0) {
  throw new Error("Kasıtlı breaking fixture oasdiff gate’ini düşürmedi.");
}

console.log("OpenAPI breaking negatif fixture: PASS (beklenen ret). ");
