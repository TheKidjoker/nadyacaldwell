/**
 * Due-date presets: the one-tap answers to "when is this next due?".
 *
 * A preset is a *description* of a recurring landmark -- the 1st, the last
 * day, a Tuesday -- and it has to resolve to a concrete 'YYYY-MM-DD' before
 * it is any use, because `dueAnchor` stores a date and nothing else.
 *
 * Every resolution lands on or after `today`. Picking "the 1st" on the 28th
 * of January must mean February, not a date three weeks gone.
 *
 * All month arithmetic goes through `nextOccurrence`, whose end-of-month
 * clamping is already tested. Nothing here reimplements it, and nothing here
 * reads the clock: `today` is always a parameter.
 */

import { addDays } from "./dates";
import type { ISODate } from "./dates";
import { nextOccurrence } from "./recurrence";
import type { Cadence } from "./recurrence";

export type DuePreset =
  /** A fixed day of the month. Only days every month has, so 1-28. */
  | { kind: "dayOfMonth"; label: string; description: string; day: number }
  /** Whichever of the 28th, 29th, 30th or 31st ends the month. */
  | { kind: "lastDayOfMonth"; label: string; description: string }
  /** A weekday, numbered as `Date#getUTCDay`: 0 is Sunday. */
  | { kind: "dayOfWeek"; label: string; description: string; weekday: number };

/**
 * For cadences that step in calendar months. Rent and daycare land on the
 * 1st, most cards and utilities on the 15th or the end of the month; those
 * three cover the ordinary bill and the rest is still typed by hand.
 */
const MONTH_DAY_PRESETS: readonly DuePreset[] = [
  {
    kind: "dayOfMonth",
    label: "1st",
    description: "The next 1st of the month",
    day: 1,
  },
  {
    kind: "dayOfMonth",
    label: "15th",
    description: "The next 15th of the month",
    day: 15,
  },
  {
    kind: "lastDayOfMonth",
    label: "Last day",
    description: "The last day of this month",
  },
];

/** Monday first, because a bill week is read that way, not Sunday-first. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** For cadences that step in whole days, the day of the week is the anchor. */
const WEEKDAY_PRESETS: readonly DuePreset[] = WEEKDAY_ORDER.map((weekday) => ({
  kind: "dayOfWeek" as const,
  label: WEEKDAY_SHORT[weekday],
  description: `The next ${WEEKDAY_LONG[weekday]}`,
  weekday,
}));

/**
 * The presets worth offering for a cadence.
 *
 * Weekly and every-two-weeks recur in days, so a weekday is the natural
 * landmark. Everything else recurs in calendar months and takes a day of the
 * month, even the once-a-year bills: the anchor sets the day, the cadence
 * does the stepping from there.
 */
export function duePresetsFor(cadence: Cadence): readonly DuePreset[] {
  return cadence === "weekly" || cadence === "biweekly"
    ? WEEKDAY_PRESETS
    : MONTH_DAY_PRESETS;
}

/** The 1st of `date`'s month. The one day of the month that never clamps. */
function firstOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

/** `date`'s month with the day replaced. Callers pass 1-28 only. */
function withDayOfMonth(date: ISODate, day: number): ISODate {
  return `${date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/**
 * The last day of `date`'s month: 28, 29, 30 or 31, correctly.
 *
 * Stepping a month from the 1st can never clamp, so one month forward and
 * one day back lands on the end of the month without a table of month
 * lengths and without a leap-year rule of its own.
 */
export function lastDayOfMonth(date: ISODate): ISODate {
  const first = firstOfMonth(date);
  const firstOfNext = nextOccurrence(first, "monthly", addDays(first, 1));
  return addDays(firstOfNext, -1);
}

/** Day of the week for an ISO date, 0 = Sunday. Parsed as UTC, like dates.ts. */
export function dayOfWeek(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * The concrete next date a preset means, on or after `today`.
 *
 * A bill due today is a real answer, so "the 15th" on the 15th is the 15th
 * rather than a month away.
 */
export function resolveDuePreset(preset: DuePreset, today: ISODate): ISODate {
  switch (preset.kind) {
    case "dayOfMonth":
      // This month's instance may already have passed; nextOccurrence walks
      // forward from it, so late January gives February.
      return nextOccurrence(withDayOfMonth(today, preset.day), "monthly", today);

    case "lastDayOfMonth":
      // The end of this month is never behind today, so it is always the
      // answer -- including when today *is* the end of the month.
      return lastDayOfMonth(today);

    case "dayOfWeek": {
      const delta = (preset.weekday - dayOfWeek(today) + 7) % 7;
      return addDays(today, delta);
    }
  }
}
