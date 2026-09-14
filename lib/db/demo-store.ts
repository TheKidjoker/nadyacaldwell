/**
 * TEMPORARY in-memory stand-in for the database.
 *
 * Nothing is seeded. Every array is empty and every category carries no
 * amount, because the app must never show her a number she did not enter --
 * a budget pre-filled with a guess at her rent is worse than an empty one.
 *
 * Tasks 8-9 of `docs/superpowers/plans/2026-09-13-flexible-allocation-and-bills.md`
 * replace this with Neon behind the same signatures in `lib/db/queries.ts`,
 * and Task 14 deletes this file.
 */
import type {
  Allocation,
  Category,
  Goal,
  GoalContribution,
  Paycheck,
  PayPeriod,
  Transaction,
} from "@/lib/budget/types";

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

export const store = {
  periods: [] as PayPeriod[],
  categories: [] as Category[],
  paychecks: [] as Paycheck[],
  allocations: [] as Allocation[],
  transactions: [] as Transaction[],
  goals: [] as Goal[],
  goalContributions: [] as GoalContribution[],
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
