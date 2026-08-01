import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createTwoUserContext } from "../../../test-kit/dist/auth/two-user-context.js";
import {
  projectRoot,
  runSupabase,
  startLocalRlsStack,
} from "../../../../scripts/db/common.mjs";

const users = createTwoUserContext(Date.now().toString(36));
const authOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
};
const createdUserIds = [];
let adminClient;

function requiredStatusValue(status, key) {
  const value = status[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Supabase local status ${key} alanını üretmedi.`);
  }
  return value;
}

function assertSuccess(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

function assertZeroRows(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  if ((result.data?.length ?? 0) !== 0) {
    throw new Error(`${label}: cross-user satır etkisi 0 değil.`);
  }
}

async function createSyntheticUser(specification, apiUrl, anonKey) {
  const created = await adminClient.auth.admin.createUser({
    email: specification.email,
    password: specification.password,
    email_confirm: true,
    user_metadata: { fixture: `B008-synthetic-${specification.alias}` },
  });
  if (created.error || !created.data.user) {
    throw (
      created.error ?? new Error("Sentetik RLS kullanıcısı oluşturulamadı.")
    );
  }
  createdUserIds.push(created.data.user.id);

  const client = createClient(apiUrl, anonKey, {
    auth: authOptions,
    db: { schema: "app_identity" },
  });
  const signedIn = await client.auth.signInWithPassword({
    email: specification.email,
    password: specification.password,
  });
  if (signedIn.error || !signedIn.data.session) {
    throw (
      signedIn.error ?? new Error("Sentetik RLS kullanıcısı giriş yapamadı.")
    );
  }

  return {
    accessToken: signedIn.data.session.access_token,
    client,
    id: created.data.user.id,
  };
}

async function waitForRlsSchema(client) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const probe = await client.from("rls_probe_parents").select("id").limit(0);
    if (!probe.error) {
      return;
    }
    lastError = probe.error;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `B008 PostgREST schema cache 30 saniyede hazır olmadı: ${lastError?.message ?? "unknown"}`,
  );
}

async function inspectRuntimePolicies() {
  const sql = await readFile(
    path.join(projectRoot, "supabase/tests/rls/policy-introspection.sql"),
    "utf8",
  );
  const result = spawnSync(
    "docker",
    [
      "exec",
      "--interactive",
      "supabase_db_personal-finance-os",
      "psql",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--no-align",
      "--tuples-only",
      "--quiet",
      "--file=-",
    ],
    { encoding: "utf8", input: sql },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`RLS introspection başarısız: ${result.stderr}`);
  }

  return JSON.parse(result.stdout.trim());
}

try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalRlsStack();
  runSupabase(["db", "reset", "--local"], { capture: true });

  const statusResult = runSupabase(["status", "--output", "json"], {
    capture: true,
  });
  const status = JSON.parse(statusResult.stdout);
  const apiUrl = requiredStatusValue(status, "API_URL");
  const anonKey = requiredStatusValue(status, "ANON_KEY");
  const localAdminKey = requiredStatusValue(status, "SERVICE_ROLE_KEY");

  adminClient = createClient(apiUrl, localAdminKey, { auth: authOptions });
  const a = await createSyntheticUser(users.a, apiUrl, anonKey);
  const b = await createSyntheticUser(users.b, apiUrl, anonKey);
  await waitForRlsSchema(a.client);

  const aParentId = randomUUID();
  const bParentId = randomUUID();
  assertSuccess(
    await a.client.rpc("create_rls_probe_parent", {
      p_id: aParentId,
      p_label: "synthetic-owner-A",
    }),
    "A parent RPC",
  );
  assertSuccess(
    await b.client.rpc("create_rls_probe_parent", {
      p_id: bParentId,
      p_label: "synthetic-owner-B",
    }),
    "B parent RPC",
  );

  const aChildId = randomUUID();
  const bChildId = randomUUID();
  assertSuccess(
    await a.client
      .from("rls_probe_children")
      .insert({
        id: aChildId,
        label: "synthetic-child-A",
        parent_id: aParentId,
        user_id: a.id,
      })
      .select("id"),
    "A child insert",
  );
  assertSuccess(
    await b.client
      .from("rls_probe_children")
      .insert({
        id: bChildId,
        label: "synthetic-child-B",
        parent_id: bParentId,
        user_id: b.id,
      })
      .select("id"),
    "B child insert",
  );

  assertZeroRows(
    await a.client.from("rls_probe_parents").select("id").eq("user_id", b.id),
    "SEC-RLS-06 cross-user read",
  );

  const injectedParentId = randomUUID();
  const injectedWrite = await a.client.from("rls_probe_parents").insert({
    id: injectedParentId,
    label: "forbidden-owner-injection",
    user_id: b.id,
  });
  if (!injectedWrite.error) {
    throw new Error("SEC-RLS-06 user_id body injection reddedilmedi.");
  }

  assertZeroRows(
    await a.client
      .from("rls_probe_parents")
      .update({ label: "forbidden-update" })
      .eq("id", bParentId)
      .select("id"),
    "SEC-RLS-06 cross-user update",
  );
  assertZeroRows(
    await a.client
      .from("rls_probe_parents")
      .delete()
      .eq("id", bParentId)
      .select("id"),
    "SEC-RLS-06 cross-user delete",
  );
  assertZeroRows(
    await a.client.from("rls_probe_children").select("id").eq("id", bChildId),
    "SEC-RLS-06 cross-user child read",
  );

  const compositeMismatch = await a.client.from("rls_probe_children").insert({
    id: randomUUID(),
    label: "forbidden-composite-link",
    parent_id: bParentId,
    user_id: a.id,
  });
  if (!compositeMismatch.error || compositeMismatch.error.code !== "23503") {
    throw new Error("B008 composite ownership FK mismatch reddedilmedi.");
  }

  const rpcInjectionId = randomUUID();
  const userIdRpcInjection = await a.client.rpc("create_rls_probe_parent", {
    p_id: rpcInjectionId,
    p_label: "forbidden-rpc-owner-injection",
    p_user_id: b.id,
  });
  if (!userIdRpcInjection.error) {
    throw new Error(
      "SEC-RPC-07 RPC user_id parametre enjeksiyonu reddedilmedi.",
    );
  }
  assertZeroRows(
    await a.client
      .from("rls_probe_parents")
      .select("id")
      .eq("id", rpcInjectionId),
    "SEC-RPC-07 injected RPC row",
  );

  const searchPathInjection = await a.client.rpc("create_rls_probe_parent", {
    p_id: randomUUID(),
    p_label: "forbidden-search-path-injection",
    p_search_path: "public, attacker",
  });
  if (!searchPathInjection.error) {
    throw new Error(
      "SEC-RPC-07 search_path parametre enjeksiyonu reddedilmedi.",
    );
  }

  const privilegedHeaderAttempt = await fetch(
    `${apiUrl}/rest/v1/rls_probe_parents?select=id&id=eq.${bParentId}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Profile": "app_identity",
        Authorization: `Bearer ${a.accessToken}`,
        apikey: anonKey,
        "x-service-role": localAdminKey,
      },
    },
  );
  const privilegedHeaderRows = await privilegedHeaderAttempt.json();
  if (
    !privilegedHeaderAttempt.ok ||
    !Array.isArray(privilegedHeaderRows) ||
    privilegedHeaderRows.length !== 0
  ) {
    throw new Error(
      "SEC-ROLE-08 arbitrary service-role header RLS bypass yaptı.",
    );
  }

  const introspection = await inspectRuntimePolicies();
  const expectedIntrospection = {
    rls_table_count: 2,
    policy_count: 8,
    authenticated_table_grants: 2,
    anon_table_grants: 0,
    composite_ownership_fk_count: 1,
    security_definer: true,
    fixed_search_path: true,
    rpc_has_user_id_argument: false,
    authenticated_rpc_execute: true,
    anon_rpc_execute: false,
  };
  if (JSON.stringify(introspection) !== JSON.stringify(expectedIntrospection)) {
    throw new Error(
      `B008 RLS/grant introspection beklenen sözleşmeyle eşleşmedi: ${JSON.stringify(introspection)}`,
    );
  }

  console.log(
    "SEC-RLS-06 cross-user read/write/update/delete affected rows: 0",
  );
  console.log("SEC-RLS-06 composite ownership mismatch: rejected");
  console.log("SEC-RPC-07 user_id/search_path misuse: rejected");
  console.log("SEC-ROLE-08 arbitrary privileged header bypass rows: 0");
  console.log(
    `B008 policy/grant introspection: ${JSON.stringify(introspection)}`,
  );
} finally {
  if (adminClient) {
    for (const userId of createdUserIds) {
      await adminClient.auth.admin.deleteUser(userId);
    }
  }
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
}
