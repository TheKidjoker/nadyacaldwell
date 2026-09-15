import type { BucketTotals } from "./types";

/**
 * One plain sentence about where this check landed against her own marks.
 *
 * IT REPORTS, IT DOES NOT SCORE. Her bills alone are over 40% of a check, and
 * groceries and gas are needs too, so the needs bar will sit above 50% most
 * paydays. That is the arithmetic of having a child and a car, not a habit to
 * correct, and a tool that tuts at it every fortnight is a tool she stops
 * opening. So: no "should", no "try to", no exclamation, nothing congratulatory
 * on the savings line either — scoring in one direction invites scoring in the
 * other. The sentence names what is true and stops.
 *
 * Nothing here blocks, snaps or refuses anything. It is a caption.
 *
 * Pure and total: it always returns a non-empty sentence, for any totals,
 * including an over-assigned split and a split where nothing has been moved.
 */

/** Percentage points a bucket sits above its own mark. Negative is under. */
function gapPoints(pct: number, targetPct: number): number {
  return pct * 100 - targetPct;
}

export function bucketNote(input: {
  buckets: BucketTotals;
  /**
   * What she has put into her SPENDING envelopes — the part of this check she
   * is actually splitting. Not the bill shares: those are set aside for her
   * and are not a decision she made on this screen.
   */
  assignedCents: number;
}): string {
  const { buckets, assignedCents } = input;

  if (buckets.overAllocated) {
    return "You have put more in than this check holds. The shares below are of what you assigned, not what you were paid.";
  }

  /**
   * Nothing directed anywhere yet.
   *
   * `bucketTotals` counts unassigned income as savings, so before she touches
   * a slider the savings bar already reads 59% against a 20% mark — and the
   * reading below would tell her she is "sitting above your mark", which is a
   * congratulation for not having started. THE BILLS ARE NOT THE TEST: her
   * bills alone fill the needs bucket to 41%, so a check on needsCents would
   * never fire on this screen at all.
   */
  if (assignedCents === 0) {
    return "Nothing split yet. Until you move something, the whole check counts as savings.";
  }

  const needs = gapPoints(buckets.needsPct, buckets.targets.needsPct);
  const wants = gapPoints(buckets.wantsPct, buckets.targets.wantsPct);
  const savings = gapPoints(buckets.savingsPct, buckets.targets.savingsPct);

  // Needs is read first because it is the one she has least say over.
  if (needs >= 10) {
    return "Heavy on needs this check. Bills and groceries are what they are.";
  }
  if (needs >= 4) {
    return "A little heavy on needs this check.";
  }
  if (wants >= 10) {
    return "More on wants than your mark this check.";
  }
  if (wants >= 4) {
    return "A little heavy on wants this check.";
  }
  if (savings >= 5) {
    return "Savings is sitting above your mark this check.";
  }

  // There is deliberately no "savings is light" line. The three shares sum to
  // the whole check and the three targets sum to 100, so the savings gap is
  // exactly minus the other two — a light savings check is ALWAYS a heavy
  // needs or wants check, and has already been named above by the bucket that
  // actually took the money. A second sentence about savings would be the
  // same fact said again as a reproach.
  return "Close to your marks this check.";
}
