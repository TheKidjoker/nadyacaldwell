/**
 * Recurring-bill arithmetic.
 *
 * A bill is stored as she receives it -- weekly, monthly, every six months --
 * and everything downstream works from the annual total. The per-paycheck
 * set-aside is annual / 26, of which the old monthly * 12 / 26 is one case.
 */

import { addDays, compareISO } from "./dates";
import type { ISODate } from "./dates";

export type Cadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export const PER_YEAR: Record<Cadence, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

/** Twenty-six biweekly paychecks in a year. */
export const CHECKS_PER_YEAR = 26;

export function annualCents(amountCents: number, cadence: Cadence): number {
  return amountCents * PER_YEAR[cadence];
}

export function perCheckSetAside(amountCents: number, cadence: Cadence): number {
  return Math.round(annualCents(amountCents, cadence) / CHECKS_PER_YEAR);
}

/** Cadences measured in whole days; the rest step by calendar months. */
const DAY_STEP: Partial<Record<Cadence, number>> = {
  weekly: 7,
  biweekly: 14,
};

/** Cadences measured in calendar months. */
const MONTH_STEP: Partial<Record<Cadence, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

const MS_PER_DAY = 86_400_000;

function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/**
 * Add whole calendar months, clamping to the end of a short month.
 *
 * The anchor day is remembered rather than overwritten, so a bill on the 31st
 * falls on the 28th in February and returns to the 31st in March.
 */
function addMonthsClamped(anchor: ISODate, months: number): ISODate {
  const [y, m, d] = anchor.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function nextOccurrence(
  anchor: ISODate,
  cadence: Cadence,
  onOrAfter: ISODate,
): ISODate {
  // A bill has no occurrences before its anchor.
  if (compareISO(anchor, onOrAfter) >= 0) return anchor;

  const dayStep = DAY_STEP[cadence];
  if (dayStep !== undefined) {
    const steps = Math.ceil(daysBetween(anchor, onOrAfter) / dayStep);
    return addDays(anchor, steps * dayStep);
  }

  // Walk forward a step at a time. Clamping makes arithmetic shortcuts wrong:
  // the 31st -> 28th -> 31st sequence is not a fixed stride.
  const monthStep = MONTH_STEP[cadence]!;
  let candidate = anchor;
  let n = 0;
  while (compareISO(candidate, onOrAfter) < 0) {
    n += monthStep;
    candidate = addMonthsClamped(anchor, n);
  }
  return candidate;
}

export function occurrencesBetween(
  anchor: ISODate,
  cadence: Cadence,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  if (compareISO(from, to) > 0) return [];

  const out: ISODate[] = [];
  let current = nextOccurrence(anchor, cadence, from);

  while (compareISO(current, to) <= 0) {
    // nextOccurrence clamps to the anchor when `from` precedes it, so an
    // occurrence before the window start must be skipped rather than emitted.
    if (compareISO(current, from) >= 0) out.push(current);

    const dayStep = DAY_STEP[cadence];
    const next =
      dayStep !== undefined
        ? addDays(current, dayStep)
        : nextOccurrence(anchor, cadence, addDays(current, 1));

    // Guard against a cadence that fails to advance.
    if (compareISO(next, current) <= 0) break;
    current = next;
  }

  return out;
}
