import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

export const projectRoot = path.resolve(import.meta.dirname, "..", "..");
export const openApiRoot = path.join(
  projectRoot,
  "packages/contracts/openapi/openapi.yaml",
);
export const contractTemporaryDirectory = path.join(
  projectRoot,
  ".tmp/contracts",
);
export const bundledOpenApi = path.join(
  contractTemporaryDirectory,
  "openapi.bundle.yaml",
);
export const expectedOasdiffVersion = "v1.26.1";
export const oasdiffImage =
  "tufin/oasdiff@sha256:aae8cfcf7d18d3b0ebce6bdf407623bf8788ca318c7a0440627aaf583ed3e9f4";

function assertLocalDockerTarget() {
  const dockerHost = process.env.DOCKER_HOST;
  if (
    dockerHost &&
    !/^(unix:|npipe:|tcp:\/\/(?:127\.0\.0\.1|localhost)(?::|$))/i.test(
      dockerHost,
    )
  ) {
    throw new Error(`Remote Docker hedefi reddedildi: ${dockerHost}.`);
  }
}

export function run(
  command,
  args,
  { allowFailure = false, quiet = false } = {},
) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.stdout && !quiet) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr && !quiet) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(" ")} başarısız.`);
  }

  return result;
}

export function runRedocly(args, options) {
  return run("redocly", args, options);
}

export function toContainerPath(localPath) {
  const relativePath = path.relative(projectRoot, localPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Repository dışı contract yolu reddedildi: ${localPath}.`);
  }
  return `/repo/${relativePath.split(path.sep).join("/")}`;
}

export function verifyOasdiffVersion() {
  assertLocalDockerTarget();
  const result = run("docker", ["run", "--rm", oasdiffImage, "--version"]);
  if (!result.stdout.includes(`oasdiff version ${expectedOasdiffVersion}`)) {
    throw new Error(
      `oasdiff ${expectedOasdiffVersion} olmalı; bulunan ${result.stdout.trim()}.`,
    );
  }
}

export function runOasdiff(args, options) {
  assertLocalDockerTarget();
  verifyOasdiffVersion();
  return run(
    "docker",
    [
      "run",
      "--rm",
      "--volume",
      `${projectRoot}:/repo:ro`,
      "--workdir",
      "/repo",
      oasdiffImage,
      ...args,
    ],
    options,
  );
}
