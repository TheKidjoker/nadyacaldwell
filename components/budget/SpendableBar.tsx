import { formatCents, formatShortDate } from "@/lib/budget/format";
import type { PayPeriod } from "@/lib/budget/types";
import styles from "./spendableBar.module.css";

/**
 * "What's left" — for the PAY PERIOD, which is this app's unit of planning.
 *
 * It is deliberately NOT a month. Every figure underneath it (allocations,
 * envelope balances, the daily number) is scoped to a pay period, so a bar
 * labelled "this month" would be a label over the wrong arithmetic. The
 * caption names the period and its dates so there is nothing to infer.
 *
 * WHAT IT MEASURES: of the money that was hers to spend this pay period, how
 * much still is. Both halves of "hers" count —
 *
 *   inEnvelopes  money assigned to spending envelopes and not yet spent
 *   toAssign     income not yet assigned, and not owed to a bill
 *
 * — because both are money she still has. What is excluded is money that was
 * never hers to spend: the share this paycheck owes to bills. That exclusion
 * is the same one the headline makes, and the caption states it in dollars
 * rather than leaving her to wonder where the rest of the paycheck went.
 *
 * Every figure arrives as a prop, already derived from the balances
 * `summarizePeriod` returned. This component does no budget arithmetic; the
 * only sums below are the bar's own geometry.
 */

export function SpendableBar({
  period,
  inEnvelopesCents,
  toAssignCents,
  spentCents,
  heldForBillsCents,
}: {
  period: PayPeriod;
  /** Assigned to spending envelopes and unspent. Negative if overspent. */
  inEnvelopesCents: number;
  /** Income not assigned anywhere and not owed to a bill. Never negative. */
  toAssignCents: number;
  /** Already spent out of the spending envelopes this period. */
  spentCents: number;
  /** This paycheck's share of the bills. Excluded from both sides. */
  heldForBillsCents: number;
}) {
  // The bar's own axis: what is still hers, out of what was hers to spend.
  // Carryover is carried by inEnvelopesCents, so the axis stays correct for
  // envelopes that brought a balance forward.
  const yoursCents = inEnvelopesCents + toAssignCents;
  const ofCents = yoursCents + spentCents;

  /** She has spent past what an envelope held. Never hidden behind colour. */
  const overspent = inEnvelopesCents < 0;
  /** Nothing of this period's spendable pool is left at all. */
  const empty = yoursCents <= 0;
  /** No pool to draw a ratio against — a bar here would invent one. */
  const nothingYet = ofCents <= 0 && !overspent;

  const pctLeft =
    ofCents > 0
      ? Math.max(0, Math.min(100, Math.round((yoursCents / ofCents) * 100)))
      : 0;

  // A spent-out bar floods the track rather than showing an empty one, so
  // "nothing left" and "nothing set up" never look identical.
  const fillPct = empty && overspent ? 100 : pctLeft;

  // Formatted from the ISO string, never parsed into a Date: this label is a
  // calendar day, and a Date would move it a timezone west.
  const periodLabel = `${formatShortDate(period.startsOn)} – ${formatShortDate(period.endsOn)}`;

  const valueText = nothingYet
    ? "Nothing to spend in this pay period yet"
    : empty
      ? `Nothing left to spend in this pay period${overspent ? `, ${formatCents(Math.abs(inEnvelopesCents))} overspent` : ""}`
      : `${formatCents(yoursCents)} of the ${formatCents(ofCents)} that was yours to spend this pay period, ${pctLeft} percent`;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>
          {empty && overspent ? "Overspent" : "Yours to spend"}
        </span>
        {/* --over is reserved for actually being in the red. Landing on
            exactly zero is not overspending, and colouring it as though it
            were would cry wolf. */}
        <span className={empty && overspent ? styles.valueOver : styles.value}>
          {nothingYet ? (
            "nothing yet"
          ) : (
            <>
              <strong className={styles.amount}>{formatCents(yoursCents)}</strong>{" "}
              of {formatCents(ofCents)}
            </>
          )}
        </span>
      </div>

      <div
        className={styles.track}
        role="progressbar"
        aria-label="Yours to spend this pay period"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctLeft}
        aria-valuetext={valueText}
      >
        {fillPct > 0 && (
          <div
            className={empty && overspent ? styles.fillOver : styles.fill}
            style={{ width: `${fillPct}%` }}
          />
        )}
      </div>

      <p className={styles.caption}>
        Pay period &middot; {periodLabel}
        {heldForBillsCents > 0 && (
          <> &middot; {formatCents(heldForBillsCents)} held for bills</>
        )}
        {spentCents > 0 && <> &middot; {formatCents(spentCents)} spent</>}
        {/* Named in words as well as colour: an envelope in the red is the one
            thing here she must not be able to miss. */}
        {overspent && (
          <>
            {" "}
            &middot;{" "}
            <span className={styles.over}>
              {formatCents(Math.abs(inEnvelopesCents))} overspent
            </span>
          </>
        )}
        {!nothingYet && inEnvelopesCents === 0 && toAssignCents > 0 && (
          <> &middot; nothing assigned yet</>
        )}
      </p>
    </div>
  );
}
