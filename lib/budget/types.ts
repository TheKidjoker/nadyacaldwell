import type { ISODate } from "./dates";

export type CategoryKind = "spending" | "bill";
export type PaycheckKind = "base" | "commission";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Does leftover money survive into the next period? Always true for bills. */
  carryover: boolean;
  /** Bill categories only; null for spending. */
  monthlyTargetCents: number | null;
  color: string;
  sortOrder: number;
}

export interface PayPeriod {
  id: string;
  startsOn: ISODate;
  endsOn: ISODate;
}

export interface Paycheck {
  id: string;
  receivedOn: ISODate;
  amountCents: number;
  kind: PaycheckKind;
}

export interface Allocation {
  payPeriodId: string;
  categoryId: string;
  amountCents: number;
}

export interface Transaction {
  id: string;
  categoryId: string | null;
  occurredOn: ISODate;
  amountCents: number;
}

export interface Goal {
  id: string;
  name: string;
  targetCents: number;
  targetDate: ISODate | null;
}

export interface GoalContribution {
  goalId: string;
  occurredOn: ISODate;
  amountCents: number;
}

export interface EnvelopeBalance {
  categoryId: string;
  kind: CategoryKind;
  carryover: boolean;
  /** This period's allocation only. */
  allocatedCents: number;
  /** Balance brought forward from prior periods. Always 0 when !carryover. */
  carriedInCents: number;
  /** Spend inside this period only. */
  spentCents: number;
  /** carriedIn + allocated - spent */
  remainingCents: number;
  /** 0 when nothing is available, so this never divides by zero. */
  pctUsed: number;
  overspent: boolean;
  monthlyTargetCents: number | null;
  /** Bill categories only: round(monthlyTarget * 12 / 26). */
  perCheckSetAsideCents: number | null;
  /** Bill categories only. */
  fullyFunded: boolean | null;
}

export interface PeriodSummary {
  incomeCents: number;
  baseCents: number;
  commissionCents: number;
  envelopes: EnvelopeBalance[];
  totalAllocatedCents: number;
  totalSpentCents: number;
  /** income - allocated. Negative means she allocated more than she was paid. */
  unallocatedCents: number;
  uncategorizedCents: number;
  /** Spending envelopes only — bill set-asides are not hers to spend. */
  spendableRemainingCents: number;
  /** today through endsOn, inclusive. 0 once the period has passed. */
  daysRemaining: number;
  /** null when daysRemaining is 0, rather than dividing by zero. */
  safeToSpendPerDayCents: number | null;
}

export interface GoalProgress {
  goalId: string;
  savedCents: number;
  remainingCents: number;
  /** 0..1, capped at 1. */
  pctComplete: number;
  isComplete: boolean;
  /** null when the goal has no target date. */
  monthsRemaining: number | null;
  /** null when there is no target date, or the goal is already complete. */
  requiredPerMonthCents: number | null;
  /** null when it cannot be determined. */
  onPace: boolean | null;
  isOverdue: boolean;
}
