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
    carryover: false,
    monthlyTargetCents: null,
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
    carryover: true,
    monthlyTargetCents: 120_000,
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

    // 120000 * 12 / 26 = 55384.6 -> 55385. Half would be 60000.
    expect(r.perCheckSetAsideCents).toBe(55_385);
    expect(r.perCheckSetAsideCents).not.toBe(60_000);
  });

  it("accumulates across periods and reports fully funded", () => {
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

  it("is not fully funded before the target is reached", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [alloc("p2", "c2", 55_385)],
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

  it("leaves perCheckSetAside null for spending categories", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBeNull();
    expect(r.fullyFunded).toBeNull();
  });
});
