import { describe, it, expect } from "vitest";
import { summarizePeriod } from "./calc";
import { DEFAULT_TARGETS } from "./types";
import type { Category, PayPeriod, Allocation, Paycheck } from "./types";

const period: PayPeriod = {
  id: "p1",
  startsOn: "2026-09-11",
  endsOn: "2026-09-24",
};

function cat(
  id: string,
  bucket: Category["bucket"],
  kind: Category["kind"] = "spending",
): Category {
  return {
    id,
    name: id,
    kind,
    bucket,
    carryover: kind === "bill",
    cadence: kind === "bill" ? "monthly" : null,
    recurringAmountCents: kind === "bill" ? 120_000 : null,
    dueAnchor: kind === "bill" ? "2026-09-01" : null,
    color: "#9ac5e7",
    sortOrder: 0,
  };
}

const alloc = (categoryId: string, amountCents: number): Allocation => ({
  payPeriodId: "p1",
  categoryId,
  amountCents,
});

const check = (amountCents: number): Paycheck => ({
  id: "k1",
  receivedOn: "2026-09-11",
  amountCents,
  kind: "base",
});

function run(categories: Category[], allocations: Allocation[], incomeCents: number) {
  return summarizePeriod({
    period,
    paychecks: [check(incomeCents)],
    categories,
    allocations,
    transactions: [],
    today: "2026-09-11",
    targets: DEFAULT_TARGETS,
  }).buckets;
}

describe("bucket totals", () => {
  it("sums allocations into their buckets", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 50_000), alloc("starbucks", 10_000)],
      100_000,
    );

    expect(b.needsCents).toBe(50_000);
    expect(b.wantsCents).toBe(10_000);
  });

  it("counts unallocated income as savings", () => {
    const b = run([cat("rent", "needs", "bill")], [alloc("rent", 60_000)], 100_000);
    expect(b.savingsCents).toBe(40_000);
  });

  it("adds savings-bucket allocations to unallocated income", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("transfer", "savings")],
      [alloc("rent", 50_000), alloc("transfer", 20_000)],
      100_000,
    );

    expect(b.savingsCents).toBe(50_000);
  });

  it("makes the three buckets sum to exactly her income", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 55_000), alloc("starbucks", 12_500)],
      100_000,
    );

    expect(b.needsCents + b.wantsCents + b.savingsCents).toBe(100_000);
  });

  it("makes the percentages sum to one", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 55_000), alloc("starbucks", 12_500)],
      100_000,
    );

    expect(b.needsPct + b.wantsPct + b.savingsPct).toBeCloseTo(1, 10);
    expect(b.needsPct).toBeCloseTo(0.55, 10);
    expect(b.wantsPct).toBeCloseTo(0.125, 10);
    expect(b.savingsPct).toBeCloseTo(0.325, 10);
  });

  it("defaults the targets to 50/30/20", () => {
    const b = run([cat("rent", "needs", "bill")], [alloc("rent", 50_000)], 100_000);

    expect(b.targets.needsPct).toBe(50);
    expect(b.targets.wantsPct).toBe(30);
    expect(b.targets.savingsPct).toBe(20);
  });

  it("carries custom targets through", () => {
    const r = summarizePeriod({
      period,
      paychecks: [check(100_000)],
      categories: [cat("rent", "needs", "bill")],
      allocations: [alloc("rent", 50_000)],
      transactions: [],
      today: "2026-09-11",
      targets: { needsPct: 75, wantsPct: 10, savingsPct: 15 },
    });

    expect(r.buckets.targets.needsPct).toBe(75);
  });

  it("flags over-allocation and never reports negative savings", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 90_000), alloc("starbucks", 30_000)],
      100_000,
    );

    expect(b.overAllocated).toBe(true);
    expect(b.savingsCents).toBe(0);
    expect(b.needsPct + b.wantsPct + b.savingsPct).toBeCloseTo(1, 10);
    expect(b.needsPct).toBeCloseTo(0.75, 10);
  });

  it("reports all zeroes without dividing by zero when nothing exists yet", () => {
    const b = run([], [], 0);

    expect(b.needsCents).toBe(0);
    expect(b.wantsCents).toBe(0);
    expect(b.savingsCents).toBe(0);
    expect(b.needsPct).toBe(0);
    expect(b.wantsPct).toBe(0);
    expect(b.savingsPct).toBe(0);
    expect(b.overAllocated).toBe(false);
  });
});
