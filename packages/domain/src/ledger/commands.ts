import type { LedgerAccountRole, LedgerSide } from "./chart-of-accounts.js";

export type FinancialAccountKind =
  "bank" | "cash" | "card" | "wallet" | "investment";

export type PaymentAccountKind = "bank" | "cash" | "card";

export interface OriginalPosting {
  readonly ledgerRole: LedgerAccountRole;
  readonly financialAccountId?: string;
  readonly side: LedgerSide;
  readonly amount: string;
  readonly currency: string;
  readonly fxRate: string;
  readonly amountBase: string;
}

interface BaseCommand {
  readonly currency: string;
  readonly occurredAt: string;
  readonly economicDate: string;
  readonly fxRate?: string;
}

export interface ExpenseCommand extends BaseCommand {
  readonly type: "expense";
  readonly amount: string;
  readonly sourceAccountId: string;
  readonly sourceKind: PaymentAccountKind;
  readonly categoryId: string;
}

export interface IncomeCommand extends BaseCommand {
  readonly type: "income";
  readonly amount: string;
  readonly targetAccountId: string;
  readonly targetKind: "bank" | "cash";
  readonly categoryId: string;
  readonly incomeClass: "normal";
}

export interface TransferCommand extends BaseCommand {
  readonly type: "transfer";
  readonly amount: string;
  readonly sourceAccountId: string;
  readonly sourceKind: "bank" | "cash";
  readonly targetAccountId: string;
  readonly targetKind: "bank" | "cash";
  readonly feeAmount?: string;
}

export interface CardPaymentCommand extends BaseCommand {
  readonly type: "card_payment";
  readonly amount: string;
  readonly bankAccountId: string;
  readonly cardAccountId: string;
}

export interface CashbackRefundCommand extends BaseCommand {
  readonly type: "cashback_refund";
  readonly amount: string;
  readonly targetAccountId: string;
  readonly targetKind: PaymentAccountKind;
  readonly relatedTransactionId: string;
  readonly relatedExpenseRemaining: string;
  readonly subscriptionId?: string;
}

export interface SharedExpenseShare {
  readonly personId: string;
  readonly amount: string;
}

export interface SharedExpenseCommand extends BaseCommand {
  readonly type: "shared_expense";
  readonly totalAmount: string;
  readonly ownerShare: string;
  readonly shares: readonly SharedExpenseShare[];
  readonly paymentAccountId: string;
  readonly paymentSourceKind: PaymentAccountKind;
}

export interface ReceivableSettlementCommand extends BaseCommand {
  readonly type: "receivable_settlement";
  readonly amount: string;
  readonly receivableId: string;
  readonly outstandingAmount: string;
  readonly targetAccountId: string;
  readonly targetKind: "bank" | "cash";
}

export interface ExpectedRealizationCommand extends BaseCommand {
  readonly type: "expected_realization";
  readonly amount: string;
  readonly expectedPaymentId: string;
  readonly alreadyRealized: boolean;
  readonly targetAccountId: string;
  readonly targetKind: "bank" | "cash";
  readonly incomeClass: "normal";
}

export interface InvestmentBuyCommand extends BaseCommand {
  readonly type: "investment_buy";
  readonly cashAccountId: string;
  readonly instrumentId: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly feeAmount: string;
}

export interface InvestmentSellCommand extends BaseCommand {
  readonly type: "investment_sell";
  readonly cashAccountId: string;
  readonly instrumentId: string;
  readonly quantity: string;
  readonly availableQuantity: string;
  readonly unitPrice: string;
  readonly costBasis: string;
  readonly feeAmount: string;
}

export interface OpeningBalanceCommand extends BaseCommand {
  readonly type: "opening_balance";
  readonly amount: string;
  readonly accountId: string;
  readonly accountKind: FinancialAccountKind;
}

export interface BalanceAdjustmentCommand extends BaseCommand {
  readonly type: "balance_adjustment";
  readonly amount: string;
  readonly direction: "increase" | "decrease";
  readonly accountId: string;
  readonly accountKind: FinancialAccountKind;
  readonly reason: string;
  readonly reconciliationId?: string;
}

export interface VoidCommand extends BaseCommand {
  readonly type: "void";
  readonly originalTransactionId: string;
  readonly reason: string;
  readonly originalPostings: readonly OriginalPosting[];
}

export interface ReviseCommand extends BaseCommand {
  readonly type: "revise";
  readonly originalTransactionId: string;
  readonly reason: string;
  readonly originalPostings: readonly OriginalPosting[];
  readonly replacement: NonRevisionTransactionCommand;
}

export type NonRevisionTransactionCommand =
  | ExpenseCommand
  | IncomeCommand
  | TransferCommand
  | CardPaymentCommand
  | CashbackRefundCommand
  | SharedExpenseCommand
  | ReceivableSettlementCommand
  | ExpectedRealizationCommand
  | InvestmentBuyCommand
  | InvestmentSellCommand
  | OpeningBalanceCommand
  | BalanceAdjustmentCommand;

export type TransactionCommand =
  NonRevisionTransactionCommand | VoidCommand | ReviseCommand;
