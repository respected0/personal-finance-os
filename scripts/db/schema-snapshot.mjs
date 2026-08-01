import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalizeSchemaDump,
  parsePostgresMajor,
} from "../lib/migration-policy.mjs";
import { projectRoot, runSupabase } from "./common.mjs";

export async function captureSchemaSnapshot(label) {
  const safeLabel = label.replace(/[^a-z0-9_-]/gi, "-");
  const outputDirectory = path.join(projectRoot, ".tmp", "db");
  const rawPath = path.join(outputDirectory, `${safeLabel}.sql`);
  const canonicalPath = path.join(
    outputDirectory,
    `${safeLabel}.canonical.sql`,
  );

  await mkdir(outputDirectory, { recursive: true });
  await rm(rawPath, { force: true });
  await rm(canonicalPath, { force: true });

  runSupabase([
    "db",
    "dump",
    "--local",
    "--keep-comments",
    "--schema",
    "app_identity,app_private",
    "--file",
    rawPath,
  ]);

  const raw = await readFile(rawPath, "utf8");
  const canonical = canonicalizeSchemaDump(raw);
  const checksum = createHash("sha256").update(canonical).digest("hex");
  const postgresMajor = parsePostgresMajor(raw);

  await writeFile(canonicalPath, canonical, "utf8");

  return {
    canonicalPath,
    checksum,
    postgresMajor,
    rawPath,
  };
}
