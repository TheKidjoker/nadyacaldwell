import type { ISODate } from "./dates";
import type { Cadence } from "./recurrence";

export type CategoryKind = "spending" | "bill";
export type PaycheckKind = "base" | "commission";
/** Needs/wants/savings, orthogonal to kind. Groceries is spending + needs. */
export type Bucket = "needs" | "wants" | "savings";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  bucket: Bucket;
  /** Does leftover money survive into the next period? Always true for bills. */
  carryover: boolean;
  /** Bills only: how often the bill actually arrives. Null for spending. */
  cadence: Cadence | null;
  /** Bills only: the bill as she receives it, not a monthly equivalent. */
  recurringAmountCents: number | null;
  /** Bills only: one reference due date; the rest are generated from it. */
  dueAnchor: ISODate | null;
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
  bucket: Bucket;
  /** Bills only. */
  cadence: Cadence | null;
  /** Bills only: the bill as it will arrive. */
  recurringAmountCents: number | null;
  /** Bills only: round(annual / 26). */
  perCheckSetAsideCents: number | null;
  /** Bills only: can she pay the next occurrence in full? */
  fullyFunded: boolean | null;
  /** Bills only: the next due date on or after the period start. */
  nextDueOn: ISODate | null;
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
  buckets: BucketTotals;
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

export interface AllocationTargets {
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
}

export interface BucketTotals {
  needsCents: number;
  wantsCents: number;
  savingsCents: number;
  /** 0..1, always summing to 1. */
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  targets: AllocationTargets;
  /** True when she assigned more than she was paid. */
  overAllocated: boolean;
}

export const DEFAULT_TARGETS: AllocationTargets = {
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
};
