"use client";

import { memo, useCallback, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { saveAllocations } from "@/lib/budget/actions";
import { bucketNote } from "@/lib/budget/bucketNote";
import { bucketTotals } from "@/lib/budget/calc";
import { formatCents } from "@/lib/budget/format";
import {
  dragTo,
  reconcileSlices,
  setExact,
  togglePin,
  totalAssignedCents,
} from "@/lib/budget/redistribute";
import type { Slice } from "@/lib/budget/redistribute";
import type { SplitFixed, SplitRow } from "@/lib/budget/splitRows";
import type { AllocationTargets } from "@/lib/budget/types";
import { BucketBars } from "./BucketBars";
import styles from "./split.module.css";

/**
 * How Nadya splits a paycheck — one component, two places.
 *
 * It is mounted inline on `/` during setup and on `/budget/assign` for later
 * paydays. ONE implementation: two of these would drift the moment one of
 * them learned about pinning and the other did not.
 *
 * ---------------------------------------------------------------------------
 * WHY A NATIVE `<input type="range">`.
 *
 * Every hand-rolled `pointermove` handler is worse than this in ways that only
 * show up on a phone: touch capture across a scroll, the thumb losing the
 * finger at the edges, arrow keys, Page Up, the screen reader announcing a
 * value at all, the focus ring, VoiceOver's rotor gesture. The browser has all
 * of that already and gets it right on iOS and Android. What is left to us is
 * the part a browser cannot know — how it should feel, which is the CSS in
 * split.module.css and these four numbers:
 *
 *   step        $5. At 375px across a ~$700 range a pixel is worth about $2,
 *               so an unstepped slider lands on $347.61 and she has to go
 *               fix it by hand. $5 is a figure a person actually means.
 *   touch area  the input is 44px tall and full width; a range input begins a
 *               drag from anywhere on itself, so the whole band is the target
 *               even though the thumb draws at 28px.
 *   touch-action  `none`, set on the slider alone, so a drag never turns into
 *               a page scroll. The page keeps scrolling everywhere else.
 *   max         shared across every row, so the same distance under her thumb
 *               means the same number of dollars on every slider.
 *
 * ---------------------------------------------------------------------------
 * WHAT MOVES WHEN SHE DRAGS.
 *
 * The rule lives in `lib/budget/redistribute.ts`, not here — a drag handler is
 * the last place a rounding rule should live. Up spends the unassigned pool
 * first and only then takes proportionally from the unpinned envelopes; down
 * returns money to the pool and touches nothing else; a request with nowhere
 * to draw from comes back `blocked` and is SAID, rather than leaving her
 * pushing a thumb that will not move.
 *
 * STATE IS THREE THINGS: the slices, whatever half-typed text is in a number
 * field, and which row was last blocked. Every figure on the screen — left to
 * assign, the daily number, all three bucket bars, the sentence under them —
 * is derived on render from the slices. Nothing is mirrored, so nothing can
 * disagree.
 *
 * `slicesRef` shadows the slice state because a range drag can fire several
 * `input` events inside one frame; a handler reading the render closure would
 * compute the second one from a state that is already stale and deduct from
 * the donor envelopes twice.
 */

/** $5. See the note above — this is the number that makes a value landable. */
const STEP_CENTS = 500;

/**
 * Dollars in a field -> integer cents, or null while it is not a number yet.
 *
 * Null rather than 0 is the point: "12." and "." are mid-keystroke, and
 * treating them as zero would empty the envelope under her cursor.
 */
function parseDollars(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return 0;
  if (!/^\d*(\.\d{0,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Cents -> the exact string the save action parses back. */
function toField(cents: number): string {
  return (cents / 100).toFixed(2);
}

function withoutKey(
  record: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * Pinned and unpinned differ in SHAPE and in WORD, never in colour alone: the
 * shackle closes and the label changes. A lock that only went blue would be
 * invisible to a third of the reasons someone cannot see it.
 */
function LockIcon({ closed }: { closed: boolean }) {
  return (
    <svg
      width="13"
      height="15"
      viewBox="0 0 14 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1.75"
        y="7.75"
        width="10.5"
        height="7.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d={closed ? "M4.25 7.75V4.5a2.75 2.75 0 0 1 5.5 0v3.25" : "M4.25 7.75V4.5a2.75 2.75 0 0 1 5.5 0"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * One envelope: name, exact figure, slider, what is left in it, pin.
 *
 * Memoised on purpose. A drag re-renders the parent on every `input` event;
 * without this every row in the list would re-render with it, and the rows
 * that did not change are most of them. Only the dragged row and whichever
 * rows actually gave up money re-render.
 */
const EnvelopeSlider = memo(function EnvelopeSlider({
  row,
  amountCents,
  pinned,
  maxCents,
  draft,
  blockedNote,
  onSlide,
  onType,
  onCommit,
  onPin,
}: {
  row: SplitRow;
  amountCents: number;
  pinned: boolean;
  maxCents: number;
  draft: string | undefined;
  blockedNote: string | null;
  onSlide: (id: string, valueCents: number) => void;
  onType: (id: string, raw: string) => void;
  onCommit: (id: string) => void;
  onPin: (id: string) => void;
}) {
  const fieldId = useId();
  const metaId = `${fieldId}-meta`;

  const remainingCents = row.carriedInCents + amountCents - row.spentCents;

  // Empty rather than "0.00": nothing in this app is seeded with an amount she
  // did not choose, and a field reading 0.00 is a figure she has to clear
  // before she can type.
  const shown = draft ?? (amountCents === 0 ? "" : toField(amountCents));

  // The filled part of the track. Defaulted in the stylesheet as well as here,
  // because a custom property that resolves to nothing fails silently.
  const fillPct = maxCents > 0 ? Math.min(100, (amountCents / maxCents) * 100) : 0;

  return (
    <div className={styles.row}>
      <span className={styles.rowName}>{row.name}</span>

      <span className={styles.rowField}>
        <span className={styles.currency} aria-hidden="true">
          $
        </span>
        {/* type="text", not type="number": a number input hands back "" for
            anything it dislikes mid-keystroke, which silently eats digits.
            inputMode="decimal" still raises the decimal pad on iOS, and the
            16px floor below stops iOS zooming the page on focus. */}
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0.00"
          value={shown}
          onChange={(e) => onType(row.id, e.target.value)}
          onBlur={() => onCommit(row.id)}
          aria-label={`${row.name}, exact amount in dollars`}
          aria-describedby={metaId}
          className={styles.amountInput}
        />
      </span>

      <input
        type="range"
        min={0}
        max={maxCents}
        step={STEP_CENTS}
        value={amountCents}
        onChange={(e) => onSlide(row.id, Number(e.target.value))}
        aria-label={`${row.name} slider`}
        aria-valuetext={`${formatCents(amountCents)}${pinned ? ", pinned" : ""}`}
        aria-describedby={metaId}
        className={styles.slider}
        style={{ "--fill": `${fillPct}%` } as CSSProperties}
      />

      {/* Always present, so a row never grows a line mid-drag and shunts the
          slider out from under her thumb. */}
      <span className={styles.rowMeta} id={metaId}>
        {row.carriedInCents !== 0 && (
          <>{formatCents(row.carriedInCents)} carried in &middot; </>
        )}
        {row.spentCents > 0 && <>{formatCents(row.spentCents)} spent &middot; </>}
        {formatCents(remainingCents)} to spend
      </span>

      <button
        type="button"
        onClick={() => onPin(row.id)}
        aria-pressed={pinned}
        aria-label={
          pinned
            ? `${row.name} is pinned. Unpin it to let other categories take from it.`
            : `Pin ${row.name} so nothing is taken from it.`
        }
        className={pinned ? styles.pinOn : styles.pin}
      >
        <LockIcon closed={pinned} />
        <span>{pinned ? "Pinned" : "Pin"}</span>
      </button>

      {blockedNote && (
        <p className={styles.blocked} role="status">
          {blockedNote}
        </p>
      )}
    </div>
  );
});

export function SplitSliders({
  payPeriodId,
  rows,
  fixed,
  initialCents,
  incomeCents,
  billsTotalCents,
  daysRemaining,
  targets,
  heading,
  intro,
  saveLabel = "Save this split",
  collapsible = false,
  footer,
}: {
  payPeriodId: string;
  rows: SplitRow[];
  fixed: SplitFixed[];
  /** What each envelope already holds for THIS period. Never a suggestion. */
  initialCents: Record<string, number>;
  incomeCents: number;
  /** Off the top before anything is split. */
  billsTotalCents: number;
  daysRemaining: number;
  /** Live while she is editing them on /budget/assign; saved elsewhere. */
  targets: AllocationTargets;
  heading: string;
  intro?: string;
  saveLabel?: string;
  /** Start folded away — the dashboard, once she has already split a check. */
  collapsible?: boolean;
  /** The targets editor, on the screen that has one. */
  footer?: ReactNode;
}) {
  const [held, setHeld] = useState<Slice[]>(() =>
    // Zero is zero. Never a "balanced" 50/30/20 opening split, never a
    // suggestion: the first figure in every envelope is one she put there.
    rows.map((r) => ({
      id: r.id,
      amountCents: initialCents[r.id] ?? 0,
      pinned: false,
    })),
  );

  /**
   * The split, lined up with the categories the server is currently sending.
   *
   * On the dashboard the "add a spending category" slot sits directly BELOW
   * this component and revalidates `/` in place: `rows` grows while this
   * component's own state, being client state, survives untouched. Without
   * this step the new category would render a slider that `dragTo` cannot
   * find — a control that looks live and does nothing.
   *
   * `reconcileSlices` returns the same array when the two already agree, so
   * the render during a drag allocates nothing and the memoised rows below
   * keep their identity.
   */
  const slices = reconcileSlices(held, rows.map((r) => r.id), initialCents);

  /**
   * The handlers' view of the split.
   *
   * Assigned during render on purpose: a range drag can fire several `input`
   * events inside one frame, and a handler reading the render closure would
   * compute the second from a state already superseded and deduct from the
   * donor envelopes twice. It also re-syncs after the reconcile above.
   */
  const slicesRef = useRef(slices);
  slicesRef.current = slices;

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [blockedId, setBlockedId] = useState<string | null>(null);

  const [open, setOpen] = useState(!collapsible);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poolCents = incomeCents - billsTotalCents;

  const apply = useCallback((next: Slice[]) => {
    slicesRef.current = next;
    setHeld(next);
  }, []);

  const handleSlide = useCallback(
    (id: string, valueCents: number) => {
      const result = dragTo(
        { poolCents, slices: slicesRef.current },
        id,
        valueCents,
      );
      apply(result.slices);
      setBlockedId(result.blocked ? id : null);
      // A drag states the figure outright; a half-typed draft left in the
      // field beside it would go on overriding what she just dragged to.
      setDrafts((d) => withoutKey(d, id));
    },
    [apply, poolCents],
  );

  const handleType = useCallback(
    (id: string, raw: string) => {
      setDrafts((d) => ({ ...d, [id]: raw }));
      const cents = parseDollars(raw);
      // Mid-keystroke. Leave the envelope exactly where it is.
      if (cents === null) return;
      apply(setExact({ poolCents, slices: slicesRef.current }, id, cents));
      setBlockedId(null);
    },
    [apply, poolCents],
  );

  const handleCommit = useCallback((id: string) => {
    setDrafts((d) => withoutKey(d, id));
  }, []);

  const handlePin = useCallback(
    (id: string) => {
      apply(togglePin(slicesRef.current, id));
      setBlockedId(null);
    },
    [apply],
  );

  // --- everything below is derived, every render ---

  const amountOf = new Map(slices.map((s) => [s.id, s.amountCents]));
  const pinnedIds = new Set(slices.filter((s) => s.pinned).map((s) => s.id));

  const assignedCents = totalAssignedCents(slices);
  const unassignedCents = poolCents - assignedCents;
  const over = unassignedCents < 0;

  /**
   * One scale for every row, so the same distance under her thumb is the same
   * number of dollars whichever slider she is on. It only ever grows past the
   * pool when she has typed an envelope over the whole paycheck, which is
   * allowed and which the slider then has to be able to show.
   */
  const maxCents = Math.max(
    STEP_CENTS,
    poolCents,
    ...slices.map((s) => s.amountCents),
  );

  // The spendable pool exactly as summarizePeriod builds it, so the preview
  // and the saved page cannot quote different daily numbers.
  const spendableAvailableCents = rows.reduce(
    (total, r) => total + r.carriedInCents + (amountOf.get(r.id) ?? 0),
    0,
  );
  const spendableRemainingCents = rows.reduce(
    (total, r) =>
      total + r.carriedInCents + (amountOf.get(r.id) ?? 0) - r.spentCents,
    0,
  );
  // Math.floor rather than round, so the number never encourages an overspend.
  const perDayCents =
    daysRemaining > 0 ? Math.floor(spendableRemainingCents / daysRemaining) : null;

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
        amountCents: amountOf.get(r.id) ?? 0,
      })),
    ],
    incomeCents,
    targets,
  });

  /**
   * Why a drag stopped. Said in words on the row it happened to, because a
   * thumb that silently refuses to move reads as a broken app.
   */
  const blockedNote =
    blockedId === null
      ? null
      : pinnedIds.size > 0
        ? "That is as high as this goes — the pool is empty and everything else is pinned. Unpin one to take from it."
        : "That is as high as this goes — there is nothing left in the other categories to take.";

  if (!open) {
    return (
      <section className={styles.section}>
        <button
          type="button"
          className={styles.reopen}
          onClick={() => setOpen(true)}
        >
          Adjust this split
        </button>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{heading}</h2>
      {intro && <p className={styles.intro}>{intro}</p>}

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
            value={toField(f.setAsideCents)}
          />
        ))}

        {/* The visible number field carries no name. What is saved is the
            state, formatted once, so a draft like "12." can never be what
            reaches the database. */}
        {slices.map((s) => (
          <input
            key={s.id}
            type="hidden"
            name={`amount:${s.id}`}
            value={toField(s.amountCents)}
          />
        ))}

        <div className={styles.summary} role="status" aria-live="polite">
          <p className={styles.summaryLabel}>
            {over ? "Over-assigned" : "Left to assign"}
          </p>
          <p className={over ? styles.summaryValueOver : styles.summaryValue}>
            {formatCents(Math.abs(unassignedCents))}
          </p>
          <p className={styles.summaryPerDay}>
            {spendableAvailableCents <= 0 ? (
              "Drag a category and your daily number appears here."
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

        <div className={styles.rows}>
          {rows.map((r) => (
            <EnvelopeSlider
              key={r.id}
              row={r}
              amountCents={amountOf.get(r.id) ?? 0}
              pinned={pinnedIds.has(r.id)}
              maxCents={maxCents}
              draft={drafts[r.id]}
              blockedNote={blockedId === r.id ? blockedNote : null}
              onSlide={handleSlide}
              onType={handleType}
              onCommit={handleCommit}
              onPin={handlePin}
            />
          ))}
        </div>

        <p className={styles.hint}>
          Dragging one up spends what is left to assign first. Once that is
          gone it takes a share from the others &mdash; except any you have
          pinned.
        </p>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={saving}>
            {saving ? "Saving…" : saveLabel}
          </button>
          <span className={styles.status} aria-live="polite">
            {status}
          </span>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </form>

      {/* The 50/30/20 lens: live, and never a gate. Nothing above is snapped,
          blocked or refused to keep a bar under its mark. */}
      <div className={styles.lens}>
        <h3 className={styles.lensTitle}>How this paycheck splits</h3>
        <p className={styles.lensNote} aria-live="polite">
          {/* assignedCents, not the needs bucket: her bills fill needs to 41%
              before she has touched anything, so the reading has to be told
              whether SHE has split this check yet. */}
          {bucketNote({ buckets, assignedCents })}
        </p>
        <BucketBars buckets={buckets} />
        {footer}
      </div>
    </section>
  );
}
