import { describe, it, expect } from "vitest";
import { envelopeBalance } from "./calc";
import type { Category, PayPeriod, Allocation, Transaction } from "./types";

const period: PayPeriod = {
  id: "p2",
  startsOn: "2026-09-11",
  endsOn: "2026-09-24",
};

const priorPeriod = "p1";

function spending(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Groceries",
    kind: "spending",
    bucket: "needs",
    carryover: false,
    cadence: null,
    recurringAmountCents: null,
    dueAnchor: null,
    color: "#9ac5e7",
    sortOrder: 0,
    ...overrides,
  };
}

function bill(overrides: Partial<Category> = {}): Category {
  return {
    id: "c2",
    name: "Rent",
    kind: "bill",
    bucket: "needs",
    carryover: true,
    cadence: "monthly",
    recurringAmountCents: 120_000,
    dueAnchor: "2026-09-01",
    color: "#6ba1cd",
    sortOrder: 1,
    ...overrides,
  };
}

const alloc = (payPeriodId: string, categoryId: string, amountCents: number): Allocation =>
  ({ payPeriodId, categoryId, amountCents });

const txn = (id: string, categoryId: string, occurredOn: string, amountCents: number): Transaction =>
  ({ id, categoryId, occurredOn, amountCents });

describe("envelopeBalance — non-carryover spending", () => {
  it("subtracts this period's spend from this period's allocation", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc("p2", "c1", 30_000)],
      transactions: [txn("t1", "c1", "2026-09-15", 4_250)],
    });

    expect(r.allocatedCents).toBe(30_000);
    expect(r.spentCents).toBe(4_250);
    expect(r.carriedInCents).toBe(0);
    expect(r.remainingCents).toBe(25_750);
    expect(r.overspent).toBe(false);
  });

  it("ignores allocations and spend from other periods", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc(priorPeriod, "c1", 99_999), alloc("p2", "c1", 30_000)],
      transactions: [
        txn("t0", "c1", "2026-09-01", 50_000), // before this period
        txn("t1", "c1", "2026-09-15", 4_250),
        txn("t2", "c1", "2026-10-01", 7_000), // after this period
      ],
    });

    expect(r.allocatedCents).toBe(30_000);
    expect(r.spentCents).toBe(4_250);
    expect(r.remainingCents).toBe(25_750);
  });

  it("reports overspent with a negative remaining", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [txn("t1", "c1", "2026-09-15", 13_500)],
    });

    expect(r.remainingCents).toBe(-3_500);
    expect(r.overspent).toBe(true);
    expect(r.pctUsed).toBeGreaterThan(1);
  });

  it("returns pctUsed of 0 rather than dividing by zero", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.allocatedCents).toBe(0);
    expect(r.pctUsed).toBe(0);
    expect(r.remainingCents).toBe(0);
    expect(r.overspent).toBe(false);
  });

  it("counts spend on the first and last day of the period", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [
        txn("t1", "c1", "2026-09-11", 1_000),
        txn("t2", "c1", "2026-09-24", 2_000),
      ],
    });

    expect(r.spentCents).toBe(3_000);
  });
});

describe("envelopeBalance — carryover", () => {
  it("brings forward an unspent balance from prior periods", () => {
    const r = envelopeBalance({
      category: spending({ carryover: true }),
      period,
      allocations: [alloc(priorPeriod, "c1", 20_000), alloc("p2", "c1", 20_000)],
      transactions: [txn("t0", "c1", "2026-09-02", 5_000)],
    });

    expect(r.carriedInCents).toBe(15_000);
    expect(r.allocatedCents).toBe(20_000);
    expect(r.spentCents).toBe(0);
    expect(r.remainingCents).toBe(35_000);
  });

  it("carries a negative balance forward, so past overspend follows her", () => {
    const r = envelopeBalance({
      category: spending({ carryover: true }),
      period,
      allocations: [alloc(priorPeriod, "c1", 10_000), alloc("p2", "c1", 10_000)],
      transactions: [txn("t0", "c1", "2026-09-02", 18_000)],
    });

    expect(r.carriedInCents).toBe(-8_000);
    expect(r.remainingCents).toBe(2_000);
  });
});

describe("envelopeBalance — bill set-asides", () => {
  it("computes the per-check set-aside as monthly * 12 / 26, not half", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBe(55_385);
    expect(r.perCheckSetAsideCents).not.toBe(60_000);
  });

  it("computes the set-aside for a weekly bill", () => {
    const r = envelopeBalance({
      category: bill({ cadence: "weekly", recurringAmountCents: 16_000 }),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBe(32_000);
  });

  it("computes the set-aside for a semiannual premium", () => {
    const r = envelopeBalance({
      category: bill({ cadence: "semiannual", recurringAmountCents: 85_200 }),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBe(6_554);
  });

  it("is fully funded only when it can pay the bill in full", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [
        alloc("p0", "c2", 55_385),
        alloc(priorPeriod, "c2", 55_385),
        alloc("p2", "c2", 55_385),
      ],
      transactions: [],
    });

    expect(r.remainingCents).toBe(166_155);
    expect(r.fullyFunded).toBe(true);
  });

  it("is not fully funded at a sixth of a semiannual premium", () => {
    // The old monthly-target rule would have called 14,200 'funded'.
    const r = envelopeBalance({
      category: bill({ cadence: "semiannual", recurringAmountCents: 85_200 }),
      period,
      allocations: [alloc("p2", "c2", 14_200)],
      transactions: [],
    });

    expect(r.fullyFunded).toBe(false);
  });

  it("goes negative when the bill is paid before it is funded", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [alloc("p2", "c2", 55_385)],
      transactions: [txn("t1", "c2", "2026-09-15", 120_000)],
    });

    expect(r.remainingCents).toBe(-64_615);
    expect(r.overspent).toBe(true);
  });

  it("reports the next due date on or after the period start", () => {
    const r = envelopeBalance({
      category: bill({ dueAnchor: "2026-09-01", cadence: "monthly" }),
      period, // 2026-09-11 .. 2026-09-24
      allocations: [],
      transactions: [],
    });

    expect(r.nextDueOn).toBe("2026-10-01");
  });

  it("leaves every bill field null for spending categories", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBeNull();
    expect(r.fullyFunded).toBeNull();
    expect(r.nextDueOn).toBeNull();
    expect(r.cadence).toBeNull();
  });

  it("carries the bucket through", () => {
    const r = envelopeBalance({
      category: spending({ bucket: "wants" }),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.bucket).toBe("wants");
  });
});

import { summarizePeriod } from "./calc";
import { DEFAULT_TARGETS } from "./types";
import type { Paycheck } from "./types";

const check = (id: string, receivedOn: string, amountCents: number, kind: Paycheck["kind"]): Paycheck =>
  ({ id, receivedOn, amountCents, kind });

describe("summarizePeriod", () => {
  const categories = [spending(), bill()];

  it("sums base and commission checks landing inside the period", () => {
    const r = summarizePeriod({
      period,
      paychecks: [
        check("k1", "2026-09-11", 140_000, "base"),
        check("k2", "2026-09-18", 62_000, "commission"),
        check("k0", "2026-08-28", 140_000, "base"), // prior period
      ],
      categories,
      allocations: [],
      transactions: [],
      targets: DEFAULT_TARGETS,
      today: "2026-09-18",
    });

    expect(r.baseCents).toBe(140_000);
    expect(r.commissionCents).toBe(62_000);
    expect(r.incomeCents).toBe(202_000);
  });

  it("excludes bill set-asides from spendable remaining", () => {
    const r = summarizePeriod({
      period,
      paychecks: [check("k1", "2026-09-11", 140_000, "base")],
      categories,
      allocations: [alloc("p2", "c1", 30_000), alloc("p2", "c2", 55_385)],
      transactions: [],
      targets: DEFAULT_TARGETS,
      today: "2026-09-11",
    });

    // Only the groceries envelope is spendable. Rent's 55,385 is not.
    expect(r.spendableRemainingCents).toBe(30_000);
    expect(r.totalAllocatedCents).toBe(85_385);
  });

  it("computes safe-to-spend-per-day over the days remaining", () => {
    const r = summarizePeriod({
      period, // 2026-09-11 .. 2026-09-24
      paychecks: [check("k1", "2026-09-11", 140_000, "base")],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 28_000)],
      transactions: [txn("t1", "c1", "2026-09-12", 14_000)],
      targets: DEFAULT_TARGETS,
      today: "2026-09-18", // 18th through 24th inclusive = 7 days
    });

    expect(r.daysRemaining).toBe(7);
    expect(r.spendableRemainingCents).toBe(14_000);
    expect(r.safeToSpendPerDayCents).toBe(2_000);
  });

  it("returns null for safe-to-spend once the period has passed", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 28_000)],
      transactions: [],
      targets: DEFAULT_TARGETS,
      today: "2026-09-25",
    });

    expect(r.daysRemaining).toBe(0);
    expect(r.safeToSpendPerDayCents).toBeNull();
  });

  it("rounds the day rate down, never encouraging an overspend", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 1_000)],
      transactions: [],
      targets: DEFAULT_TARGETS,
      today: "2026-09-22", // 22,23,24 = 3 days; 1000/3 = 333.33
    });

    expect(r.safeToSpendPerDayCents).toBe(333);
  });

  it("reports a negative day rate when spending envelopes are overspent", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [txn("t1", "c1", "2026-09-12", 14_000)],
      targets: DEFAULT_TARGETS,
      today: "2026-09-22",
    });

    expect(r.spendableRemainingCents).toBe(-4_000);
    expect(r.safeToSpendPerDayCents).toBeLessThan(0);
  });

  it("tracks uncategorized spend separately", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [
        txn("t1", "c1", "2026-09-12", 3_000),
        { id: "t2", categoryId: null, occurredOn: "2026-09-13", amountCents: 1_500 },
      ],
      targets: DEFAULT_TARGETS,
      today: "2026-09-13",
    });

    expect(r.uncategorizedCents).toBe(1_500);
    expect(r.totalSpentCents).toBe(4_500);
  });

  it("reports negative unallocated when she allocates more than she was paid", () => {
    const r = summarizePeriod({
      period,
      paychecks: [check("k1", "2026-09-11", 50_000, "base")],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 70_000)],
      transactions: [],
      targets: DEFAULT_TARGETS,
      today: "2026-09-11",
    });

    expect(r.unallocatedCents).toBe(-20_000);
  });

  it("gives a full period of days when today is before it starts", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [],
      transactions: [],
      targets: DEFAULT_TARGETS,
      today: "2026-09-01",
    });

    expect(r.daysRemaining).toBe(14);
  });
});
