import { runSupabase, verifySupabaseVersion } from "./common.mjs";

const version = verifySupabaseVersion();
console.log(`Repository Supabase CLI: ${version}`);
runSupabase(["stop", "--project-id", "personal-finance-os"]);
