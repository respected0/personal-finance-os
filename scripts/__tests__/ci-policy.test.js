import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const workflowFiles = [
  ".github/workflows/quality.yml",
  ".github/workflows/security.yml",
  ".github/workflows/migration-smoke.yml",
];

describe("B003 CI policy", () => {
  test("keeps every action reference immutable", async () => {
    for (const file of workflowFiles) {
      const workflow = await readFile(file, "utf8");
      const references = workflow.match(/uses:\s+([^\s]+)/g) ?? [];

      for (const reference of references) {
        const value = reference.replace("uses:", "").trim();
        expect(value).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/);
      }
    }
  });

  test("does not expose write permissions or production credentials", async () => {
    const workflows = await Promise.all(
      workflowFiles.map((file) => readFile(file, "utf8")),
    );
    const combined = workflows.join("\n");

    expect(combined).not.toMatch(/permissions:[\s\S]{0,120}\bwrite\b/);
    expect(combined).not.toMatch(/secrets\.|service.role|production.secret/i);
  });

  test("defines all six stable required check names", async () => {
    const workflows = await Promise.all(
      workflowFiles.map((file) => readFile(file, "utf8")),
    );
    const combined = workflows.join("\n");
    const requiredChecks = [
      "quality / format",
      "quality / lint",
      "quality / typecheck",
      "quality / unit",
      "security / secret-scan",
      "database / migration-smoke",
    ];

    for (const check of requiredChecks) {
      expect(combined).toContain(`name: ${check}`);
    }
  });
});
