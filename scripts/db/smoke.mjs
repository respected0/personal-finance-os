import { spawnSync } from "node:child_process";
import { captureSchemaSnapshot } from "./schema-snapshot.mjs";
import {
  projectRoot,
  runSupabase,
  startLocalStack,
  verifySupabaseVersion,
} from "./common.mjs";

const startedAt = Date.now();
const version = verifySupabaseVersion();

const policyCheck = spawnSync(
  process.execPath,
  ["scripts/check-migrations.mjs"],
  {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
  },
);
if (policyCheck.error) {
  throw policyCheck.error;
}
if (policyCheck.status !== 0) {
  throw new Error("Migration policy kontrolü başarısız.");
}

let stackStarted = false;
try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
  });

  startLocalStack();
  stackStarted = true;
  runSupabase(["status"]);

  runSupabase(["db", "reset", "--local"]);
  const first = await captureSchemaSnapshot("reset-1");

  runSupabase(["db", "reset", "--local"]);
  const second = await captureSchemaSnapshot("reset-2");

  if (first.postgresMajor !== 17 || second.postgresMajor !== 17) {
    throw new Error(
      `PostgreSQL server major 17 olmalı; bulunan ${first.postgresMajor ?? "unknown"}/${second.postgresMajor ?? "unknown"}.`,
    );
  }
  if (first.checksum !== second.checksum) {
    throw new Error(
      `Schema drift bulundu: ${first.checksum} != ${second.checksum}.`,
    );
  }

  console.log("MIG-01 fresh migration smoke: PASS");
  console.log(`Supabase CLI: ${version}`);
  console.log("PostgreSQL server major: 17");
  console.log(`Reset 1 schema checksum: ${first.checksum}`);
  console.log(`Reset 2 schema checksum: ${second.checksum}`);
  console.log("Schema drift: 0");
  console.log(`Süre: ${Date.now() - startedAt} ms`);
} finally {
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true },
    );
  }
}
