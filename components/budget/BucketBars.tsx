import { formatCents } from "@/lib/budget/format";
import type { BucketTotals } from "@/lib/budget/types";
import styles from "@/app/(private)/budget/assign/assign.module.css";

/**
 * The 50/30/20 lens: three bars reporting how this paycheck divides, against
 * a reference line she set herself.
 *
 * It reports, it does not score. No red state on the needs bar and no
 * congratulation on the savings one — her needs share will sit above the mark
 * for as long as she has a child and a car, and that is the arithmetic of her
 * life rather than a behaviour to correct. Scoring in one direction invites
 * scoring in the other.
 *
 * `--over` appears here in exactly one place: the sentence naming an
 * over-assignment, which is a fact about the total rather than a verdict on a
 * bucket. It is said in words, so the meaning never rests on the colour.
 *
 * No arithmetic lives here. Everything comes in from `bucketTotals`, which is
 * the same pure function `summarizePeriod` calls — so the bars she watches
 * while typing and the bars after she saves are the same computation.
 */

const ROWS = [
  { key: "needs", label: "Needs" },
  { key: "wants", label: "Wants" },
  { key: "savings", label: "Savings" },
] as const;

export function BucketBars({ buckets }: { buckets: BucketTotals }) {
  return (
    <>
      <div className={styles.buckets}>
        {ROWS.map(({ key, label }) => {
          const pct = buckets[`${key}Pct`];
          const cents = buckets[`${key}Cents`];
          const target = buckets.targets[`${key}Pct`];
          const shown = Math.round(pct * 100);

          return (
            <div key={key} className={styles.bucketRow}>
              <span className={styles.bucketLabel} id={`bucket-${key}`}>
                {label}
              </span>

              <div
                className={styles.bucketTrack}
                role="img"
                aria-labelledby={`bucket-${key}`}
                aria-label={`${label}: ${shown} percent of this paycheck, ${formatCents(cents)}. Your target is ${target} percent.`}
              >
                <div
                  className={styles.bucketFill}
                  style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }}
                />
                {/* The mark, not a pass line. */}
                <div
                  className={styles.bucketTarget}
                  style={{ left: `${Math.max(0, Math.min(100, target))}%` }}
                />
              </div>

              {/* The percentage is repeated in text beside every bar: the
                  bars are all one colour on purpose, so length alone must
                  never be the only way to read them. */}
              <span className={styles.bucketValue}>
                <span>{shown}%</span>
                <span className={styles.bucketCents}>{formatCents(cents)}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className={styles.bucketsNote}>
        The marks are your targets of {buckets.targets.needsPct}/
        {buckets.targets.wantsPct}/{buckets.targets.savingsPct}. Money you have
        not assigned counts as savings.
        {buckets.overAllocated && (
          <>
            {" "}
            <span className={styles.summaryOverNote}>
              You have assigned more than you were paid, so these shares are of
              what you assigned.
            </span>
          </>
        )}
      </p>
    </>
  );
}
