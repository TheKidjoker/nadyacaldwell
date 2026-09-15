import { describe, it, expect } from "vitest";
import {
  dragCeilingCents,
  dragTo,
  proportionalTake,
  reconcileSlices,
  setExact,
  togglePin,
  totalAssignedCents,
  unassignedCents,
} from "./redistribute";
import type { Slice, SplitState } from "./redistribute";

const slice = (
  id: string,
  amountCents: number,
  pinned = false,
): Slice => ({ id, amountCents, pinned });

/** Her actual check, less the bills: $704.92. */
const POOL = 70_492;

const state = (slices: Slice[], poolCents = POOL): SplitState => ({
  poolCents,
  slices,
});

describe("unassignedCents", () => {
  it("is the whole pool when nothing has been assigned", () => {
    expect(unassignedCents(state([slice("g", 0), slice("gas", 0)]))).toBe(POOL);
  });

  it("goes negative when she has committed more than the check holds", () => {
    const s = state([slice("g", 50_000), slice("gas", 30_000)]);
    expect(unassignedCents(s)).toBe(-9_508);
  });
});

describe("dragTo — the unassigned pool absorbs first", () => {
  it("takes only from unassigned while unassigned money remains", () => {
    const s = state([slice("groceries", 20_000), slice("gas", 10_000)]);

    const r = dragTo(s, "groceries", 30_000);

    expect(r.appliedCents).toBe(30_000);
    // Gas is untouched: she never decided to move it.
    expect(r.slices.find((x) => x.id === "gas")!.amountCents).toBe(10_000);
    expect(unassignedCents({ ...s, slices: r.slices })).toBe(POOL - 40_000);
    expect(r.blocked).toBe(false);
  });

  it("spends the last of the pool before reaching into anything else", () => {
    // Pool has exactly $50 left; she asks for $80 more.
    const s = state([slice("a", 30_000), slice("b", 30_000)], 65_000);
    expect(unassignedCents(s)).toBe(5_000);

    const r = dragTo(s, "a", 38_000);

    expect(r.appliedCents).toBe(38_000);
    // $50 came free; the other $30 came out of b, the only donor.
    expect(r.slices.find((x) => x.id === "b")!.amountCents).toBe(27_000);
    expect(unassignedCents({ ...s, slices: r.slices })).toBe(0);
  });
});

describe("dragTo — proportional once the pool is exhausted", () => {
  it("splits the shortfall in proportion to what each envelope holds", () => {
    // Pool fully assigned: 60/30/10 across three envelopes.
    const s = state(
      [slice("a", 10_000), slice("b", 60_000), slice("c", 30_000)],
      100_000,
    );
    expect(unassignedCents(s)).toBe(0);

    const r = dragTo(s, "a", 19_000); // wants $90 more

    const by = Object.fromEntries(r.slices.map((x) => [x.id, x.amountCents]));
    expect(by.a).toBe(19_000);
    // 9000 split 60:30 -> 6000 from b, 3000 from c.
    expect(by.b).toBe(54_000);
    expect(by.c).toBe(27_000);
    expect(totalAssignedCents(r.slices)).toBe(100_000);
  });

  it("never takes from a pinned envelope", () => {
    const s = state(
      [slice("a", 10_000), slice("b", 60_000, true), slice("c", 30_000)],
      100_000,
    );

    const r = dragTo(s, "a", 19_000);

    const by = Object.fromEntries(r.slices.map((x) => [x.id, x.amountCents]));
    expect(by.b).toBe(60_000); // pinned, untouched
    expect(by.c).toBe(21_000); // carried the whole $90 alone
    expect(by.a).toBe(19_000);
    expect(totalAssignedCents(r.slices)).toBe(100_000);
  });

  it("skips envelopes that are already empty", () => {
    const s = state(
      [slice("a", 10_000), slice("b", 0), slice("c", 90_000)],
      100_000,
    );

    const r = dragTo(s, "a", 15_000);

    const by = Object.fromEntries(r.slices.map((x) => [x.id, x.amountCents]));
    expect(by.b).toBe(0);
    expect(by.c).toBe(85_000);
  });

  it("drains donors rather than taking one below zero", () => {
    const s = state([slice("a", 1_000), slice("b", 2_000)], 3_000);

    const r = dragTo(s, "a", 3_000);

    const by = Object.fromEntries(r.slices.map((x) => [x.id, x.amountCents]));
    expect(by.a).toBe(3_000);
    expect(by.b).toBe(0);
    expect(r.blocked).toBe(false);
  });
});

describe("dragTo — when there is nowhere left to draw from", () => {
  it("reports blocked rather than moving, with every other envelope pinned", () => {
    const s = state(
      [slice("a", 10_000), slice("b", 60_000, true), slice("c", 30_000, true)],
      100_000,
    );

    const r = dragTo(s, "a", 25_000);

    expect(r.appliedCents).toBe(10_000); // did not move
    expect(r.blocked).toBe(true);
    expect(r.shortfallCents).toBe(15_000);
    expect(totalAssignedCents(r.slices)).toBe(100_000);
  });

  it("moves as far as it can and reports the rest as short", () => {
    const s = state(
      [slice("a", 10_000), slice("b", 4_000), slice("c", 86_000, true)],
      100_000,
    );

    const r = dragTo(s, "a", 20_000); // wants $100, only $40 is loose

    expect(r.appliedCents).toBe(14_000);
    expect(r.blocked).toBe(true);
    expect(r.shortfallCents).toBe(6_000);
    expect(r.slices.find((x) => x.id === "b")!.amountCents).toBe(0);
  });

  it("is not blocked when the request is met exactly", () => {
    const s = state([slice("a", 10_000), slice("b", 5_000)], 15_000);
    const r = dragTo(s, "a", 15_000);
    expect(r.blocked).toBe(false);
    expect(r.shortfallCents).toBe(0);
  });
});

describe("dragTo — dragging down", () => {
  it("returns money to the unassigned pool and moves nothing else", () => {
    const s = state(
      [slice("a", 40_000), slice("b", 30_000), slice("c", 30_000)],
      100_000,
    );

    const r = dragTo(s, "a", 10_000);

    const by = Object.fromEntries(r.slices.map((x) => [x.id, x.amountCents]));
    expect(by.a).toBe(10_000);
    expect(by.b).toBe(30_000);
    expect(by.c).toBe(30_000);
    expect(unassignedCents({ ...s, slices: r.slices })).toBe(30_000);
  });

  it("never pushes the money sideways into another envelope", () => {
    const s = state([slice("a", 50_000), slice("b", 50_000)], 100_000);
    const r = dragTo(s, "a", 0);
    expect(r.slices.find((x) => x.id === "b")!.amountCents).toBe(50_000);
  });

  it("floors at zero", () => {
    const s = state([slice("a", 5_000)], 10_000);
    const r = dragTo(s, "a", -4_000);
    expect(r.appliedCents).toBe(0);
    expect(r.blocked).toBe(false);
  });

  it("reduces an over-assignment when dragged down", () => {
    const s = state([slice("a", 90_000), slice("b", 30_000)], 100_000);
    expect(unassignedCents(s)).toBe(-20_000);

    const r = dragTo(s, "a", 60_000);
    expect(unassignedCents({ ...s, slices: r.slices })).toBe(10_000);
  });
});

describe("dragTo — over-assignment is a state it can work from", () => {
  it("takes from donors, not further into the red, when already over", () => {
    const s = state([slice("a", 60_000), slice("b", 60_000)], 100_000);
    expect(unassignedCents(s)).toBe(-20_000);

    const r = dragTo(s, "a", 70_000);

    const by = Object.fromEntries(r.slices.map((x) => [x.id, x.amountCents]));
    expect(by.a).toBe(70_000);
    expect(by.b).toBe(50_000);
    // The overage is unchanged: a drag never deepens it.
    expect(unassignedCents({ ...s, slices: r.slices })).toBe(-20_000);
  });
});

describe("setExact — the number field", () => {
  it("allows over-assignment and lets unassigned go negative", () => {
    const s = state([slice("a", 10_000), slice("b", 10_000)], 50_000);

    const next = setExact(s, "a", 90_000);

    expect(next.find((x) => x.id === "a")!.amountCents).toBe(90_000);
    expect(next.find((x) => x.id === "b")!.amountCents).toBe(10_000);
    expect(unassignedCents({ ...s, slices: next })).toBe(-50_000);
  });

  it("leaves every other envelope exactly where it was", () => {
    const s = state([slice("a", 10_000), slice("b", 25_000, true)], 50_000);
    const next = setExact(s, "a", 0);
    expect(next.find((x) => x.id === "b")).toEqual(slice("b", 25_000, true));
  });

  it("floors at zero and rounds to whole cents", () => {
    const s = state([slice("a", 10_000)], 50_000);
    expect(setExact(s, "a", -5)[0].amountCents).toBe(0);
    expect(setExact(s, "a", 1234.6)[0].amountCents).toBe(1_235);
  });
});

describe("proportionalTake — rounding never loses or invents a cent", () => {
  it("hands out exactly what was asked for", () => {
    const donors = [
      { id: "a", amountCents: 3_333 },
      { id: "b", amountCents: 3_333 },
      { id: "c", amountCents: 3_334 },
    ];
    const out = proportionalTake(donors, 1_000);
    expect(Object.values(out).reduce((t, v) => t + v, 0)).toBe(1_000);
  });

  it("sums to the whole across a wide sweep of awkward splits", () => {
    const donors = [
      { id: "a", amountCents: 1 },
      { id: "b", amountCents: 7 },
      { id: "c", amountCents: 11 },
      { id: "d", amountCents: 9_973 },
    ];
    const total = 1 + 7 + 11 + 9_973;

    for (let take = 0; take <= total; take += 1) {
      const out = proportionalTake(donors, take);
      const sum = Object.values(out).reduce((t, v) => t + v, 0);
      expect(sum).toBe(take);
      // And nobody was taken below zero.
      for (const d of donors) expect(out[d.id]).toBeLessThanOrEqual(d.amountCents);
      for (const d of donors) expect(out[d.id]).toBeGreaterThanOrEqual(0);
    }
  });

  it("caps at the donors' total when asked for more", () => {
    const donors = [{ id: "a", amountCents: 500 }];
    expect(proportionalTake(donors, 900)).toEqual({ a: 500 });
  });

  it("gives nothing away when there is nothing to take", () => {
    expect(proportionalTake([], 5_000)).toEqual({});
    expect(proportionalTake([{ id: "a", amountCents: 0 }], 5_000)).toEqual({
      a: 0,
    });
    expect(proportionalTake([{ id: "a", amountCents: 100 }], 0)).toEqual({
      a: 0,
    });
  });

  it("is deterministic — the same input gives the same cents every time", () => {
    const donors = [
      { id: "a", amountCents: 1_000 },
      { id: "b", amountCents: 1_000 },
      { id: "c", amountCents: 1_000 },
    ];
    const first = proportionalTake(donors, 1_000);
    for (let i = 0; i < 20; i += 1) {
      expect(proportionalTake(donors, 1_000)).toEqual(first);
    }
    // 1000/3 -> 333 each with one cent over, handed to the first by id.
    expect(first).toEqual({ a: 334, b: 333, c: 333 });
  });
});

describe("a drag conserves the paycheck", () => {
  it("keeps the parts summing to the whole through a long sequence", () => {
    let slices = [
      slice("a", 0),
      slice("b", 0),
      slice("c", 0),
      slice("d", 0),
    ];
    const pool = 70_492;

    // A plausible session: raise, lower, pin, raise again. At no point may
    // the assigned total exceed the pool, and cents may not appear.
    const moves: [string, number][] = [
      ["a", 25_000],
      ["b", 30_000],
      ["c", 20_000],
      ["a", 40_000],
      ["d", 15_000],
      ["b", 5_000],
      ["c", 60_000],
      ["a", 0],
      ["d", 70_000],
    ];

    for (const [id, to] of moves) {
      const r = dragTo({ poolCents: pool, slices }, id, to);
      slices = r.slices;

      const assigned = totalAssignedCents(slices);
      expect(assigned).toBeLessThanOrEqual(pool);
      expect(assigned).toBe(slices.reduce((t, s) => t + s.amountCents, 0));
      for (const s of slices) expect(s.amountCents).toBeGreaterThanOrEqual(0);
      for (const s of slices) expect(Number.isInteger(s.amountCents)).toBe(true);
    }
  });

  it("holds when a pinned envelope sits in the middle of the sequence", () => {
    let slices = [slice("a", 30_000), slice("b", 30_000), slice("c", 10_000)];
    const pool = 70_000;

    slices = togglePin(slices, "b");
    expect(slices.find((s) => s.id === "b")!.pinned).toBe(true);

    for (const to of [40_000, 55_000, 70_000, 65_000]) {
      const r = dragTo({ poolCents: pool, slices }, "a", to);
      slices = r.slices;
      expect(slices.find((s) => s.id === "b")!.amountCents).toBe(30_000);
      expect(totalAssignedCents(slices)).toBeLessThanOrEqual(pool);
    }
  });
});

describe("dragCeilingCents", () => {
  it("is what she holds plus the pool plus every unpinned envelope", () => {
    const s = state(
      [slice("a", 10_000), slice("b", 20_000), slice("c", 30_000, true)],
      100_000,
    );
    // 10_000 + 40_000 unassigned + 20_000 from b
    expect(dragCeilingCents(s, "a")).toBe(70_000);
  });

  it("equals the current amount when there is nothing anywhere to take", () => {
    const s = state(
      [slice("a", 10_000), slice("b", 90_000, true)],
      100_000,
    );
    expect(dragCeilingCents(s, "a")).toBe(10_000);
  });

  it("is zero for an envelope that is not in the split", () => {
    expect(dragCeilingCents(state([slice("a", 1)]), "nope")).toBe(0);
  });
});

describe("togglePin", () => {
  it("flips one envelope and copies the rest untouched", () => {
    const before = [slice("a", 100), slice("b", 200, true)];
    const after = togglePin(before, "a");
    expect(after).toEqual([slice("a", 100, true), slice("b", 200, true)]);
    // The input is not mutated.
    expect(before[0].pinned).toBe(false);
  });
});

describe("an unknown envelope is a no-op, not a crash", () => {
  it("returns the split unchanged", () => {
    const s = state([slice("a", 100)]);
    const r = dragTo(s, "ghost", 5_000);
    expect(r.slices).toEqual([slice("a", 100)]);
    expect(r.blocked).toBe(false);
  });
});

describe("reconcileSlices", () => {
  const initial = { a: 1_000, b: 2_000, c: 3_000 };

  it("returns the same array when the split already matches", () => {
    const prev = [slice("a", 500), slice("b", 900, true)];
    expect(reconcileSlices(prev, ["a", "b"], initial)).toBe(prev);
  });

  it("gives a newly named category a live slider at zero, not a suggestion", () => {
    const prev = [slice("a", 500)];
    const next = reconcileSlices(prev, ["a", "gas"], { a: 1_000 });

    expect(next).toEqual([slice("a", 500), slice("gas", 0)]);
    // And it is a real slice, so a drag can find it.
    const r = dragTo({ poolCents: 10_000, slices: next }, "gas", 2_000);
    expect(r.appliedCents).toBe(2_000);
  });

  it("opens a category the server says already holds money at that amount", () => {
    const next = reconcileSlices([slice("a", 500)], ["a", "b"], initial);
    expect(next[1]).toEqual(slice("b", 2_000));
  });

  it("keeps what she has already dragged and pinned", () => {
    const prev = [slice("a", 4_200, true), slice("b", 900)];
    const next = reconcileSlices(prev, ["a", "b", "c"], initial);

    expect(next[0]).toEqual(slice("a", 4_200, true));
    expect(next[1]).toEqual(slice("b", 900));
  });

  it("drops a category that is no longer there, and follows a reorder", () => {
    const prev = [slice("a", 100), slice("b", 200), slice("c", 300)];
    expect(reconcileSlices(prev, ["c", "a"], initial)).toEqual([
      slice("c", 300),
      slice("a", 100),
    ]);
  });
});
