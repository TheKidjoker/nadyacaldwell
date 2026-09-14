/**
 * TEMPORARY in-memory stand-in for the database.
 *
 * Tasks 7-9 of the plan replace this with Neon + Drizzle behind the same
 * function signatures in `lib/db/queries.ts` and `lib/budget/actions.ts`.
 * Nothing in `app/` or `components/` imports this file directly, so that swap
 * touches only those two modules.
 *
 * State lives in module scope: it survives navigations within one running dev
 * server and resets on restart or recompile. Good enough to see and click the
 * real UI; it is not persistence.
 */
import { addDays } from "@/lib/budget/dates";
import { periodBoundsFrom } from "@/lib/budget/periods";
import type {
  Allocation,
  Category,
  Goal,
  GoalContribution,
  Paycheck,
  PayPeriod,
  Transaction,
} from "@/lib/budget/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

// The current period started three days ago, so the demo always opens
// mid-period with days left on the clock, whenever it happens to be run.
const currentStart = addDays(today(), -3);
const priorStart = addDays(currentStart, -14);

const prior: PayPeriod = { id: "period-prior", ...periodBoundsFrom(priorStart) };
const current: PayPeriod = { id: "period-current", ...periodBoundsFrom(currentStart) };

export const store = {
  periods: [prior, current] as PayPeriod[],

  categories: [
    { id: "cat-groceries", name: "Groceries", kind: "spending", carryover: false, monthlyTargetCents: null, color: "#9ac5e7", sortOrder: 0 },
    { id: "cat-gas", name: "Gas", kind: "spending", carryover: false, monthlyTargetCents: null, color: "#93bee0", sortOrder: 1 },
    { id: "cat-eating-out", name: "Eating out", kind: "spending", carryover: false, monthlyTargetCents: null, color: "#bedcf2", sortOrder: 2 },
    { id: "cat-fun", name: "Fun money", kind: "spending", carryover: true, monthlyTargetCents: null, color: "#cadff0", sortOrder: 3 },
    { id: "cat-rent", name: "Rent", kind: "bill", carryover: true, monthlyTargetCents: 120_000, color: "#6ba1cd", sortOrder: 4 },
    { id: "cat-car", name: "Car insurance", kind: "bill", carryover: true, monthlyTargetCents: 14_200, color: "#7fb0dc", sortOrder: 5 },
    { id: "cat-phone", name: "Phone", kind: "bill", carryover: true, monthlyTargetCents: 8_500, color: "#93bee0", sortOrder: 6 },
  ] as Category[],

  paychecks: [
    { id: "check-1", receivedOn: prior.startsOn, amountCents: 140_000, kind: "base" },
    { id: "check-2", receivedOn: addDays(prior.startsOn, 7), amountCents: 48_600, kind: "commission" },
    { id: "check-3", receivedOn: current.startsOn, amountCents: 140_000, kind: "base" },
    { id: "check-4", receivedOn: addDays(current.startsOn, 2), amountCents: 62_400, kind: "commission" },
  ] as Paycheck[],

  allocations: [
    // Prior period.
    { payPeriodId: prior.id, categoryId: "cat-groceries", amountCents: 32_000 },
    { payPeriodId: prior.id, categoryId: "cat-gas", amountCents: 9_000 },
    { payPeriodId: prior.id, categoryId: "cat-eating-out", amountCents: 8_000 },
    { payPeriodId: prior.id, categoryId: "cat-fun", amountCents: 6_000 },
    { payPeriodId: prior.id, categoryId: "cat-rent", amountCents: 55_385 },
    { payPeriodId: prior.id, categoryId: "cat-car", amountCents: 6_554 },
    { payPeriodId: prior.id, categoryId: "cat-phone", amountCents: 3_923 },
    // Current period.
    { payPeriodId: current.id, categoryId: "cat-groceries", amountCents: 32_000 },
    { payPeriodId: current.id, categoryId: "cat-gas", amountCents: 9_000 },
    { payPeriodId: current.id, categoryId: "cat-eating-out", amountCents: 8_000 },
    { payPeriodId: current.id, categoryId: "cat-fun", amountCents: 6_000 },
    { payPeriodId: current.id, categoryId: "cat-rent", amountCents: 55_385 },
    { payPeriodId: current.id, categoryId: "cat-car", amountCents: 6_554 },
    { payPeriodId: current.id, categoryId: "cat-phone", amountCents: 3_923 },
  ] as Allocation[],

  transactions: [
    // Prior period: she underspent groceries and overspent eating out.
    { id: "txn-1", categoryId: "cat-groceries", occurredOn: addDays(prior.startsOn, 2), amountCents: 11_240 },
    { id: "txn-2", categoryId: "cat-groceries", occurredOn: addDays(prior.startsOn, 9), amountCents: 9_615 },
    { id: "txn-3", categoryId: "cat-eating-out", occurredOn: addDays(prior.startsOn, 4), amountCents: 5_200 },
    { id: "txn-4", categoryId: "cat-fun", occurredOn: addDays(prior.startsOn, 6), amountCents: 2_800 },
    { id: "txn-5", categoryId: "cat-gas", occurredOn: addDays(prior.startsOn, 3), amountCents: 4_410 },
    // Current period.
    { id: "txn-6", categoryId: "cat-groceries", occurredOn: current.startsOn, amountCents: 8_732 },
    { id: "txn-7", categoryId: "cat-gas", occurredOn: addDays(current.startsOn, 1), amountCents: 4_180 },
    { id: "txn-8", categoryId: "cat-eating-out", occurredOn: addDays(current.startsOn, 1), amountCents: 3_450 },
    { id: "txn-9", categoryId: "cat-groceries", occurredOn: addDays(current.startsOn, 3), amountCents: 6_115 },
    { id: "txn-10", categoryId: null, occurredOn: addDays(current.startsOn, 2), amountCents: 1_899 },
  ] as Transaction[],

  goals: [
    { id: "goal-charleston", name: "Trip to Charleston", targetCents: 200_000, targetDate: addDays(today(), 180) },
    { id: "goal-cushion", name: "Emergency cushion", targetCents: 500_000, targetDate: null },
  ] as Goal[],

  goalContributions: [
    { goalId: "goal-charleston", occurredOn: addDays(today(), -40), amountCents: 40_000 },
    { goalId: "goal-charleston", occurredOn: addDays(today(), -12), amountCents: 35_000 },
    { goalId: "goal-cushion", occurredOn: addDays(today(), -40), amountCents: 120_000 },
  ] as GoalContribution[],
};

export function addTransactionRow(row: Omit<Transaction, "id">): void {
  store.transactions.push({ id: nextId("txn"), ...row });
}

export function addPaycheckRow(row: Omit<Paycheck, "id">): void {
  store.paychecks.push({ id: nextId("check"), ...row });
}

export function setAllocationRow(row: Allocation): void {
  const existing = store.allocations.find(
    (a) => a.payPeriodId === row.payPeriodId && a.categoryId === row.categoryId,
  );
  if (existing) existing.amountCents = row.amountCents;
  else store.allocations.push(row);
}

export function addCategoryRow(row: Omit<Category, "id" | "sortOrder">): void {
  store.categories.push({
    id: nextId("cat"),
    sortOrder: store.categories.length,
    ...row,
  });
}

export function addGoalRow(row: Omit<Goal, "id">): void {
  store.goals.push({ id: nextId("goal"), ...row });
}

export function addGoalContributionRow(row: GoalContribution): void {
  store.goalContributions.push(row);
}
