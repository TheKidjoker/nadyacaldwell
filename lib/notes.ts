/**
 * Notes from Chance to Nadya, shown one at a time on the home page.
 *
 * These affirm her as a person, not her handling of money -- the distinction
 * matters most on a screen that may be showing a number she is unhappy about.
 *
 * Chance writes all three. Leave any of them empty and the page simply shows
 * one of the others; leave all three empty and the section does not render.
 */
import type { ISODate } from "@/lib/budget/dates";

export const NOTES: string[] = ["", "", ""];

const MS_PER_DAY = 86_400_000;

/** Days since the start of the given year, 0-based. */
function dayOfYear(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  return Math.round((Date.UTC(y, m - 1, d) - start) / MS_PER_DAY);
}

/**
 * The note for a given day, or null when nothing has been written.
 *
 * Rotation is by date rather than random so the same day always shows the same
 * note -- stable while she is using the app, and testable without a clock.
 */
export function noteForDay(
  today: ISODate,
  notes: string[] = NOTES,
): string | null {
  const written = notes.map((n) => n.trim()).filter((n) => n.length > 0);
  if (written.length === 0) return null;
  return written[dayOfYear(today) % written.length];
}
