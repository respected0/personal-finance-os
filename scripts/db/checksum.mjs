import { captureSchemaSnapshot } from "./schema-snapshot.mjs";
import { verifySupabaseVersion } from "./common.mjs";

const version = verifySupabaseVersion();
const snapshot = await captureSchemaSnapshot("manual");

console.log(`Supabase CLI: ${version}`);
console.log(`PostgreSQL server major: ${snapshot.postgresMajor ?? "unknown"}`);
console.log(`Schema checksum (sha256): ${snapshot.checksum}`);
