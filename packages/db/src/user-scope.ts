import type postgres from "postgres";
import type { LedgerSql } from "./ledger-repository.js";

export type UserScopedSql = postgres.TransactionSql;

export async function applyUserScope(
  tx: UserScopedSql,
  userId: string,
): Promise<void> {
  await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  await tx`set local role pfos_runtime`;
}

export async function withUserScope<T>(
  sql: LedgerSql,
  userId: string,
  callback: (tx: UserScopedSql) => Promise<T>,
): Promise<T> {
  const result = await sql.begin(async (tx) => {
    await applyUserScope(tx, userId);
    return callback(tx);
  });
  return result as T;
}
