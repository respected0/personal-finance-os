export interface SyntheticAuthUser {
  readonly alias: "A" | "B";
  readonly email: string;
  readonly password: string;
}

export interface TwoUserContext {
  readonly a: SyntheticAuthUser;
  readonly b: SyntheticAuthUser;
}

const syntheticPassword = "Local-Only!Rls42-Test";

export function createTwoUserContext(runId: string): TwoUserContext {
  if (!/^[a-z0-9-]{1,40}$/u.test(runId)) {
    throw new Error("Synthetic two-user run id is invalid.");
  }

  return Object.freeze({
    a: Object.freeze({
      alias: "A" as const,
      email: `uat-rls-a-${runId}@example.test`,
      password: syntheticPassword,
    }),
    b: Object.freeze({
      alias: "B" as const,
      email: `uat-rls-b-${runId}@example.test`,
      password: syntheticPassword,
    }),
  });
}
