import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const expectedSupabaseVersion = "2.110.0";
export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const localServiceExclusions = [
  "gotrue",
  "realtime",
  "storage-api",
  "imgproxy",
  "kong",
  "mailpit",
  "postgrest",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
].join(",");

export const localAuthServiceExclusions = [
  "realtime",
  "storage-api",
  "imgproxy",
  "mailpit",
  "postgrest",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
].join(",");

const cliPath = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);
const cliHome = path.join(projectRoot, ".tmp", "supabase-home");

function assertLocalDockerTarget() {
  const dockerHost = process.env.DOCKER_HOST;
  if (
    dockerHost &&
    !/^(unix:|npipe:|tcp:\/\/(?:127\.0\.0\.1|localhost)(?::|$))/i.test(
      dockerHost,
    )
  ) {
    throw new Error(
      `Remote Docker hedefi reddedildi: ${dockerHost}. B004 yalnız local stack çalıştırır.`,
    );
  }
}

function assertLocalCliArguments(args) {
  const serialized = args.join(" ");
  if (/(^|\s)(link|--linked|--db-url|--project-ref)(\s|$)/.test(serialized)) {
    throw new Error(`Remote Supabase işlemi reddedildi: ${serialized}.`);
  }
}

export function runSupabase(
  args,
  { capture = false, allowFailure = false } = {},
) {
  assertLocalDockerTarget();
  assertLocalCliArguments(args);
  mkdirSync(cliHome, { recursive: true });

  const originalHome = process.env.HOME;
  const dockerConfig =
    process.env.DOCKER_CONFIG ??
    (originalHome ? path.join(originalHome, ".docker") : undefined);
  const env = {
    ...process.env,
    HOME: cliHome,
    NO_COLOR: "1",
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
    ...(dockerConfig ? { DOCKER_CONFIG: dockerConfig } : {}),
  };

  const result = spawnSync(cliPath, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env,
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `Supabase CLI başarısız (${result.status}): ${args.join(" ")}${detail ? `\n${detail}` : ""}`,
    );
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function verifySupabaseVersion() {
  const result = runSupabase(["--version"], { capture: true });
  const actualVersion = result.stdout.trim();
  if (actualVersion !== expectedSupabaseVersion) {
    throw new Error(
      `Supabase CLI ${expectedSupabaseVersion} olmalı; bulunan ${actualVersion || "yok"}.`,
    );
  }
  return actualVersion;
}

export function startLocalStack() {
  return runSupabase(["start", "--exclude", localServiceExclusions]);
}

export function startLocalAuthStack() {
  return runSupabase(["start", "--exclude", localAuthServiceExclusions], {
    capture: true,
  });
}
