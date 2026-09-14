import { perCheckSetAside } from "@/lib/budget/recurrence";
import type { Category, PeriodSummary } from "@/lib/budget/types";

/**
 * Where a paycheck actually stands, derived from what calc.ts already returned.
 *
 * THIS BELONGS ON `PeriodSummary` IN lib/budget/calc.ts. It lives here only
 * because the session that wrote it did not own that file. Two pages need the
 * same figures -- `/` and `/budget` -- and duplicating the reductions across
 * both is how the two headlines would drift apart. See the report.
 *
 * Nothing here recalculates a balance. Every total below is a sum over the
 * envelope balances `summarizePeriod` produced, using the same `kind` filter
 * calc.ts used for `spendableRemainingCents`, so `available` and `remaining`
 * cannot disagree.
 */
export interface PeriodStanding {
  /** Assigned to spending envelopes this period, plus anything carried in. */
  spendableAvailableCents: number;
  /** Spent out of those spending envelopes during this period. */
  spendableSpentCents: number;
  /** What this paycheck still owes the bills, after any bill allocations. */
  billsStillNeededCents: number;
  /** Income assigned nowhere and owed to no bill. Never negative. */
  toAssignCents: number;
  /**
   * Can an honest "safe to spend per day" exist yet?
   *
   * safeToSpendPerDay divides the SPENDING envelopes by the days left, so
   * until one of them holds money the quotient is $0.00 a day -- not a
   * cautious number, a false one, and the most alarming thing either page
   * could say to someone who was just paid. Adding a BILL must never flip
   * this true: a bill can only take money out of the spendable pool.
   */
  hasSpendable: boolean;
}

export function periodStanding(
  summary: PeriodSummary,
  categories: Category[],
): PeriodStanding {
  const spending = summary.envelopes.filter((e) => e.kind === "spending");

  const spendableAvailableCents = spending.reduce(
    (total, e) => total + e.carriedInCents + e.allocatedCents,
    0,
  );
  const spendableSpentCents = spending.reduce(
    (total, e) => total + e.spentCents,
    0,
  );

  /**
   * The per-paycheck set-aside is a TARGET derived from cadence, not an
   * allocation. Once an assign screen exists it will be met by real
   * allocation rows, so subtracting what the bill envelopes have already been
   * given is what stops the same dollar being counted twice the day it lands.
   */
  const billTargetCents = categories.reduce(
    (total, c) =>
      total +
      (c.kind === "bill" && c.recurringAmountCents !== null && c.cadence !== null
        ? perCheckSetAside(c.recurringAmountCents, c.cadence)
        : 0),
    0,
  );
  const billsAssignedCents = summary.envelopes
    .filter((e) => e.kind === "bill")
    .reduce((total, e) => total + e.allocatedCents, 0);
  const billsStillNeededCents = Math.max(0, billTargetCents - billsAssignedCents);

  /**
   * Clamped at zero: when she has assigned more than she was paid, the pages
   * already report that separately as "Over-allocated", and a negative axis
   * would only make the bar lie in a second way.
   */
  const toAssignCents = Math.max(
    0,
    summary.unallocatedCents - billsStillNeededCents,
  );

  return {
    spendableAvailableCents,
    spendableSpentCents,
    billsStillNeededCents,
    toAssignCents,
    hasSpendable: spendableAvailableCents > 0,
  };
}
