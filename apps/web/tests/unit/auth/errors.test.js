import { describe, expect, test } from "vitest";
import { authFailureProblem } from "../../../src/server/auth/errors.ts";

describe("B007 auth errors", () => {
  test("does not enumerate email or provider details", () => {
    const requestId = "018f6f4e-7f35-7e34-8000-000000000070";
    const problem = authFailureProblem("invalid_credentials", requestId);
    const serialized = JSON.stringify(problem);

    expect(problem.status).toBe(401);
    expect(problem.body.request_id).toBe(requestId);
    expect(serialized).not.toMatch(/email|user|supabase|password/i);
  });
});
