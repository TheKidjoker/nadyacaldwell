import { describe, it, expect } from "vitest";
import { bucketNote } from "./bucketNote";
import { bucketTotals } from "./calc";
import { DEFAULT_TARGETS } from "./types";
import type { BucketTotals } from "./types";

const totals = (over: Partial<BucketTotals> = {}): BucketTotals => ({
  needsCents: 0,
  wantsCents: 0,
  savingsCents: 0,
  needsPct: 0,
  wantsPct: 0,
  savingsPct: 0,
  targets: DEFAULT_TARGETS,
  overAllocated: false,
  ...over,
});

/** Every fixture below is a check she HAS started splitting. */
const ASSIGNED = (buckets: BucketTotals) => ({ buckets, assignedCents: 1 });

describe("bucketNote", () => {
  it("names an over-assignment first, before any bucket reading", () => {
    const note = bucketNote(
      ASSIGNED(totals({ overAllocated: true, needsCents: 90_000, needsPct: 0.9 })),
    );
    expect(note).toMatch(/more in than this check holds/i);
  });

  it("says nothing has been split when nothing has", () => {
    const note = bucketNote({ buckets: totals({ savingsCents: 70_000, savingsPct: 1 }), assignedCents: 0 });
    expect(note).toMatch(/nothing split yet/i);
  });

  it("does not congratulate her for a savings bar that is only unassigned money", () => {
    // The bug this exists to stop: her BILLS fill the needs bucket to 41% the
    // moment they are entered, so a "has she started?" test on needsCents
    // never fires — and the reading fell through to "savings is sitting above
    // your mark" on a check she had not touched a slider on.
    const buckets = bucketTotals({
      categories: [{ id: "rent", bucket: "needs" }],
      periodAllocations: [
        { payPeriodId: "p", categoryId: "rent", amountCents: 49_508 },
      ],
      incomeCents: 120_000,
      targets: DEFAULT_TARGETS,
    });

    expect(buckets.needsCents).toBeGreaterThan(0);
    expect(bucketNote({ buckets, assignedCents: 0 })).toMatch(/nothing split yet/i);
  });

  it("calls a heavy needs check heavy, without correcting her", () => {
    const note = bucketNote(
      ASSIGNED(totals({
        needsCents: 45_000,
        wantsCents: 10_000,
        needsPct: 0.65,
        wantsPct: 0.14,
        savingsPct: 0.21,
      })),
    );
    expect(note).toMatch(/heavy on needs/i);
    expect(note).not.toMatch(/should|try to|too much|cut back/i);
  });

  it("softens to 'a little' just over the mark", () => {
    const note = bucketNote(
      ASSIGNED(totals({
        needsCents: 38_000,
        wantsCents: 15_000,
        needsPct: 0.55,
        wantsPct: 0.21,
        savingsPct: 0.24,
      })),
    );
    expect(note).toBe("A little heavy on needs this check.");
  });

  it("reads wants once needs is near its mark", () => {
    const note = bucketNote(
      ASSIGNED(totals({
        needsCents: 34_000,
        wantsCents: 29_000,
        needsPct: 0.49,
        wantsPct: 0.42,
        savingsPct: 0.09,
      })),
    );
    expect(note).toMatch(/wants/i);
  });

  it("notes savings above the mark without congratulating", () => {
    const note = bucketNote(
      ASSIGNED(totals({
        needsCents: 34_000,
        wantsCents: 14_000,
        needsPct: 0.48,
        wantsPct: 0.2,
        savingsPct: 0.32,
      })),
    );
    expect(note).toMatch(/savings is sitting above your mark/i);
    expect(note).not.toMatch(/!|great|well done|nice/i);
  });

  it("names the bucket that took the money rather than scolding the savings bar", () => {
    // Savings is down at 6% against a 20% mark, but the three shares sum to
    // the whole check: that is the same fact as wants being 12 points over.
    // It is said once, about the bucket that actually took it.
    const note = bucketNote(
      ASSIGNED(totals({
        needsCents: 36_000,
        wantsCents: 30_000,
        needsPct: 0.52,
        wantsPct: 0.42,
        savingsPct: 0.06,
      })),
    );
    expect(note).toBe("More on wants than your mark this check.");
    expect(note).not.toMatch(/should|need to|must/i);
  });

  it("falls through to a neutral line when she is close to her marks", () => {
    const note = bucketNote(
      ASSIGNED(totals({
        needsCents: 35_000,
        wantsCents: 21_000,
        needsPct: 0.5,
        wantsPct: 0.3,
        savingsPct: 0.2,
      })),
    );
    expect(note).toBe("Close to your marks this check.");
  });

  it("respects targets she has moved, not a hard-coded 50/30/20", () => {
    const hers = { needsPct: 70, wantsPct: 20, savingsPct: 10 };
    const at60 = totals({
      needsCents: 42_000,
      wantsCents: 14_000,
      needsPct: 0.6,
      wantsPct: 0.2,
      savingsPct: 0.2,
      targets: hers,
    });
    // 60% needs is UNDER a 70% mark, so nothing is "heavy" about it.
    expect(bucketNote({ buckets: at60, assignedCents: 56_000 })).not.toMatch(/heavy on needs/i);
  });

  it("always returns a sentence, for every real split of her check", () => {
    // Drive it off the same pure function the bars use, so the two can never
    // describe different splits.
    for (let needs = 0; needs <= 70_000; needs += 3_500) {
      for (let wants = 0; wants + needs <= 90_000; wants += 7_000) {
        const buckets = bucketTotals({
          categories: [
            { id: "n", bucket: "needs" },
            { id: "w", bucket: "wants" },
          ],
          periodAllocations: [
            { payPeriodId: "p", categoryId: "n", amountCents: needs },
            { payPeriodId: "p", categoryId: "w", amountCents: wants },
          ],
          incomeCents: 70_492,
          targets: DEFAULT_TARGETS,
        });

        const note = bucketNote({ buckets, assignedCents: needs + wants });
        expect(typeof note).toBe("string");
        expect(note.length).toBeGreaterThan(0);
        expect(note.endsWith(".")).toBe(true);
      }
    }
  });
});
