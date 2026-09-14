"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { saveAllocations, saveTargets } from "@/lib/budget/actions";
import { bucketTotals } from "@/lib/budget/calc";
import { formatCents, formatShortDate } from "@/lib/budget/format";
import type { Cadence } from "@/lib/budget/recurrence";
import type { AllocationTargets, Bucket } from "@/lib/budget/types";
import { BucketBars } from "./BucketBars";
import { CADENCE_LABEL } from "./BillRow";
import styles from "@/app/(private)/budget/assign/assign.module.css";

/**
 * The assign screen's one interactive surface.
 *
 * WHAT MOVES AS SHE TYPES, AND WHAT DOES NOT.
 *
 * The only state here is the text in her own fields plus a draft of her
 * targets. Everything else on this component is recomputed from that state on
 * every render — left to assign, the daily number, the three bucket bars —
 * and nothing is written to the server until she presses Save. No row is
 * sorted, no field is rewritten, no amount is clamped or rounded under her
 * cursor; the rows render in the order they arrived and stay there.
 *
 * THE NUMBERS AGREE WITH THE DASHBOARD BY CONSTRUCTION. The daily figure is
 * `floor(spendable remaining / days remaining)` over `carriedIn + assigned -
 * spent`, which is what `summarizePeriod` computes, and the bars come from
 * `bucketTotals`, which is the function `summarizePeriod` calls. Reproducing
 * either formula more cheaply here is how the preview and the saved page
 * start disagreeing.
 *
 * OVER-ASSIGNMENT IS ALLOWED. She can assign more than she was paid; people
 * do. It is never silently clamped and never blocked — the summary flips to
 * "Over-assigned", says the word, and colours the figure with `--over`.
 */

/** One spending envelope she is filling in. */
export interface AssignRow {
  id: string;
  name: string;
  bucket: Bucket;
  /** Balance this envelope brought into the period. 0 when !carryover. */
  carriedInCents: number;
  /** Already spent out of it this period. */
  spentCents: number;
}

/** One bill, shown read-only and set aside at its per-check share on save. */
export interface FixedRow {
  id: string;
  name: string;
  bucket: Bucket;
  setAsideCents: number;
  recurringAmountCents: number;
  cadence: Cadence;
  nextDueOn: string | null;
}

/** Dollars in a field -> integer cents, the same rounding the action does. */
function toCents(value: string): number {
  const raw = value.trim();
  if (raw === "") return 0;
  const cents = Math.round(Number(raw) * 100);
  return Number.isFinite(cents) ? cents : 0;
}

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
  rows: AssignRow[];
  fixed: FixedRow[];
  /** What each envelope already holds for THIS period. Never a suggestion. */
  initialCents: Record<string, number>;
  incomeCents: number;
  daysRemaining: number;
  savedTargets: AllocationTargets;
  /** The add-a-category slot, for when she has no envelopes yet. */
  children: ReactNode;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((r) => {
        const cents = initialCents[r.id] ?? 0;
        // An envelope with nothing in it starts EMPTY, not "0.00" and never a
        // suggested figure. Nothing in this app is seeded with an amount she
        // did not choose.
        return [r.id, cents === 0 ? "" : (cents / 100).toFixed(2)];
      }),
    ),
  );

  const [targetsOpen, setTargetsOpen] = useState(false);
  const [draftTargets, setDraftTargets] = useState({
    needsPct: String(savedTargets.needsPct),
    wantsPct: String(savedTargets.wantsPct),
    savingsPct: String(savedTargets.savingsPct),
  });

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [savingTargets, setSavingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  const needsId = useId();
  const wantsId = useId();
  const savingsId = useId();

  // --- everything below is derived, every render ---

  const assignedCents = rows.reduce(
    (total, r) => total + toCents(amounts[r.id] ?? ""),
    0,
  );
  const billsTotalCents = fixed.reduce((total, f) => total + f.setAsideCents, 0);

  const leftToAssignCents = incomeCents - billsTotalCents - assignedCents;
  const over = leftToAssignCents < 0;

  // The spendable pool exactly as summarizePeriod builds it: this period's
  // allocation, plus anything carried in, less what has already been spent.
  const spendableAvailableCents = rows.reduce(
    (total, r) => total + r.carriedInCents + toCents(amounts[r.id] ?? ""),
    0,
  );
  const spendableRemainingCents = rows.reduce(
    (total, r) =>
      total + r.carriedInCents + toCents(amounts[r.id] ?? "") - r.spentCents,
    0,
  );
  // Math.floor rather than round, so the number never encourages an overspend.
  const perDayCents =
    daysRemaining > 0
      ? Math.floor(spendableRemainingCents / daysRemaining)
      : null;

  /**
   * The same hold the dashboard uses. With nothing in a spending envelope the
   * quotient is $0.00 a day, which is not a cautious number but a false one,
   * and it is the most alarming thing this screen could say to someone who
   * was just paid. It clears the instant she types into any envelope.
   */
  const hasSpendable = spendableAvailableCents > 0;

  // The marks follow her typing. A field she has emptied or half-typed falls
  // back to the saved target rather than snapping the mark to zero.
  const liveTargets: AllocationTargets = {
    needsPct: toPct(draftTargets.needsPct) ?? savedTargets.needsPct,
    wantsPct: toPct(draftTargets.wantsPct) ?? savedTargets.wantsPct,
    savingsPct: toPct(draftTargets.savingsPct) ?? savedTargets.savingsPct,
  };

  const buckets = bucketTotals({
    categories: [
      ...fixed.map((f) => ({ id: f.id, bucket: f.bucket })),
      ...rows.map((r) => ({ id: r.id, bucket: r.bucket })),
    ],
    periodAllocations: [
      ...fixed.map((f) => ({
        payPeriodId,
        categoryId: f.id,
        amountCents: f.setAsideCents,
      })),
      ...rows.map((r) => ({
        payPeriodId,
        categoryId: r.id,
        amountCents: toCents(amounts[r.id] ?? ""),
      })),
    ],
    incomeCents,
    targets: liveTargets,
  });

  const targetsSum =
    (toPct(draftTargets.needsPct) ?? -1) +
    (toPct(draftTargets.wantsPct) ?? -1) +
    (toPct(draftTargets.savingsPct) ?? -1);
  const targetsComplete =
    toPct(draftTargets.needsPct) !== null &&
    toPct(draftTargets.wantsPct) !== null &&
    toPct(draftTargets.savingsPct) !== null;
  const targetsAddUp = targetsComplete && targetsSum === 100;

  return (
    <>
      {fixed.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Bills, set aside for you</h2>
          <p className={styles.sectionNote}>
            Worked out from the bill and how often it arrives. Saving below
            puts each share into its envelope; this money is not yours to
            spend, so it never reaches the daily number.
          </p>

          <ul className={styles.bills}>
            {fixed.map((f) => (
              <li key={f.id} className={styles.billItem}>
                <span className={styles.billName}>{f.name}</span>
                <span className={styles.billAmount}>
                  {formatCents(f.setAsideCents)}
                </span>
                <span className={styles.billMeta}>
                  {formatCents(f.recurringAmountCents)}{" "}
                  {CADENCE_LABEL[f.cadence]}
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

      {/* Sits directly above the fields it answers to, NOT at the top of the
          page. It was `position: sticky` at first and silently never pinned:
          `html, body { overflow-x: hidden }` in globals.css forces `body` to
          compute `overflow-y: auto`, which makes it the nearest scroll
          container even though it is `html` that actually scrolls, and a
          sticky element inside a container that never scrolls never sticks.
          (The same is true of the sticky quick-add on /budget.) Putting the
          two numbers she is steering by immediately above her thumb works
          without depending on that at all. */}
      <div className={styles.summary} role="status" aria-live="polite">
        <p className={styles.summaryLabel}>
          {over ? "Over-assigned" : "Left to assign"}
        </p>
        <p className={over ? styles.summaryValueOver : styles.summaryValue}>
          {formatCents(Math.abs(leftToAssignCents))}
        </p>
        <p className={styles.summaryPerDay}>
          {!hasSpendable ? (
            "Give an envelope some money and your daily number appears here."
          ) : daysRemaining === 0 ? (
            <>
              <span className={styles.summaryPerDayValue}>
                {formatCents(spendableRemainingCents)}
              </span>{" "}
              left &middot; this pay period has ended
            </>
          ) : (
            <>
              <span className={styles.summaryPerDayValue}>
                {formatCents(perDayCents ?? 0)}
              </span>{" "}
              a day for {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
              {over && (
                <>
                  {" "}
                  &middot;{" "}
                  <span className={styles.summaryOverNote}>
                    more than this paycheck holds
                  </span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      {/* The empty state is deliberately OUTSIDE the form below. The add-a-
          category slot is a form of its own, and a form inside a form is
          invalid HTML that React refuses to hydrate. There is also nothing to
          save here yet: with no envelopes, Save would have nothing to write. */}
      {rows.length === 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>The rest is yours</h2>
          <p className={styles.empty}>
            You have no spending categories yet, so there is nowhere to put this
            money. Name one &mdash; groceries, gas, going out &mdash; and it
            appears here to fill in.
          </p>
          {children}
        </section>
      ) : (
        <form
          action={async (formData) => {
            setSaving(true);
            setError(null);
            setStatus(null);
            try {
              const result = await saveAllocations(formData);
              if (result.ok) setStatus("Saved.");
              else setError(result.message);
            } catch {
              setError("That didn't save. Check your amounts and try again.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <input type="hidden" name="payPeriodId" value={payPeriodId} />

          {/* The bill shares travel with the same form, so one Save lands the
              whole split in one transaction rather than leaving the bills
              half-funded if something fails mid-way. */}
          {fixed.map((f) => (
            <input
              key={f.id}
              type="hidden"
              name={`amount:${f.id}`}
              value={(f.setAsideCents / 100).toFixed(2)}
            />
          ))}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>The rest is yours</h2>

            <div className={styles.rows}>
              {rows.map((r) => {
                const cents = toCents(amounts[r.id] ?? "");
                const remaining = r.carriedInCents + cents - r.spentCents;

                return (
                  <label key={r.id} className={styles.row}>
                    <span className={styles.rowName}>{r.name}</span>

                    {/* Always present, so a row never grows a second line
                        mid-session and shunts the field under her thumb. */}
                    <span className={styles.rowMeta}>
                      {r.carriedInCents !== 0 && (
                        <>{formatCents(r.carriedInCents)} carried in &middot; </>
                      )}
                      {r.spentCents > 0 && (
                        <>{formatCents(r.spentCents)} spent &middot; </>
                      )}
                      {formatCents(remaining)} to spend
                    </span>

                    <span className={styles.rowField}>
                      <span className={styles.currency} aria-hidden="true">
                        $
                      </span>
                      <input
                        type="number"
                        name={`amount:${r.id}`}
                        value={amounts[r.id] ?? ""}
                        onChange={(e) =>
                          setAmounts((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        placeholder="0.00"
                        autoComplete="off"
                        aria-label={`Assign to ${r.name}, in dollars`}
                        className={styles.input}
                      />
                    </span>
                  </label>
                );
              })}
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.submit} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <span className={styles.status} aria-live="polite">
                {status}
              </span>
            </div>

            {error && <p className={styles.error}>{error}</p>}
          </section>
        </form>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How this paycheck splits</h2>

        <BucketBars buckets={buckets} />

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
                    setDraftTargets((p) => ({
                      ...p,
                      savingsPct: e.target.value,
                    }))
                  }
                  step="1"
                  min="0"
                  max="100"
                  inputMode="numeric"
                  className={styles.targetInput}
                />
              </div>
            </div>

            {/* The database has a check constraint that these sum to 100, and
                a constraint violation surfaces as an unreadable error. So the
                sum is stated here as she types, and the button is closed until
                it adds up — the action checks it again regardless, because the
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
      </section>
    </>
  );
}
