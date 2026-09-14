import { describe, it, expect } from "vitest";
import { buildMonthGrid } from "./calendar";
import type { DayCell } from "./calendar";
import type { Category, PayPeriod, Paycheck, Transaction } from "./types";

const rent: Category = {
  id: "rent",
  name: "Rent",
  kind: "bill",
  bucket: "needs",
  carryover: true,
  cadence: "monthly",
  recurringAmountCents: 120_000,
  dueAnchor: "2026-09-01",
  color: "#6ba1cd",
  sortOrder: 0,
};

const groceries: Category = {
  id: "groceries",
  name: "Groceries",
  kind: "spending",
  bucket: "needs",
  carryover: false,
  cadence: null,
  recurringAmountCents: null,
  dueAnchor: null,
  color: "#9ac5e7",
  sortOrder: 1,
};

const period: PayPeriod = { id: "p1", startsOn: "2026-09-11", endsOn: "2026-09-24" };

const base = {
  year: 2026,
  month: 9,
  categories: [rent, groceries],
  paychecks: [] as Paycheck[],
  periods: [period],
  transactions: [] as Transaction[],
  today: "2026-09-14",
};

const cellFor = (grid: DayCell[], date: string) => grid.find((c) => c.date === date)!;

describe("buildMonthGrid — shape", () => {
  it("always returns six weeks of cells", () => {
    expect(buildMonthGrid(base)).toHaveLength(42);
    expect(buildMonthGrid({ ...base, year: 2026, month: 2 })).toHaveLength(42);
  });

  it("starts on a Sunday", () => {
    // 2026-09-01 is a Tuesday, so the grid opens on Sunday 2026-08-30.
    expect(buildMonthGrid(base)[0].date).toBe("2026-08-30");
  });

  it("marks which cells belong to the month", () => {
    const grid = buildMonthGrid(base);
    expect(cellFor(grid, "2026-08-30").inMonth).toBe(false);
    expect(cellFor(grid, "2026-09-01").inMonth).toBe(true);
    expect(cellFor(grid, "2026-09-30").inMonth).toBe(true);
    expect(cellFor(grid, "2026-10-01").inMonth).toBe(false);
  });

  it("marks today", () => {
    const grid = buildMonthGrid(base);
    expect(cellFor(grid, "2026-09-14").isToday).toBe(true);
    expect(cellFor(grid, "2026-09-13").isToday).toBe(false);
  });

  it("marks no cell as today when today is in another month", () => {
    expect(buildMonthGrid({ ...base, today: "2027-01-05" }).every((c) => !c.isToday)).toBe(
      true,
    );
  });
});

describe("buildMonthGrid — bills", () => {
  it("places a monthly bill on its due date", () => {
    expect(cellFor(buildMonthGrid(base), "2026-09-01").bills).toEqual([
      { categoryId: "rent", name: "Rent", amountCents: 120_000 },
    ]);
  });

  it("leaves other days without bills", () => {
    expect(cellFor(buildMonthGrid(base), "2026-09-02").bills).toEqual([]);
  });

  it("places every occurrence of a weekly bill", () => {
    const daycare: Category = {
      ...rent,
      id: "daycare",
      name: "Daycare",
      cadence: "weekly",
      recurringAmountCents: 16_000,
      dueAnchor: "2026-09-07",
    };
    const grid = buildMonthGrid({ ...base, categories: [daycare] });

    for (const d of ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]) {
      expect(cellFor(grid, d).bills).toHaveLength(1);
    }
    expect(cellFor(grid, "2026-09-08").bills).toEqual([]);
  });

  it("ignores spending categories", () => {
    const grid = buildMonthGrid({ ...base, categories: [groceries] });
    expect(grid.every((c) => c.bills.length === 0)).toBe(true);
  });

  it("shows bills falling in the leading cells", () => {
    const grid = buildMonthGrid({
      ...base,
      categories: [{ ...rent, dueAnchor: "2026-08-30", cadence: "monthly" }],
    });
    expect(cellFor(grid, "2026-08-30").bills).toHaveLength(1);
  });
});

describe("buildMonthGrid — paydays, periods and spend", () => {
  it("marks a payday", () => {
    const grid = buildMonthGrid({
      ...base,
      paychecks: [
        { id: "k1", receivedOn: "2026-09-11", amountCents: 140_000, kind: "base" },
      ],
    });

    expect(cellFor(grid, "2026-09-11").isPayday).toBe(true);
    expect(cellFor(grid, "2026-09-12").isPayday).toBe(false);
  });

  it("marks period boundaries", () => {
    const grid = buildMonthGrid(base);
    expect(cellFor(grid, "2026-09-11").isPeriodStart).toBe(true);
    expect(cellFor(grid, "2026-09-24").isPeriodEnd).toBe(true);
    expect(cellFor(grid, "2026-09-15").isPeriodStart).toBe(false);
  });

  it("totals the spend on each day", () => {
    const grid = buildMonthGrid({
      ...base,
      transactions: [
        { id: "t1", categoryId: "groceries", occurredOn: "2026-09-12", amountCents: 4_250 },
        { id: "t2", categoryId: "groceries", occurredOn: "2026-09-12", amountCents: 1_100 },
        { id: "t3", categoryId: null, occurredOn: "2026-09-13", amountCents: 900 },
      ],
    });

    expect(cellFor(grid, "2026-09-12").spentCents).toBe(5_350);
    expect(cellFor(grid, "2026-09-13").spentCents).toBe(900);
    expect(cellFor(grid, "2026-09-14").spentCents).toBe(0);
  });

  it("handles a month with nothing in it at all", () => {
    const grid = buildMonthGrid({
      year: 2026,
      month: 11,
      categories: [],
      paychecks: [],
      periods: [],
      transactions: [],
      today: "2026-09-14",
    });

    expect(grid).toHaveLength(42);
    expect(grid.every((c) => c.bills.length === 0 && c.spentCents === 0)).toBe(true);
  });
});
