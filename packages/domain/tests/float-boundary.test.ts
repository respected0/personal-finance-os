import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

async function readSources(target: string): Promise<string[]> {
  const targetStat = await stat(target);
  if (!targetStat.isDirectory()) {
    return [await readFile(target, "utf8")];
  }
  const sources: string[] = [];
  for (const entry of await readdir(target)) {
    sources.push(...(await readSources(path.join(target, entry))));
  }
  return sources;
}

describe("B011 financial floating-point boundary", () => {
  test("uses string financial fields and Decimal arithmetic only", async () => {
    const source = (await readSources("packages/domain/src")).join("\n");
    expect(source).not.toMatch(
      /(?:amount|balance|cost|fee|money|price|quantity|rate|ratio|share)\w*\??\s*:\s*number\b/iu,
    );
    expect(source).not.toMatch(/\b(?:parseFloat|parseInt|Math\.round)\s*\(/u);
    expect(source).not.toMatch(
      /\bNumber\s*\([^)]*(?:amount|price|quantity|rate)/iu,
    );
    expect(source).toContain('from "decimal.js"');
  });
});
