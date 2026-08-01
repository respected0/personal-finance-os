import { Buffer } from "node:buffer";
import {
  createLedgerSql,
  type AccountNameKeyring,
  type LedgerSql,
} from "@personal-finance-os/db";
import { cookies } from "next/headers";
import { createSupabaseBffClient } from "../auth/supabase-server";
import { createProblemResponse } from "../observability/problem-response";
import { createRequestContext } from "../observability/request-context";

export class FinanceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FinanceApiError";
  }
}

export interface FinanceRequestRuntime {
  readonly userId: string;
  readonly requestId: string;
  readonly sql: LedgerSql;
  readonly accountNameKeyring: AccountNameKeyring;
}

let databaseClient: LedgerSql | undefined;
let databaseClientUrl: string | undefined;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new FinanceApiError(
      503,
      "service_unavailable",
      "Required server configuration is unavailable.",
    );
  }
  return value;
}

function financeSql(): LedgerSql {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  if (!databaseClient || databaseClientUrl !== databaseUrl) {
    databaseClient = createLedgerSql(databaseUrl, { max: 8 });
    databaseClientUrl = databaseUrl;
  }
  return databaseClient;
}

function accountNameKeyring(): AccountNameKeyring {
  const activeKeyId = requiredEnvironment("ACCOUNT_NAME_ACTIVE_KEY_ID");
  const encodedKey = requiredEnvironment("ACCOUNT_NAME_KEY_B64");
  const key = Buffer.from(encodedKey, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== encodedKey) {
    throw new FinanceApiError(
      503,
      "service_unavailable",
      "Account encryption configuration is invalid.",
    );
  }
  return {
    activeKeyId,
    keys: new Map([[activeKeyId, key]]),
  };
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new FinanceApiError(403, "forbidden", "Cross-origin write denied.");
  }
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : requestUrl.protocol.slice(0, -1);
  const hostOrigin = host ? `${protocol}://${host}` : undefined;
  if (
    origin &&
    origin !== requestUrl.origin &&
    (hostOrigin === undefined || origin !== hostOrigin)
  ) {
    throw new FinanceApiError(403, "forbidden", "Cross-origin write denied.");
  }
}

export async function requireFinanceRuntime(
  request: Request,
  assurance: "aal1" | "aal2",
): Promise<FinanceRequestRuntime> {
  const requestId = createRequestContext(request.headers).request_id;
  if (assurance === "aal2") assertSameOrigin(request);

  const cookieStore = await cookies();
  const supabase = createSupabaseBffClient({
    url: requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    cookies: {
      getAll: () => cookieStore.getAll(),
      set: (name, value, options) => cookieStore.set(name, value, options),
    },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new FinanceApiError(401, "unauthenticated", "Sign-in is required.");
  }
  if (assurance === "aal2") {
    const { data: aalData, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || aalData.currentLevel !== "aal2") {
      throw new FinanceApiError(
        403,
        "mfa_required",
        "Additional verification is required.",
      );
    }
  }

  return {
    userId: userData.user.id,
    requestId,
    sql: financeSql(),
    accountNameKeyring: accountNameKeyring(),
  };
}

export function financeJson(
  body: unknown,
  status: number,
  requestId: string,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    },
  });
}

export function parseFinanceInput<T>(
  schema: {
    safeParse(
      value: unknown,
    ):
      | { readonly success: true; readonly data: T }
      | { readonly success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FinanceApiError(
      422,
      "validation_failed",
      "Request validation failed.",
    );
  }
  return parsed.data;
}

export function financeProblem(error: unknown, request: Request): Response {
  const requestId = createRequestContext(request.headers).request_id;
  const candidate = error as {
    readonly status?: unknown;
    readonly code?: unknown;
  };
  const status =
    typeof candidate?.status === "number" &&
    candidate.status >= 400 &&
    candidate.status <= 599
      ? candidate.status
      : error instanceof SyntaxError
        ? 422
        : 500;
  const code =
    typeof candidate?.code === "string" &&
    /^[a-z][a-z0-9_]{2,63}$/u.test(candidate.code)
      ? candidate.code
      : status === 422
        ? "validation_failed"
        : "internal_error";
  const title =
    status === 401
      ? "Sign-in is required"
      : status === 403
        ? "Request is not permitted"
        : status === 404
          ? "Resource was not found"
          : status === 409
            ? "Request conflicts with current state"
            : status === 422
              ? "Request validation failed"
              : status === 503
                ? "Service is temporarily unavailable"
                : "Request could not be completed";
  const problem = createProblemResponse({ status, code, title, requestId });
  return Response.json(problem.body, {
    status: problem.status,
    headers: {
      ...problem.headers,
      "cache-control": "private, no-store",
    },
  });
}
