/**
 * Read side of the budget data layer.
 *
 * These signatures are the contract the pages are written against. Every
 * query is scoped to the verified session's user: `verifySession` redirects
 * to /signin when there is no session, so `userId` below is always hers.
 */
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import {
  allocations,
  categories,
  goalContributions,
  goals,
  paychecks,
  payPeriods,
  transactions,
} from "@/lib/db/schema";
import type {
  Allocation,
  Category,
  Goal,
  GoalContribution,
  Paycheck,
  PayPeriod,
  Transaction,
} from "@/lib/budget/types";

/**
 * Everything one budget page render needs.
 *
 * Allocations are returned for this period AND EARLIER ONLY. envelopeBalance
 * treats every allocation that is not this period's as prior history, so
 * including a future period's allocations would inflate carried-in balances.
 */
export async function getPeriodData(periodId?: string) {
  const { userId } = await verifySession();

  const periodRows = await db
    .select()
    .from(payPeriods)
    .where(eq(payPeriods.userId, userId))
    .orderBy(asc(payPeriods.startsOn));

  if (periodRows.length === 0) return null;

  const current = periodId
    ? periodRows.find((p) => p.id === periodId)
    : periodRows[periodRows.length - 1];

  if (!current) return null;

  const [catRows, checkRows, txnRows, allocRows] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.archivedAt)))
      .orderBy(asc(categories.sortOrder)),
    db.select().from(paychecks).where(eq(paychecks.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    // Joined to pay_periods rather than filtered on a date the allocation
    // does not carry: the cut-off is the period's start, not the row's.
    db
      .select({
        payPeriodId: allocations.payPeriodId,
        categoryId: allocations.categoryId,
        amountCents: allocations.amountCents,
      })
      .from(allocations)
      .innerJoin(payPeriods, eq(allocations.payPeriodId, payPeriods.id))
      .where(
        and(
          eq(allocations.userId, userId),
          lte(payPeriods.startsOn, current.startsOn),
        ),
      ),
  ]);

  return {
    period: toPeriod(current),
    periods: periodRows.map(toPeriod),
    categories: catRows.map(toCategory),
    paychecks: checkRows.map(toPaycheck),
    transactions: txnRows.map(toTransaction),
    allocations: allocRows.map(toAllocation),
  };
}

export async function getGoalsData() {
  const { userId } = await verifySession();

  const [goalRows, contributionRows] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), isNull(goals.archivedAt)))
      .orderBy(asc(goals.name)),
    // Joined to goals so an archived goal's history does not come back for
    // a goal the page will not render.
    db
      .select({
        goalId: goalContributions.goalId,
        occurredOn: goalContributions.occurredOn,
        amountCents: goalContributions.amountCents,
      })
      .from(goalContributions)
      .innerJoin(goals, eq(goalContributions.goalId, goals.id))
      .where(
        and(eq(goalContributions.userId, userId), isNull(goals.archivedAt)),
      ),
  ]);

  return {
    goals: goalRows.map(toGoal),
    contributions: contributionRows.map(toGoalContribution),
  };
}

// --- row -> domain mappers, so db shapes never leak into calc ---

type PeriodRow = typeof payPeriods.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type PaycheckRow = typeof paychecks.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type GoalRow = typeof goals.$inferSelect;

const toPeriod = (r: PeriodRow): PayPeriod => ({
  id: r.id,
  startsOn: r.startsOn,
  endsOn: r.endsOn,
});

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  bucket: r.bucket,
  carryover: r.carryover,
  cadence: r.cadence,
  recurringAmountCents: r.recurringAmountCents,
  dueAnchor: r.dueAnchor,
  color: r.color,
  sortOrder: r.sortOrder,
});

const toPaycheck = (r: PaycheckRow): Paycheck => ({
  id: r.id,
  receivedOn: r.receivedOn,
  amountCents: r.amountCents,
  kind: r.kind,
});

const toTransaction = (r: TransactionRow): Transaction => ({
  id: r.id,
  categoryId: r.categoryId,
  occurredOn: r.occurredOn,
  amountCents: r.amountCents,
});

const toAllocation = (r: {
  payPeriodId: string;
  categoryId: string;
  amountCents: number;
}): Allocation => ({
  payPeriodId: r.payPeriodId,
  categoryId: r.categoryId,
  amountCents: r.amountCents,
});

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  name: r.name,
  targetCents: r.targetCents,
  targetDate: r.targetDate,
});

const toGoalContribution = (r: {
  goalId: string;
  occurredOn: string;
  amountCents: number;
}): GoalContribution => ({
  goalId: r.goalId,
  occurredOn: r.occurredOn,
  amountCents: r.amountCents,
});
