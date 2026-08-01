import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  normalizeUatSyn01Fixture,
  uatSyn01Fixture,
} from "../../packages/test-kit/dist/fixtures/uat-syn-01.js";
import { uatSyn01Expected } from "../../packages/test-kit/dist/fixtures/uat-syn-01.expected.js";

const environment = process.env.APP_ENV ?? (process.env.CI ? "ci" : "local");
if (
  process.env.NODE_ENV === "production" ||
  !new Set(["local", "test", "ci"]).has(environment)
) {
  throw new Error(
    "UAT-SYN-01 yalnız local, test veya CI ortamında yüklenebilir.",
  );
}

const normalized = normalizeUatSyn01Fixture(uatSyn01Fixture);
const normalizedSha256 = createHash("sha256").update(normalized).digest("hex");
if (normalizedSha256 !== uatSyn01Expected.normalizedSha256) {
  throw new Error(
    `UAT-SYN-01 normalized hash drift: ${normalizedSha256} != ${uatSyn01Expected.normalizedSha256}.`,
  );
}

const activePhysicalGold = uatSyn01Fixture.assets.filter(
  (asset) => asset.active && asset.custody === "physical",
);
const activeBankGold = uatSyn01Fixture.assets.filter(
  (asset) => asset.active && asset.custody === "bank",
);
const doubtfulReceivable = uatSyn01Fixture.receivables[0];
if (
  activePhysicalGold.length !== 0 ||
  activeBankGold.length !== 1 ||
  activeBankGold[0]?.quantity_grams !== "1.31" ||
  !doubtfulReceivable ||
  doubtfulReceivable.nominal_amount_try !== "10000.00" ||
  doubtfulReceivable.include_in_net_worth ||
  doubtfulReceivable.include_in_planning
) {
  throw new Error("UAT-SYN-01 finance invariant sözleşmesi geçersiz.");
}

async function readSources(target) {
  const targetStat = await stat(target);
  if (!targetStat.isDirectory()) {
    return [await readFile(target, "utf8")];
  }
  const sources = [];
  for (const entry of await readdir(target)) {
    sources.push(...(await readSources(path.join(target, entry))));
  }
  return sources;
}

const productionSources = await Promise.all(
  [
    "apps/web/src",
    "packages/contracts/src",
    "packages/db/src",
    "packages/domain/src",
    "packages/ui/src",
    "supabase/seed.sql",
  ].map((target) => readSources(target)),
);
if (
  /@personal-finance-os\/test-kit|UAT-SYN-01/iu.test(
    productionSources.flat().join("\n"),
  )
) {
  throw new Error(
    "UAT-SYN-01 production source veya otomatik seed yoluna sızdı.",
  );
}

console.log(
  JSON.stringify({
    fixture_id: uatSyn01Fixture.fixture_id,
    normalized_sha256: normalizedSha256,
    asset_records: uatSyn01Fixture.assets.length,
    receivable_records: uatSyn01Fixture.receivables.length,
    active_physical_gold_records: activePhysicalGold.length,
    bank_gold_quantity_grams: activeBankGold[0].quantity_grams,
    doubtful_receivable_nominal_try: doubtfulReceivable.nominal_amount_try,
    doubtful_receivable_net_worth: doubtfulReceivable.include_in_net_worth,
    doubtful_receivable_planning: doubtfulReceivable.include_in_planning,
    production_consumers: 0,
  }),
);
