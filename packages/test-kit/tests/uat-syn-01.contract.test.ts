import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { uatSyn01Schema } from "../src/contracts/uat-syn-01.schema.ts";
import { uatSyn01Expected } from "../src/fixtures/uat-syn-01.expected.ts";
import {
  normalizeUatSyn01Fixture,
  uatSyn01Fixture,
} from "../src/fixtures/uat-syn-01.ts";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function readProductionSources(target: string): Promise<string[]> {
  const targetStat = await stat(target);
  if (!targetStat.isDirectory()) {
    return [await readFile(target, "utf8")];
  }

  const sources: string[] = [];
  for (const entry of await readdir(target)) {
    sources.push(...(await readProductionSources(path.join(target, entry))));
  }
  return sources;
}

describe("B010 UAT-SYN-01 contract", () => {
  test("uses fixed identity, date, timezone, and canonical decimal strings", () => {
    expect(() => uatSyn01Schema.parse(uatSyn01Fixture)).not.toThrow();
    expect(uatSyn01Fixture.timezone).toBe("Europe/Istanbul");
    expect(uatSyn01Fixture.fixed_at).toBe("2026-07-29T12:00:00+03:00");
    expect(uatSyn01Fixture.owner.id).toBe(
      "01980f42-0000-7000-8000-000000000001",
    );
    expect(uatSyn01Fixture.assets[0]?.quantity_grams).toMatch(/^\d+\.\d+$/u);
    expect(uatSyn01Fixture.receivables[0]?.nominal_amount_try).toMatch(
      /^\d+\.\d+$/u,
    );
  });

  test("produces the same normalized hash on every run", () => {
    const first = normalizeUatSyn01Fixture(uatSyn01Fixture);
    const second = normalizeUatSyn01Fixture(
      JSON.parse(JSON.stringify(uatSyn01Fixture)),
    );

    expect(first).toBe(second);
    expect(sha256(first)).toBe(uatSyn01Expected.normalizedSha256);
  });

  test("contains only 1.31 g bank gold and no active physical gold", () => {
    const activePhysicalGold = uatSyn01Fixture.assets.filter(
      (asset) => asset.active && asset.custody === "physical",
    );
    const activeBankGold = uatSyn01Fixture.assets.filter(
      (asset) => asset.active && asset.custody === "bank",
    );

    expect(activePhysicalGold).toHaveLength(
      uatSyn01Expected.activePhysicalGoldCount,
    );
    expect(activeBankGold).toHaveLength(1);
    expect(activeBankGold[0]?.quantity_grams).toBe(
      uatSyn01Expected.bankGoldQuantityGrams,
    );
    expect(uatSyn01Fixture.goals).toEqual([]);
  });

  test("tracks the doubtful receivable nominally with both policies false", () => {
    expect(uatSyn01Fixture.receivables).toHaveLength(1);
    expect(uatSyn01Fixture.receivables[0]).toMatchObject({
      nominal_amount_try: uatSyn01Expected.doubtfulReceivableNominalTry,
      include_in_net_worth:
        uatSyn01Expected.doubtfulReceivableIncludeInNetWorth,
      include_in_planning: uatSyn01Expected.doubtfulReceivableIncludeInPlanning,
    });
  });

  test("has zero production dependency or automatic seed consumers", async () => {
    const manifests = [
      "package.json",
      "apps/web/package.json",
      "packages/contracts/package.json",
      "packages/db/package.json",
      "packages/domain/package.json",
      "packages/ui/package.json",
    ];
    const consumers = [];
    for (const manifestPath of manifests) {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.dependencies?.["@personal-finance-os/test-kit"]) {
        consumers.push(manifestPath);
      }
    }
    expect(consumers).toHaveLength(
      uatSyn01Expected.productionDependencyConsumers,
    );

    const productionSources = await Promise.all(
      [
        "apps/web/src",
        "packages/contracts/src",
        "packages/db/src",
        "packages/domain/src",
        "packages/ui/src",
        "supabase/seed.sql",
      ].map((target) => readProductionSources(target)),
    );
    expect(productionSources.flat().join("\n")).not.toMatch(
      /@personal-finance-os\/test-kit|UAT-SYN-01/iu,
    );
  });
});
