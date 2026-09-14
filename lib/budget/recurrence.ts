/**
 * Recurring-bill arithmetic.
 *
 * A bill is stored as she receives it -- weekly, monthly, every six months --
 * and everything downstream works from the annual total. The per-paycheck
 * set-aside is annual / 26, of which the old monthly * 12 / 26 is one case.
 */

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
