import { describe, it, expect } from "vitest";
import { splitRowsFrom } from "./splitRows";
import type { EnvelopeBalance } from "./types";

const envelope = (over: Partial<EnvelopeBalance>): EnvelopeBalance => ({
  categoryId: "c1",
  kind: "spending",
  bucket: "wants",
  carryover: false,
  allocatedCents: 0,
  carriedInCents: 0,
  spentCents: 0,
  remainingCents: 0,
  pctUsed: 0,
  overspent: false,
  cadence: null,
  recurringAmountCents: null,
  perCheckSetAsideCents: null,
  fullyFunded: null,
  nextDueOn: null,
  ...over,
});

const bill = (id: string, setAside: number): EnvelopeBalance =>
  envelope({
    categoryId: id,
    kind: "bill",
    bucket: "needs",
    carryover: true,
    cadence: "monthly",
    recurringAmountCents: 70_000,
    perCheckSetAsideCents: setAside,
    nextDueOn: "2026-10-01",
    fullyFunded: false,
  });

describe("splitRowsFrom", () => {
  it("separates spending rows from bills and totals the bill shares", () => {
    const out = splitRowsFrom({
      envelopes: [
        bill("rent", 32_308),
        envelope({ categoryId: "gro", allocatedCents: 12_000 }),
        bill("daycare", 17_200),
        envelope({ categoryId: "gas" }),
      ],
      categories: [
        { id: "rent", name: "Rent" },
        { id: "gro", name: "Groceries" },
        { id: "daycare", name: "Daycare" },
        { id: "gas", name: "Gas" },
      ],
    });

    expect(out.rows.map((r) => r.name)).toEqual(["Groceries", "Gas"]);
    expect(out.fixed.map((f) => f.name)).toEqual(["Rent", "Daycare"]);
    expect(out.billsTotalCents).toBe(49_508);
  });

  it("keeps her own order, never re-sorting by amount", () => {
    const out = splitRowsFrom({
      envelopes: [
        envelope({ categoryId: "a", allocatedCents: 100 }),
        envelope({ categoryId: "b", allocatedCents: 90_000 }),
        envelope({ categoryId: "c", allocatedCents: 5_000 }),
      ],
      categories: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
    });

    expect(out.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("reports what each envelope already holds, and nothing it does not", () => {
    const out = splitRowsFrom({
      envelopes: [
        envelope({ categoryId: "gro", allocatedCents: 12_000 }),
        envelope({ categoryId: "gas", allocatedCents: 0 }),
      ],
      categories: [
        { id: "gro", name: "Groceries" },
        { id: "gas", name: "Gas" },
      ],
    });

    // Zero stays zero. Nothing is opened at a suggested figure.
    expect(out.initialCents).toEqual({ gro: 12_000, gas: 0 });
  });

  it("carries the balances the sliders need to state what is left", () => {
    const out = splitRowsFrom({
      envelopes: [
        envelope({ categoryId: "gro", carriedInCents: 2_500, spentCents: 800 }),
      ],
      categories: [{ id: "gro", name: "Groceries" }],
    });

    expect(out.rows[0].carriedInCents).toBe(2_500);
    expect(out.rows[0].spentCents).toBe(800);
  });

  it("drops a bill with no honest per-check share rather than guessing one", () => {
    const halfBill = envelope({
      categoryId: "mystery",
      kind: "bill",
      bucket: "needs",
      cadence: null,
      recurringAmountCents: null,
      perCheckSetAsideCents: null,
    });

    const out = splitRowsFrom({
      envelopes: [halfBill, bill("rent", 32_308)],
      categories: [
        { id: "mystery", name: "Mystery" },
        { id: "rent", name: "Rent" },
      ],
    });

    expect(out.fixed.map((f) => f.id)).toEqual(["rent"]);
    expect(out.billsTotalCents).toBe(32_308);
  });

  it("falls back to a neutral name rather than rendering undefined", () => {
    const out = splitRowsFrom({
      envelopes: [envelope({ categoryId: "orphan" }), bill("ghost", 100)],
      categories: [],
    });

    expect(out.rows[0].name).toBe("Category");
    expect(out.fixed[0].name).toBe("Bill");
  });

  it("returns empty shapes for a period with no categories at all", () => {
    const out = splitRowsFrom({ envelopes: [], categories: [] });
    expect(out).toEqual({
      rows: [],
      fixed: [],
      initialCents: {},
      billsTotalCents: 0,
    });
  });
});
