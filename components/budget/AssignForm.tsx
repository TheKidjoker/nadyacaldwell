"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { saveTargets } from "@/lib/budget/actions";
import { bucketTotals } from "@/lib/budget/calc";
import { formatCents, formatShortDate } from "@/lib/budget/format";
import type { AllocationTargets } from "@/lib/budget/types";
import type { SplitFixed, SplitRow } from "@/lib/budget/splitRows";
import { BucketBars } from "./BucketBars";
import { CADENCE_LABEL } from "./BillRow";
import { SplitSliders } from "./SplitSliders";
import styles from "@/app/(private)/budget/assign/assign.module.css";

/**
 * The assign screen, for a payday after the first one.
 *
 * It no longer owns the split. Dragging, the redistribution rule, the live
 * summary and the bucket bars all live in `SplitSliders`, which the dashboard
 * mounts too — the same component, not a second copy of the same screen. What
 * is left here is everything that belongs to THIS page and nowhere else: the
 * read-only bill shares off the top, the empty state that sends her to name a
 * category, and the editor for her own needs/wants/savings marks.
 *
 * THE MARKS FOLLOW HER TYPING. `draftTargets` is held here and handed down to
 * `SplitSliders`, so the target lines on the bars move as she edits them and
 * before she saves. A field she has emptied or half-typed falls back to the
 * saved target rather than snapping the mark to zero.
 */

// The page imports these under its own names; they are defined once, beside
// the function that builds them.
export type { SplitRow as AssignRow, SplitFixed as FixedRow };

/** A target field -> a whole percent, or null while it is not one yet. */
function toPct(value: string): number | null {
  const raw = value.trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

export function AssignForm({
  payPeriodId,
  rows,
  fixed,
  initialCents,
  incomeCents,
  daysRemaining,
  savedTargets,
  children,
}: {
  payPeriodId: string;
  rows: SplitRow[];
  fixed: SplitFixed[];
  /** What each envelope already holds for THIS period. Never a suggestion. */
  initialCents: Record<string, number>;
  incomeCents: number;
  daysRemaining: number;
  savedTargets: AllocationTargets;
  /** The add-a-category slot, for when she has no envelopes yet. */
  children: ReactNode;
}) {
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [draftTargets, setDraftTargets] = useState({
    needsPct: String(savedTargets.needsPct),
    wantsPct: String(savedTargets.wantsPct),
    savingsPct: String(savedTargets.savingsPct),
  });
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  const needsId = useId();
  const wantsId = useId();
  const savingsId = useId();

  const billsTotalCents = fixed.reduce((total, f) => total + f.setAsideCents, 0);

  // The marks follow her typing; an unfinished field falls back to the saved
  // value rather than snapping the line to zero mid-keystroke.
  const liveTargets: AllocationTargets = {
    needsPct: toPct(draftTargets.needsPct) ?? savedTargets.needsPct,
    wantsPct: toPct(draftTargets.wantsPct) ?? savedTargets.wantsPct,
    savingsPct: toPct(draftTargets.savingsPct) ?? savedTargets.savingsPct,
  };

  const targetsComplete =
    toPct(draftTargets.needsPct) !== null &&
    toPct(draftTargets.wantsPct) !== null &&
    toPct(draftTargets.savingsPct) !== null;
  const targetsSum =
    (toPct(draftTargets.needsPct) ?? -1) +
    (toPct(draftTargets.wantsPct) ?? -1) +
    (toPct(draftTargets.savingsPct) ?? -1);
  const targetsAddUp = targetsComplete && targetsSum === 100;

  const targetsEditor = (
    <>
      {!targetsOpen && (
        <button
          type="button"
          className={styles.targetsToggle}
          onClick={() => {
            setTargetsError(null);
            setTargetsOpen(true);
          }}
        >
          Move my targets
        </button>
      )}

      {targetsOpen && (
        <form
          className={styles.targetsForm}
          action={async (formData) => {
            setSavingTargets(true);
            setTargetsError(null);
            try {
              const result = await saveTargets(formData);
              if (result.ok) setTargetsOpen(false);
              else setTargetsError(result.message);
            } catch {
              setTargetsError("That didn't save. Try again.");
            } finally {
              setSavingTargets(false);
            }
          }}
        >
          <div className={styles.targetsFields}>
            <div className={styles.targetField}>
              <label className={styles.targetLabel} htmlFor={needsId}>
                Needs %
              </label>
              <input
                id={needsId}
                type="number"
                name="needsPct"
                value={draftTargets.needsPct}
                onChange={(e) =>
                  setDraftTargets((p) => ({ ...p, needsPct: e.target.value }))
                }
                step="1"
                min="0"
                max="100"
                inputMode="numeric"
                className={styles.targetInput}
              />
            </div>

            <div className={styles.targetField}>
              <label className={styles.targetLabel} htmlFor={wantsId}>
                Wants %
              </label>
              <input
                id={wantsId}
                type="number"
                name="wantsPct"
                value={draftTargets.wantsPct}
                onChange={(e) =>
                  setDraftTargets((p) => ({ ...p, wantsPct: e.target.value }))
                }
                step="1"
                min="0"
                max="100"
                inputMode="numeric"
                className={styles.targetInput}
              />
            </div>

            <div className={styles.targetField}>
              <label className={styles.targetLabel} htmlFor={savingsId}>
                Savings %
              </label>
              <input
                id={savingsId}
                type="number"
                name="savingsPct"
                value={draftTargets.savingsPct}
                onChange={(e) =>
                  setDraftTargets((p) => ({ ...p, savingsPct: e.target.value }))
                }
                step="1"
                min="0"
                max="100"
                inputMode="numeric"
                className={styles.targetInput}
              />
            </div>
          </div>

          {/* The database has a check constraint that these sum to 100, and a
              constraint violation surfaces as an unreadable error. So the sum
              is stated here as she types, and the button is closed until it
              adds up — the action checks it again regardless, because the
              form is not the security boundary. */}
          <p
            className={
              targetsComplete && !targetsAddUp
                ? styles.targetsSumBad
                : styles.targetsSum
            }
            aria-live="polite"
          >
            {!targetsComplete
              ? "Use whole numbers between 0 and 100."
              : targetsAddUp
                ? "Adds up to 100%."
                : `Adds up to ${targetsSum}%. It has to be 100%.`}
          </p>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submit}
              disabled={savingTargets || !targetsAddUp}
            >
              {savingTargets ? "Saving…" : "Save targets"}
            </button>
            <button
              type="button"
              className={styles.targetsToggle}
              onClick={() => {
                setDraftTargets({
                  needsPct: String(savedTargets.needsPct),
                  wantsPct: String(savedTargets.wantsPct),
                  savingsPct: String(savedTargets.savingsPct),
                });
                setTargetsError(null);
                setTargetsOpen(false);
              }}
            >
              Cancel
            </button>
          </div>

          {targetsError && <p className={styles.error}>{targetsError}</p>}
        </form>
      )}
    </>
  );

  return (
    <>
      {fixed.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Bills, set aside for you</h2>
          <p className={styles.sectionNote}>
            Worked out from the bill and how often it arrives. Saving below puts
            each share into its envelope; this money is not yours to spend, so
            it never reaches the daily number or the sliders.
          </p>

          <ul className={styles.bills}>
            {fixed.map((f) => (
              <li key={f.id} className={styles.billItem}>
                <span className={styles.billName}>{f.name}</span>
                <span className={styles.billAmount}>
                  {formatCents(f.setAsideCents)}
                </span>
                <span className={styles.billMeta}>
                  {formatCents(f.recurringAmountCents)} {CADENCE_LABEL[f.cadence]}
                  {f.nextDueOn && <> &middot; due {formatShortDate(f.nextDueOn)}</>}
                </span>
                <span className={styles.billAmountLabel}>per paycheck</span>
              </li>
            ))}
          </ul>

          <p className={styles.billsTotal}>
            <span className={styles.billsTotalValue}>
              {formatCents(billsTotalCents)}
            </span>{" "}
            off the top
          </p>
        </section>
      )}

      {/* The empty state is deliberately NOT inside a form. The add-a-category
          slot is a form of its own, and a form inside a form is invalid HTML
          that React refuses to hydrate. There is also nothing to save here
          yet: with no envelopes there is nothing to drag. */}
      {rows.length === 0 ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>The rest is yours</h2>
            <p className={styles.empty}>
              You have no spending categories yet, so there is nowhere to put
              this money. Name one &mdash; groceries, gas, going out &mdash; and
              a slider for it appears here.
            </p>
            {children}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>How this paycheck splits</h2>
            <BucketBars
              buckets={bucketTotals({
                categories: fixed.map((f) => ({ id: f.id, bucket: f.bucket })),
                periodAllocations: fixed.map((f) => ({
                  payPeriodId,
                  categoryId: f.id,
                  amountCents: f.setAsideCents,
                })),
                incomeCents,
                targets: liveTargets,
              })}
            />
            {targetsEditor}
          </section>
        </>
      ) : (
        <SplitSliders
          payPeriodId={payPeriodId}
          rows={rows}
          fixed={fixed}
          initialCents={initialCents}
          incomeCents={incomeCents}
          billsTotalCents={billsTotalCents}
          daysRemaining={daysRemaining}
          targets={liveTargets}
          heading="The rest is yours"
          intro="Drag to split it. The number beside each slider is there when you want to be exact."
          footer={targetsEditor}
        />
      )}
    </>
  );
}
