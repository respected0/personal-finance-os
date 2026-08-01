import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const expectedVersion = "8.30.1";
const image =
  "ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f";
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const reportDirectory = path.join(projectRoot, ".tmp", "ci");

mkdirSync(reportDirectory, { recursive: true });

const version = spawnSync("docker", ["run", "--rm", image, "version"], {
  encoding: "utf8",
});
if (version.error) {
  throw version.error;
}
if (version.status !== 0 || !version.stdout.includes(expectedVersion)) {
  throw new Error(
    `Gitleaks ${expectedVersion} doğrulanamadı: ${version.stdout}${version.stderr}`,
  );
}

const args = [
  "run",
  "--rm",
  "--volume",
  `${projectRoot}:/repo`,
  "--workdir",
  "/repo",
  image,
  "detect",
  "--source=/repo",
  "--config=/repo/.gitleaks.toml",
  "--report-format=sarif",
  "--report-path=/repo/.tmp/ci/gitleaks.sarif",
  "--redact=100",
  "--no-banner",
];

if (process.env.CI_GITLEAKS_NO_GIT === "1") {
  args.push("--no-git");
}

const scan = spawnSync("docker", args, { stdio: "inherit" });
if (scan.error) {
  throw scan.error;
}

process.exit(scan.status ?? 1);
