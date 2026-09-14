/**
 * Read side of the budget data layer.
 *
 * These signatures are the contract the pages are written against. Task 9
 * replaces the bodies with Drizzle queries against Neon, scoped to the
 * verified session's user; the shapes returned here are what it must return.
 */
import { compareISO } from "@/lib/budget/dates";
import { store } from "./demo-store";

/**
 * Everything one budget page render needs.
 *
 * Allocations are returned for this period AND EARLIER ONLY. envelopeBalance
 * treats every allocation that is not this period's as prior history, so
 * including a future period's allocations would inflate carried-in balances.
 */
export async function getPeriodData(periodId?: string) {
  const periods = [...store.periods].sort((a, b) =>
    compareISO(a.startsOn, b.startsOn),
  );

  if (periods.length === 0) return null;

  const current = periodId
    ? periods.find((p) => p.id === periodId)
    : periods[periods.length - 1];

  if (!current) return null;

  const priorOrCurrent = new Set(
    periods
      .filter((p) => compareISO(p.startsOn, current.startsOn) <= 0)
      .map((p) => p.id),
  );

  return {
    period: current,
    periods,
    categories: [...store.categories].sort((a, b) => a.sortOrder - b.sortOrder),
    paychecks: [...store.paychecks],
    transactions: [...store.transactions],
    allocations: store.allocations.filter((a) => priorOrCurrent.has(a.payPeriodId)),
  };
}

export async function getGoalsData() {
  return {
    goals: [...store.goals].sort((a, b) => a.name.localeCompare(b.name)),
    contributions: [...store.goalContributions],
  };
}
