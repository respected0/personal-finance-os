import { createClient } from "@supabase/supabase-js";
import {
  runSupabase,
  startLocalAuthStack,
} from "../../../../../scripts/db/common.mjs";
import { generateTotp } from "../../../../../scripts/auth/totp.mjs";

const syntheticEmail = `uat-auth-${Date.now()}@example.test`;
const syntheticPassword = "Local-Only!Auth42-Test";
const authOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
};
let stackStarted = false;
let adminClient;
let syntheticUserId;

function requiredStatusValue(status, key) {
  const value = status[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Supabase local status ${key} alanını üretmedi.`);
  }
  return value;
}

try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalAuthStack();
  stackStarted = true;

  const statusResult = runSupabase(["status", "--output", "json"], {
    capture: true,
  });
  const status = JSON.parse(statusResult.stdout);
  const apiUrl = requiredStatusValue(status, "API_URL");
  const anonKey = requiredStatusValue(status, "ANON_KEY");
  const localAdminKey = requiredStatusValue(status, "SERVICE_ROLE_KEY");

  const publicClient = createClient(apiUrl, anonKey, { auth: authOptions });
  const signupAttempt = await publicClient.auth.signUp({
    email: syntheticEmail,
    password: syntheticPassword,
  });
  if (!signupAttempt.error) {
    throw new Error("Invite dışı public signup reddedilmedi.");
  }

  adminClient = createClient(apiUrl, localAdminKey, { auth: authOptions });
  const created = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password: syntheticPassword,
    email_confirm: true,
    user_metadata: { fixture: "B007-synthetic" },
  });
  if (created.error || !created.data.user) {
    throw (
      created.error ?? new Error("Sentetik invite kullanıcısı oluşturulamadı.")
    );
  }
  syntheticUserId = created.data.user.id;

  const userClient = createClient(apiUrl, anonKey, { auth: authOptions });
  const signedIn = await userClient.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword,
  });
  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error("Sentetik kullanıcı login olamadı.");
  }

  const enrolled = await userClient.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "B007 local synthetic factor",
  });
  const factorId = enrolled.data?.id;
  const secret = enrolled.data?.totp?.secret;
  if (enrolled.error || !factorId || !secret) {
    throw enrolled.error ?? new Error("TOTP factor enroll edilemedi.");
  }

  const verified = await userClient.auth.mfa.challengeAndVerify({
    factorId,
    code: generateTotp(secret),
  });
  if (verified.error || !verified.data.access_token) {
    throw verified.error ?? new Error("TOTP AAL2 verification başarısız.");
  }

  const assurance = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") {
    throw assurance.error ?? new Error("Oturum AAL2 düzeyine yükselmedi.");
  }

  console.log("B007 invite-only signup rejection: PASS");
  console.log("B007 synthetic password login: PASS");
  console.log("B007 TOTP verification and AAL2 session: PASS");
  console.log("B007 provider session persistence: disabled");
} finally {
  if (adminClient && syntheticUserId) {
    await adminClient.auth.admin.deleteUser(syntheticUserId);
  }
  if (stackStarted) {
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
  }
}
