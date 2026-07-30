import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packageNames = ["domain", "db", "contracts", "ui", "test-kit"];

describe("workspace foundation", () => {
  it.each(packageNames)(
    "%s paketi açık bir public export taşır",
    async (name) => {
      const manifest = JSON.parse(
        await readFile(
          new URL(`../../packages/${name}/package.json`, import.meta.url),
        ),
      );

      expect(manifest.exports["."]).toEqual({
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
        default: "./dist/index.js",
      });
    },
  );
});
