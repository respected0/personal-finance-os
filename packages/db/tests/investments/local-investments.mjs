import { randomUUID } from "node:crypto";
import {
  createLedgerSql,
  createMarketPrice,
  listLatestMarketPrices,
} from "../../dist/index.js";
import {
  runSupabase,
  startLocalStack,
} from "../../../../scripts/db/common.mjs";

const sql = createLedgerSql(
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 4 },
);
const userA = randomUUID();
const userB = randomUUID();
let stackStarted = false;
function assert(value, message) {
  if (!value) throw new Error(message);
}
try {
  runSupabase(["stop", "--project-id", "personal-finance-os", "--no-backup"], {
    allowFailure: true,
    capture: true,
  });
  startLocalStack();
  stackStarted = true;
  runSupabase(["db", "reset", "--local"], { capture: true });
  await sql`insert into auth.users (id,email,aud,role,created_at,updated_at) values (${userA}::uuid,${`b073-${userA}@example.test`},'authenticated','authenticated',now(),now()),(${userB}::uuid,${`b073-${userB}@example.test`},'authenticated','authenticated',now(),now())`;
  const first = await createMarketPrice(sql, {
    userId: userA,
    instrument: {
      symbol: "XAU-TRY",
      name: "Sentetik banka altını",
      instrumentType: "bank_gold",
      unit: "gram",
      currency: "TRY",
    },
    price: "2875.1234567890",
    priceAt: "2026-08-04T09:00:00.000Z",
    sourceType: "reference_fixture",
    isEstimated: false,
  });
  await createMarketPrice(sql, {
    userId: userA,
    instrument: { ...first.instrument, name: "Sentetik banka altını güncel" },
    price: "2900.0000000001",
    priceAt: "2026-08-04T12:00:00.000Z",
    sourceType: "manual",
    isEstimated: true,
  });
  const latest = await listLatestMarketPrices(sql, userA);
  assert(
    latest.length === 1 &&
      latest[0]?.price === "2900.0000000001" &&
      latest[0]?.priceAt === "2026-08-04T12:00:00.000Z" &&
      latest[0]?.sourceType === "manual" &&
      latest[0]?.isEstimated,
    "B073 latest price/source/timestamp projection failed.",
  );
  assert(
    (await listLatestMarketPrices(sql, userB)).length === 0,
    "B073 market prices crossed RLS ownership.",
  );
  const counts =
    await sql`select (select count(*) from app_private.investment_instruments)::integer instruments,(select count(*) from app_private.market_prices)::integer prices`;
  assert(
    counts[0]?.instruments === 1 && counts[0]?.prices === 2,
    "B073 symbol upsert or append-only price history failed.",
  );
  console.log("P0-B2 B073 instrument/manual price PostgreSQL acceptance: PASS");
  console.log(
    "B073 exact numeric(28,10), timestamp/source, latest projection, RLS: PASS",
  );
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (stackStarted)
    runSupabase(
      ["stop", "--project-id", "personal-finance-os", "--no-backup"],
      { allowFailure: true, capture: true },
    );
}
