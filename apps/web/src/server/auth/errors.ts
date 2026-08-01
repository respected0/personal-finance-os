import { createProblemResponse } from "../observability/problem-response";

export type AuthFailure =
  | "invite_required"
  | "invalid_credentials"
  | "mfa_required"
  | "session_expired";

const authProblems = {
  invite_required: {
    status: 403,
    code: "invite_required",
    title: "An invitation is required",
  },
  invalid_credentials: {
    status: 401,
    code: "unauthenticated",
    title: "Sign-in could not be completed",
  },
  mfa_required: {
    status: 403,
    code: "mfa_required",
    title: "Additional verification is required",
  },
  session_expired: {
    status: 401,
    code: "unauthenticated",
    title: "Sign-in is required",
  },
} as const;

export function authFailureProblem(failure: AuthFailure, requestId: string) {
  return createProblemResponse({ ...authProblems[failure], requestId });
}
