import {
  uatSyn01Schema,
  type UatSyn01Fixture,
} from "../contracts/uat-syn-01.schema.js";

export const uatSyn01Fixture: UatSyn01Fixture = uatSyn01Schema.parse({
  fixture_id: "UAT-SYN-01",
  schema_version: "1.0.0",
  timezone: "Europe/Istanbul",
  as_of_date: "2026-07-29",
  fixed_at: "2026-07-29T12:00:00+03:00",
  owner: {
    id: "01980f42-0000-7000-8000-000000000001",
    label: "Synthetic UAT owner",
  },
  assets: [
    {
      id: "01980f42-0000-7000-8000-000000000002",
      owner_id: "01980f42-0000-7000-8000-000000000001",
      asset_type: "gold",
      custody: "bank",
      active: true,
      quantity_grams: "1.31",
      unit_price_try: "2500.00",
      price_date: "2026-07-29",
      price_source: "synthetic-reference",
    },
  ],
  receivables: [
    {
      id: "01980f42-0000-7000-8000-000000000003",
      owner_id: "01980f42-0000-7000-8000-000000000001",
      status: "doubtful",
      nominal_amount_try: "10000.00",
      include_in_net_worth: false,
      include_in_planning: false,
      as_of_date: "2026-07-29",
    },
  ],
  goals: [],
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function normalizeUatSyn01Fixture(input: unknown): string {
  const parsed = uatSyn01Schema.parse(input);
  const normalized = JSON.stringify(canonicalize(parsed));
  if (typeof normalized !== "string") {
    throw new Error("UAT-SYN-01 normalize edilemedi.");
  }
  return normalized;
}
