import type { Cadence } from "./recurrence";
import type { ISODate } from "./dates";
import type { Bucket, Category, EnvelopeBalance } from "./types";

/**
 * Shaping the envelope balances into the rows the split screen renders.
 *
 * This lives here rather than in either page because BOTH `/` and
 * `/budget/assign` now show the same split, off the same `summarizePeriod`
 * call. Written out twice, one of them eventually starts including a bill the
 * other drops, and the two screens quote different figures for the same
 * paycheck. There is no arithmetic here beyond one sum — every balance
 * arrives already computed.
 */

/** One spending envelope she is filling in with a slider. */
export interface SplitRow {
  id: string;
  name: string;
  bucket: Bucket;
  /** Balance this envelope brought into the period. 0 when !carryover. */
  carriedInCents: number;
  /** Already spent out of it this period. */
  spentCents: number;
}

/** One bill, shown read-only and set aside at its per-check share on save. */
export interface SplitFixed {
  id: string;
  name: string;
  bucket: Bucket;
  setAsideCents: number;
  recurringAmountCents: number;
  cadence: Cadence;
  nextDueOn: ISODate | null;
}

export function splitRowsFrom(input: {
  envelopes: readonly EnvelopeBalance[];
  categories: readonly Pick<Category, "id" | "name">[];
}): {
  rows: SplitRow[];
  fixed: SplitFixed[];
  /** What each envelope already holds for THIS period. Never a suggestion. */
  initialCents: Record<string, number>;
  /** This check's share of the bills, off the top before anything is split. */
  billsTotalCents: number;
} {
  const { envelopes, categories } = input;
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));

  /**
   * A bill missing any of its three fields has no honest per-check share, so
   * it is left out rather than written at a guessed amount. The schema forbids
   * such a row anyway; this is the belt to that braces.
   */
  const fixed: SplitFixed[] = envelopes.flatMap((e) => {
    if (e.kind !== "bill") return [];
    if (
      e.perCheckSetAsideCents === null ||
      e.recurringAmountCents === null ||
      e.cadence === null
    ) {
      return [];
    }

    return [
      {
        id: e.categoryId,
        name: nameOf.get(e.categoryId) ?? "Bill",
        bucket: e.bucket,
        setAsideCents: e.perCheckSetAsideCents,
        recurringAmountCents: e.recurringAmountCents,
        cadence: e.cadence,
        nextDueOn: e.nextDueOn,
      },
    ];
  });

  /** Her envelopes, in her own order. Never re-sorted by amount. */
  const rows: SplitRow[] = envelopes
    .filter((e) => e.kind === "spending")
    .map((e) => ({
      id: e.categoryId,
      name: nameOf.get(e.categoryId) ?? "Category",
      bucket: e.bucket,
      carriedInCents: e.carriedInCents,
      spentCents: e.spentCents,
    }));

  const initialCents = Object.fromEntries(
    envelopes.map((e) => [e.categoryId, e.allocatedCents]),
  );

  const billsTotalCents = fixed.reduce((total, f) => total + f.setAsideCents, 0);

  return { rows, fixed, initialCents, billsTotalCents };
}
