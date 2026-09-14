/**
 * Month-grid construction for the bill calendar.
 *
 * Pure: `today` is a parameter and the clock is never read, so these tests
 * cannot rot. Six weeks of cells are always returned so the grid does not
 * change height from month to month.
 */
import { addDays, isWithin } from "./dates";
import type { ISODate } from "./dates";
import { occurrencesBetween } from "./recurrence";
import type { Category, Paycheck, PayPeriod, Transaction } from "./types";

const CELLS = 42; // six weeks

export interface DayBill {
  categoryId: string;
  name: string;
  amountCents: number;
}

export interface DayCell {
  date: ISODate;
  inMonth: boolean;
  isToday: boolean;
  bills: DayBill[];
  isPayday: boolean;
  isPeriodStart: boolean;
  isPeriodEnd: boolean;
  spentCents: number;
}

function iso(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Day of week, 0 = Sunday, via UTC so it cannot drift with the viewer. */
function dayOfWeek(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function buildMonthGrid(input: {
  /** Four-digit year. */
  year: number;
  /** 1-12, not zero-based. */
  month: number;
  categories: Category[];
  paychecks: Paycheck[];
  periods: PayPeriod[];
  transactions: Transaction[];
  today: ISODate;
}): DayCell[] {
  const { year, month, categories, paychecks, periods, transactions, today } = input;

  const firstOfMonth = iso(year, month, 1);
  const gridStart = addDays(firstOfMonth, -dayOfWeek(firstOfMonth));
  const gridEnd = addDays(gridStart, CELLS - 1);
  const monthPrefix = firstOfMonth.slice(0, 7);

  // Index everything by date once rather than rescanning per cell.
  const billsByDate = new Map<ISODate, DayBill[]>();
  for (const c of categories) {
    if (c.kind !== "bill") continue;
    if (c.cadence === null || c.dueAnchor === null || c.recurringAmountCents === null) {
      continue;
    }
    for (const date of occurrencesBetween(c.dueAnchor, c.cadence, gridStart, gridEnd)) {
      const list = billsByDate.get(date) ?? [];
      list.push({ categoryId: c.id, name: c.name, amountCents: c.recurringAmountCents });
      billsByDate.set(date, list);
    }
  }

  const paydays = new Set(paychecks.map((p) => p.receivedOn));
  const periodStarts = new Set(periods.map((p) => p.startsOn));
  const periodEnds = new Set(periods.map((p) => p.endsOn));

  const spentByDate = new Map<ISODate, number>();
  for (const t of transactions) {
    if (!isWithin(t.occurredOn, gridStart, gridEnd)) continue;
    spentByDate.set(t.occurredOn, (spentByDate.get(t.occurredOn) ?? 0) + t.amountCents);
  }

  return Array.from({ length: CELLS }, (_, i) => {
    const date = addDays(gridStart, i);
    return {
      date,
      inMonth: date.startsWith(monthPrefix),
      isToday: date === today,
      bills: billsByDate.get(date) ?? [],
      isPayday: paydays.has(date),
      isPeriodStart: periodStarts.has(date),
      isPeriodEnd: periodEnds.has(date),
      spentCents: spentByDate.get(date) ?? 0,
    };
  });
}
