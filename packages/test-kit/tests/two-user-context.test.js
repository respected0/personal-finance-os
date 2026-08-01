import { describe, expect, test } from "vitest";
import { createTwoUserContext } from "../src/auth/two-user-context.ts";

describe("B008 two-user context", () => {
  test("creates only synthetic, distinct example.test identities", () => {
    const context = createTwoUserContext("fixed-run");

    expect(context.a.alias).toBe("A");
    expect(context.b.alias).toBe("B");
    expect(context.a.email).toBe("uat-rls-a-fixed-run@example.test");
    expect(context.b.email).toBe("uat-rls-b-fixed-run@example.test");
    expect(context.a.email).not.toBe(context.b.email);
  });

  test("rejects unsafe run identifiers", () => {
    expect(() => createTwoUserContext("../../not-safe")).toThrow();
  });
});
