/**
 * Calendar-date helpers operating on 'YYYY-MM-DD' strings.
 *
 * Everything goes through Date.UTC so a user in any timezone gets the same
 * answer — a transaction logged at 11pm must not land in the wrong pay period.
 */

export type ISODate = string;

const MS_PER_DAY = 86_400_000;

function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTC(toUTC(date) + n * MS_PER_DAY);
}

export function daysInclusive(from: ISODate, to: ISODate): number {
  const diff = Math.round((toUTC(to) - toUTC(from)) / MS_PER_DAY);
  return diff < 0 ? 0 : diff + 1;
}

export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  const t = toUTC(date);
  return t >= toUTC(start) && t <= toUTC(end);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return toUTC(a) - toUTC(b);
}

/** Fractional months, using the average Gregorian month. Good enough for pacing. */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const days = (toUTC(to) - toUTC(from)) / MS_PER_DAY;
  return days / 30.436875;
}
