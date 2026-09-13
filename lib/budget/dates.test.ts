import { describe, it, expect } from "vitest";
import {
  addDays,
  daysInclusive,
  isWithin,
  compareISO,
  monthsBetween,
} from "./dates";

describe("addDays", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-09-13", 4)).toBe("2026-09-17");
  });

  it("rolls over a month boundary", () => {
    expect(addDays("2026-09-28", 5)).toBe("2026-10-03");
  });

  it("rolls over a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("subtracts with a negative count", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("daysInclusive", () => {
  it("counts a single day as one", () => {
    expect(daysInclusive("2026-09-13", "2026-09-13")).toBe(1);
  });

  it("counts a two-week period as fourteen", () => {
    expect(daysInclusive("2026-09-13", "2026-09-26")).toBe(14);
  });

  it("returns zero when the end is before the start", () => {
    expect(daysInclusive("2026-09-13", "2026-09-12")).toBe(0);
  });

  it("spans a month boundary correctly", () => {
    expect(daysInclusive("2026-09-28", "2026-10-02")).toBe(5);
  });
});

describe("isWithin", () => {
  it("includes the start date", () => {
    expect(isWithin("2026-09-13", "2026-09-13", "2026-09-26")).toBe(true);
  });

  it("includes the end date", () => {
    expect(isWithin("2026-09-26", "2026-09-13", "2026-09-26")).toBe(true);
  });

  it("excludes a date before the range", () => {
    expect(isWithin("2026-09-12", "2026-09-13", "2026-09-26")).toBe(false);
  });

  it("excludes a date after the range", () => {
    expect(isWithin("2026-09-27", "2026-09-13", "2026-09-26")).toBe(false);
  });
});

describe("compareISO", () => {
  it("orders dates lexically and chronologically alike", () => {
    expect(compareISO("2026-09-13", "2026-09-14")).toBeLessThan(0);
    expect(compareISO("2026-09-14", "2026-09-13")).toBeGreaterThan(0);
    expect(compareISO("2026-09-13", "2026-09-13")).toBe(0);
  });
});

describe("monthsBetween", () => {
  it("returns one for a calendar month", () => {
    expect(monthsBetween("2026-09-13", "2026-10-13")).toBeCloseTo(1, 1);
  });

  it("returns roughly six for half a year", () => {
    expect(monthsBetween("2026-01-01", "2026-07-01")).toBeCloseTo(6, 0);
  });

  it("returns zero when the dates match", () => {
    expect(monthsBetween("2026-09-13", "2026-09-13")).toBe(0);
  });

  it("returns negative when the target is in the past", () => {
    expect(monthsBetween("2026-09-13", "2026-08-13")).toBeLessThan(0);
  });
});
