import { startLocalStack, verifySupabaseVersion } from "./common.mjs";

const version = verifySupabaseVersion();
console.log(`Repository Supabase CLI: ${version}`);
startLocalStack();
