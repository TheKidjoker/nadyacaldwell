/**
 * Pure logic for the notes / diary / to-do module.
 *
 * Nothing here reads the clock or the database: `today` is always a parameter,
 * so these tests cannot rot overnight. The Server Actions in
 * `lib/notes-actions.ts` own the writing; this file owns the thinking.
 */
import { addDays } from "@/lib/budget/dates";
import type { ISODate } from "@/lib/budget/dates";

export type MoveDirection = "up" | "down";

/** A section holds either dated writing or a list she ticks off. */
export type NoteSectionKind = "journal" | "todo";

export function isMoveDirection(value: string): value is MoveDirection {
  return value === "up" || value === "down";
}

export function isSectionKind(value: string): value is NoteSectionKind {
  return value === "journal" || value === "todo";
}

/**
 * Move one id a single place within a settled order.
 *
 * Returns a copy in every case — including the no-ops (an id that is not in
 * the list, the first item asked to go up, the last asked to go down), so the
 * caller can write the result back unconditionally without a special case.
 */
export function moveWithin(
  ids: readonly string[],
  id: string,
  direction: MoveDirection,
): string[] {
  const next = [...ids];
  const from = next.indexOf(id);
  if (from === -1) return next;

  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= next.length) return next;

  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Sequential sort_order values for a settled order.
 *
 * Rewriting the whole list rather than swapping two rows is deliberate: rows
 * created before this module existed all default to 0, and swapping two zeroes
 * changes nothing. Renumbering repairs any such tie the first time she moves
 * anything. The lists are hers and short, so the extra writes cost nothing.
 */
export function renumber(
  ids: readonly string[],
): { id: string; sortOrder: number }[] {
  return ids.map((id, index) => ({ id, sortOrder: index }));
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The day heading over a diary entry.
 *
 * Spelled out rather than numeric: this is the one date in the app she reads
 * as a memory rather than as data. The year is added only when the entry is
 * not from the current year, so the common case stays short.
 */
export function formatEntryDay(day: ISODate, today: ISODate): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";

  const [year, month, date] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  const sameYear = year === Number(today.slice(0, 4));

  return `${weekday}, ${MONTHS[month - 1]} ${date}${sameYear ? "" : ` ${year}`}`;
}

/** The line under a section's name on the index. Counts, not exhortation. */
export function summarizeSection(
  kind: NoteSectionKind,
  total: number,
  open: number,
): string {
  if (total === 0) return kind === "todo" ? "Nothing on it yet" : "Nothing written yet";

  if (kind === "todo") {
    if (open === 0) return `All ${total} done`;
    return `${open} left of ${total}`;
  }

  return total === 1 ? "1 entry" : `${total} entries`;
}
