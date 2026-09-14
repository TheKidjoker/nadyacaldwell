import { addDays } from "./dates";
import type { ISODate } from "./dates";

/** Biweekly: fourteen days, inclusive of both ends. */
export const PERIOD_LENGTH_DAYS = 14;

export function periodBoundsFrom(startsOn: ISODate): {
  startsOn: ISODate;
  endsOn: ISODate;
} {
  return { startsOn, endsOn: addDays(startsOn, PERIOD_LENGTH_DAYS - 1) };
}

export function nextPeriodBounds(lastStartsOn: ISODate): {
  startsOn: ISODate;
  endsOn: ISODate;
} {
  return periodBoundsFrom(addDays(lastStartsOn, PERIOD_LENGTH_DAYS));
}
