import { compareISO, daysInclusive, isWithin, monthsBetween } from "./dates";
import { nextOccurrence, perCheckSetAside } from "./recurrence";
import type { ISODate } from "./dates";
import type {
  Allocation,
  Category,
  EnvelopeBalance,
  Goal,
  GoalContribution,
  GoalProgress,
  Paycheck,
  PayPeriod,
  PeriodSummary,
  Transaction,
} from "./types";

export function envelopeBalance(input: {
  category: Category;
  period: PayPeriod;
  /** Every allocation for this category, across all periods. */
  allocations: Allocation[];
  /** Every transaction in this category, across all time. */
  transactions: Transaction[];
}): EnvelopeBalance {
  const { category, period, allocations, transactions } = input;

  const mine = allocations.filter((a) => a.categoryId === category.id);
  const myTxns = transactions.filter((t) => t.categoryId === category.id);

  const allocatedCents = sum(
    mine.filter((a) => a.payPeriodId === period.id).map((a) => a.amountCents),
  );

  const spentCents = sum(
    myTxns
      .filter((t) => isWithin(t.occurredOn, period.startsOn, period.endsOn))
      .map((t) => t.amountCents),
  );

  // Carryover envelopes bring forward everything allocated and spent before
  // this period began. Non-carryover envelopes start each period at zero.
  let carriedInCents = 0;
  if (category.carryover) {
    const priorAllocated = sum(
      mine.filter((a) => a.payPeriodId !== period.id).map((a) => a.amountCents),
    );
    const priorSpent = sum(
      myTxns
        .filter((t) => compareISO(t.occurredOn, period.startsOn) < 0)
        .map((t) => t.amountCents),
    );
    carriedInCents = priorAllocated - priorSpent;
  }

  const availableCents = carriedInCents + allocatedCents;
  const remainingCents = availableCents - spentCents;

  const isBill = category.kind === "bill";
  const amount = category.recurringAmountCents;
  const cadence = category.cadence;
  const isFullBill = isBill && amount !== null && cadence !== null;

  return {
    categoryId: category.id,
    kind: category.kind,
    bucket: category.bucket,
    carryover: category.carryover,
    allocatedCents,
    carriedInCents,
    spentCents,
    remainingCents,
    pctUsed: availableCents > 0 ? spentCents / availableCents : 0,
    overspent: remainingCents < 0,
    cadence: isFullBill ? cadence : null,
    recurringAmountCents: isFullBill ? amount : null,
    perCheckSetAsideCents: isFullBill ? perCheckSetAside(amount, cadence) : null,
    // Funded means she can pay the bill as it will actually arrive, not that
    // she has saved a monthly slice of it.
    fullyFunded: isFullBill ? remainingCents >= amount : null,
    nextDueOn:
      isFullBill && category.dueAnchor !== null
        ? nextOccurrence(category.dueAnchor, cadence, period.startsOn)
        : null,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

export function summarizePeriod(input: {
  period: PayPeriod;
  paychecks: Paycheck[];
  categories: Category[];
  allocations: Allocation[];
  transactions: Transaction[];
  today: ISODate;
}): PeriodSummary {
  const { period, paychecks, categories, allocations, transactions, today } = input;

  const inPeriod = paychecks.filter((p) =>
    isWithin(p.receivedOn, period.startsOn, period.endsOn),
  );
  const baseCents = sum(
    inPeriod.filter((p) => p.kind === "base").map((p) => p.amountCents),
  );
  const commissionCents = sum(
    inPeriod.filter((p) => p.kind === "commission").map((p) => p.amountCents),
  );

  const envelopes = categories.map((category) =>
    envelopeBalance({ category, period, allocations, transactions }),
  );

  const periodTxns = transactions.filter((t) =>
    isWithin(t.occurredOn, period.startsOn, period.endsOn),
  );

  // Bill set-asides are reserved, not spendable. Including them here would
  // inflate the headline number and is the one error that actively misleads.
  const spendableRemainingCents = sum(
    envelopes.filter((e) => e.kind === "spending").map((e) => e.remainingCents),
  );

  const daysRemaining =
    compareISO(today, period.startsOn) < 0
      ? daysInclusive(period.startsOn, period.endsOn)
      : daysInclusive(today, period.endsOn);

  return {
    incomeCents: baseCents + commissionCents,
    baseCents,
    commissionCents,
    envelopes,
    totalAllocatedCents: sum(
      allocations.filter((a) => a.payPeriodId === period.id).map((a) => a.amountCents),
    ),
    totalSpentCents: sum(periodTxns.map((t) => t.amountCents)),
    unallocatedCents:
      baseCents +
      commissionCents -
      sum(
        allocations.filter((a) => a.payPeriodId === period.id).map((a) => a.amountCents),
      ),
    uncategorizedCents: sum(
      periodTxns.filter((t) => t.categoryId === null).map((t) => t.amountCents),
    ),
    spendableRemainingCents,
    daysRemaining,
    // Math.floor rather than round, so the number never encourages an overspend.
    safeToSpendPerDayCents:
      daysRemaining > 0 ? Math.floor(spendableRemainingCents / daysRemaining) : null,
  };
}

export function goalProgress(input: {
  goal: Goal;
  contributions: GoalContribution[];
  today: ISODate;
}): GoalProgress {
  const { goal, contributions, today } = input;

  const savedCents = sum(
    contributions.filter((c) => c.goalId === goal.id).map((c) => c.amountCents),
  );

  const isComplete = savedCents >= goal.targetCents;
  const remainingCents = Math.max(0, goal.targetCents - savedCents);

  const pctComplete =
    goal.targetCents <= 0 ? 1 : Math.min(1, savedCents / goal.targetCents);

  if (goal.targetDate === null) {
    return {
      goalId: goal.id,
      savedCents,
      remainingCents,
      pctComplete,
      isComplete,
      monthsRemaining: null,
      requiredPerMonthCents: null,
      onPace: null,
      isOverdue: false,
    };
  }

  const monthsRemaining = monthsBetween(today, goal.targetDate);
  const isOverdue = !isComplete && monthsRemaining < 0;

  // No monthly figure to quote once the goal is met, or once the date is past.
  const requiredPerMonthCents =
    isComplete || monthsRemaining <= 0
      ? null
      : Math.ceil(remainingCents / monthsRemaining);

  return {
    goalId: goal.id,
    savedCents,
    remainingCents,
    pctComplete,
    isComplete,
    monthsRemaining,
    requiredPerMonthCents,
    onPace: isComplete ? true : isOverdue ? false : null,
    isOverdue,
  };
}
