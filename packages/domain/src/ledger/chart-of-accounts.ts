export const SYSTEM_LEDGER_ROLES = [
  "bank_asset",
  "cash_asset",
  "card_liability",
  "expense",
  "income",
  "receivable_asset",
  "investment_asset",
  "opening_equity",
  "adjustment_equity",
  "realized_gain",
  "realized_loss",
  "fee_expense",
  "fx_rounding",
] as const;

export type LedgerAccountRole = (typeof SYSTEM_LEDGER_ROLES)[number];
export type LedgerAccountClass =
  "asset" | "liability" | "equity" | "income" | "expense";
export type LedgerSide = "debit" | "credit";

export interface SystemLedgerAccountDefinition {
  readonly role: LedgerAccountRole;
  readonly code: string;
  readonly name: string;
  readonly accountClass: LedgerAccountClass;
  readonly normalSide: LedgerSide;
}

export const SYSTEM_LEDGER_ACCOUNTS: readonly SystemLedgerAccountDefinition[] =
  [
    {
      role: "bank_asset",
      code: "1100",
      name: "Bank asset",
      accountClass: "asset",
      normalSide: "debit",
    },
    {
      role: "cash_asset",
      code: "1110",
      name: "Cash asset",
      accountClass: "asset",
      normalSide: "debit",
    },
    {
      role: "receivable_asset",
      code: "1200",
      name: "Receivable asset",
      accountClass: "asset",
      normalSide: "debit",
    },
    {
      role: "investment_asset",
      code: "1300",
      name: "Investment asset",
      accountClass: "asset",
      normalSide: "debit",
    },
    {
      role: "card_liability",
      code: "2100",
      name: "Card liability",
      accountClass: "liability",
      normalSide: "credit",
    },
    {
      role: "opening_equity",
      code: "3100",
      name: "Opening equity",
      accountClass: "equity",
      normalSide: "credit",
    },
    {
      role: "adjustment_equity",
      code: "3200",
      name: "Adjustment equity",
      accountClass: "equity",
      normalSide: "credit",
    },
    {
      role: "income",
      code: "4100",
      name: "Normal income",
      accountClass: "income",
      normalSide: "credit",
    },
    {
      role: "realized_gain",
      code: "4200",
      name: "Realized investment gain",
      accountClass: "income",
      normalSide: "credit",
    },
    {
      role: "expense",
      code: "5100",
      name: "Personal expense",
      accountClass: "expense",
      normalSide: "debit",
    },
    {
      role: "fee_expense",
      code: "5200",
      name: "Fee expense",
      accountClass: "expense",
      normalSide: "debit",
    },
    {
      role: "realized_loss",
      code: "5300",
      name: "Realized investment loss",
      accountClass: "expense",
      normalSide: "debit",
    },
    {
      role: "fx_rounding",
      code: "3900",
      name: "Explicit FX rounding",
      accountClass: "equity",
      normalSide: "credit",
    },
  ];

export type LedgerChart = Readonly<Record<LedgerAccountRole, string>>;

export function resolveLedgerAccount(
  chart: LedgerChart,
  role: LedgerAccountRole,
): string {
  const accountId = chart[role];
  if (!accountId) {
    throw new Error(`Missing system ledger role: ${role}.`);
  }
  return accountId;
}
