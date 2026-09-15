/**
 * What happens to the rest of the paycheck when she moves one slider.
 *
 * This is the whole arithmetic of the split screen, kept out of the component
 * on purpose: a drag handler is the last place a rounding rule should live,
 * and none of this is testable once it is tangled up with pointer events.
 *
 * THE RULE, in one paragraph. Dragging an envelope UP spends the unassigned
 * pool first — nothing she has already decided moves while there is money
 * nobody has claimed. Only when the pool is empty does the drag pull from the
 * other envelopes, in proportion to what each currently holds, and never from
 * one she has pinned. Dragging DOWN simply returns money to the pool; it
 * never pushes money sideways into envelopes she did not touch.
 *
 * INTEGER CENTS THROUGHOUT. Every amount here is a whole number of cents and
 * every function returns whole numbers of cents. A float would lose a cent on
 * a three-way proportional split, and a cent lost out of her paycheck is a
 * cent she has to go find.
 *
 * WHAT IS DELIBERATELY NOT CLAMPED. `setExact` — the number field beside each
 * slider — lets the total run past the paycheck, which makes `unassigned`
 * negative. That is a real thing people do and the screen says so plainly
 * rather than refusing the keystroke. The one place a move IS refused is a
 * drag with nowhere to draw from (pool empty, every other envelope pinned or
 * already at zero): `DragResult.blocked` reports it so the screen can say why
 * instead of a thumb that mysteriously will not move.
 */

/** One spending envelope in the split she is arranging. */
export interface Slice {
  id: string;
  /** Integer cents. Never negative. */
  amountCents: number;
  /** "Never take from this one." Set by her, honoured by every drag. */
  pinned: boolean;
}

export interface SplitState {
  /**
   * Everything this check has to hand the spending envelopes: what she was
   * paid, less the bills' share. May be negative when the bills alone
   * outrun the check, which is a fact rather than an error.
   */
  poolCents: number;
  slices: Slice[];
}

export interface DragResult {
  slices: Slice[];
  /** What the dragged envelope actually ended up holding. */
  appliedCents: number;
  /** True when she asked for more than existed anywhere to give. */
  blocked: boolean;
  /** How much of the request could not be met. 0 unless `blocked`. */
  shortfallCents: number;
}

export function totalAssignedCents(slices: readonly Slice[]): number {
  return slices.reduce((total, s) => total + s.amountCents, 0);
}

/**
 * Money this check has not been told what to do with.
 *
 * Negative means she has committed more than she was paid. It is returned
 * signed, never clamped: the screen needs to know by how much.
 */
export function unassignedCents(state: SplitState): number {
  return state.poolCents - totalAssignedCents(state.slices);
}

/**
 * Split `takeCents` across `donors` in proportion to what each holds.
 *
 * Largest-remainder, not per-share rounding. Rounding each share on its own
 * either loses cents or invents them; here every share is floored first and
 * the cents left over are handed out one at a time to the shares with the
 * largest fractional part. THE PARTS ALWAYS SUM TO EXACTLY `takeCents` (or to
 * the donors' total, when that is smaller). Ties break by id so the same
 * input always gives the same answer.
 *
 * No donor is ever taken below zero: a floored share of `amount * take /
 * total` is at most `amount`, and the leftover cent only goes to a donor that
 * still has room for it.
 */
export function proportionalTake(
  donors: readonly { id: string; amountCents: number }[],
  takeCents: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of donors) out[d.id] = 0;

  if (takeCents <= 0) return out;

  const total = donors.reduce((t, d) => t + Math.max(0, d.amountCents), 0);
  if (total <= 0) return out;

  // Never take more than there is. The caller is told separately.
  const take = Math.min(Math.round(takeCents), total);

  const parts = donors.map((d) => {
    const amount = Math.max(0, d.amountCents);
    const exact = (amount * take) / total;
    const floor = Math.floor(exact);
    return { id: d.id, amount, floor, frac: exact - floor };
  });

  let remainder = take;
  for (const p of parts) {
    out[p.id] = p.floor;
    remainder -= p.floor;
  }

  // Each floored share loses less than a whole cent, so the remainder is
  // always smaller than the number of donors that still have room — one pass
  // is provably enough.
  const eligible = parts
    .filter((p) => p.floor < p.amount)
    .sort((a, b) => b.frac - a.frac || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const p of eligible) {
    if (remainder <= 0) break;
    out[p.id] += 1;
    remainder -= 1;
  }

  return out;
}

/**
 * The highest this envelope can be dragged right now.
 *
 * What it already holds, plus the unassigned pool, plus everything the
 * unpinned envelopes are holding. When this equals the envelope's current
 * amount the slider genuinely cannot go up, and the screen should say why.
 */
export function dragCeilingCents(state: SplitState, id: string): number {
  const target = state.slices.find((s) => s.id === id);
  if (!target) return 0;

  const free = Math.max(0, unassignedCents(state));
  const fromOthers = state.slices
    .filter((s) => s.id !== id && !s.pinned)
    .reduce((total, s) => total + Math.max(0, s.amountCents), 0);

  return target.amountCents + free + fromOthers;
}

/**
 * Move one envelope to `requestedCents`, and settle up with everything else.
 *
 * Down is trivial and always allowed: the money goes back to the pool. Up
 * spends the pool first and only then reaches into the unpinned envelopes,
 * proportionally. An unknown id is a no-op rather than a throw — a stale row
 * mid-render must not take the screen down.
 */
export function dragTo(
  state: SplitState,
  id: string,
  requestedCents: number,
): DragResult {
  const copy = state.slices.map((s) => ({ ...s }));
  const target = copy.find((s) => s.id === id);

  if (!target) {
    return { slices: copy, appliedCents: 0, blocked: false, shortfallCents: 0 };
  }

  const requested = Math.max(0, Math.round(requestedCents));
  const delta = requested - target.amountCents;

  // DOWN, or no change. Money returns to the pool and nothing else moves:
  // she lowered this envelope, not the others.
  if (delta <= 0) {
    target.amountCents = requested;
    return {
      slices: copy,
      appliedCents: requested,
      blocked: false,
      shortfallCents: 0,
    };
  }

  // UP. The unassigned pool goes first, in full, before anything she has
  // already decided is touched.
  const free = Math.max(0, unassignedCents(state));
  const fromPool = Math.min(delta, free);
  const stillNeeded = delta - fromPool;

  // Pinned envelopes and empty ones are not donors. An empty one has nothing
  // to give and would only add a zero to the proportional split.
  const donors = copy.filter(
    (s) => s.id !== id && !s.pinned && s.amountCents > 0,
  );
  const donorTotal = donors.reduce((total, d) => total + d.amountCents, 0);

  const taken = Math.min(stillNeeded, donorTotal);
  const shares = proportionalTake(donors, taken);
  for (const d of donors) d.amountCents -= shares[d.id] ?? 0;

  target.amountCents = target.amountCents + fromPool + taken;

  const shortfallCents = stillNeeded - taken;

  return {
    slices: copy,
    appliedCents: target.amountCents,
    blocked: shortfallCents > 0,
    shortfallCents,
  };
}

/**
 * Put an exact figure in one envelope, leaving every other envelope alone.
 *
 * This is the number field, not the slider: typing is how she says a precise
 * amount, and precise amounts are allowed to exceed the paycheck. The total
 * is NOT rebalanced and NOT clamped — the unassigned figure simply goes
 * negative and the screen reports it.
 */
export function setExact(
  state: SplitState,
  id: string,
  cents: number,
): Slice[] {
  const next = Math.max(0, Math.round(cents));
  return state.slices.map((s) =>
    s.id === id ? { ...s, amountCents: next } : { ...s },
  );
}

/** Flip "never take from this one" on a single envelope. */
export function togglePin(slices: readonly Slice[], id: string): Slice[] {
  return slices.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : { ...s }));
}

/**
 * Line the split up with the categories the server is now sending.
 *
 * The dashboard mounts this split directly above the "add a spending
 * category" slot, and adding one revalidates `/` in place — the server sends a
 * longer `rows`, while the component's own slice state, being client state,
 * survives untouched. Without this, the new category renders a slider that
 * `dragTo` cannot find and that therefore does nothing at all: a control that
 * looks live and is dead.
 *
 * Anything already held keeps its amount AND its pin. Anything new opens at
 * what the server says it holds — zero, for a category she has only just
 * named, never a suggested figure. Anything gone drops out.
 *
 * Returns `prev` UNCHANGED when the two already agree, so the common render
 * does not hand every row a new object and re-render the whole list.
 */
export function reconcileSlices(
  prev: readonly Slice[],
  ids: readonly string[],
  initialCents: Record<string, number>,
): Slice[] {
  if (prev.length === ids.length && prev.every((s, i) => s.id === ids[i])) {
    return prev as Slice[];
  }

  const held = new Map(prev.map((s) => [s.id, s]));

  return ids.map(
    (id) =>
      held.get(id) ?? {
        id,
        amountCents: initialCents[id] ?? 0,
        pinned: false,
      },
  );
}
