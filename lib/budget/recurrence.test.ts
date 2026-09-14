import { describe, it, expect } from "vitest";
import { annualCents, perCheckSetAside, PER_YEAR } from "./recurrence";

describe("PER_YEAR", () => {
  it("maps every cadence to its occurrences per year", () => {
    expect(PER_YEAR.weekly).toBe(52);
    expect(PER_YEAR.biweekly).toBe(26);
    expect(PER_YEAR.monthly).toBe(12);
    expect(PER_YEAR.quarterly).toBe(4);
    expect(PER_YEAR.semiannual).toBe(2);
    expect(PER_YEAR.annual).toBe(1);
  });
});

describe("annualCents", () => {
  it("annualises a monthly bill", () => {
    expect(annualCents(120_000, "monthly")).toBe(1_440_000);
  });

  it("annualises a weekly bill", () => {
    expect(annualCents(16_000, "weekly")).toBe(832_000);
  });

  it("annualises a semiannual bill", () => {
    expect(annualCents(85_200, "semiannual")).toBe(170_400);
  });

  it("leaves an annual bill alone", () => {
    expect(annualCents(45_000, "annual")).toBe(45_000);
  });

  it("returns zero for a zero amount", () => {
    expect(annualCents(0, "monthly")).toBe(0);
  });
});

describe("perCheckSetAside", () => {
  it("spreads a monthly bill across twenty-six checks, not two", () => {
    // 120000 * 12 / 26 = 55384.6 -> 55385. Half would be 60000.
    expect(perCheckSetAside(120_000, "monthly")).toBe(55_385);
    expect(perCheckSetAside(120_000, "monthly")).not.toBe(60_000);
  });

  it("spreads a weekly bill across twenty-six checks", () => {
    // 16000 * 52 / 26 = exactly 32000, because biweekly is two weeks.
    expect(perCheckSetAside(16_000, "weekly")).toBe(32_000);
  });

  it("passes a biweekly bill through unchanged", () => {
    expect(perCheckSetAside(20_000, "biweekly")).toBe(20_000);
  });

  it("spreads a semiannual premium", () => {
    // 85200 * 2 / 26 = 6553.8 -> 6554
    expect(perCheckSetAside(85_200, "semiannual")).toBe(6_554);
  });

  it("rounds rather than truncating", () => {
    expect(perCheckSetAside(100, "monthly")).toBe(46);
    expect(perCheckSetAside(200, "monthly")).toBe(92);
    expect(perCheckSetAside(150, "monthly")).toBe(69);
  });

  it("returns zero for a zero amount rather than NaN", () => {
    expect(perCheckSetAside(0, "annual")).toBe(0);
  });

  it("never returns a fractional cent", () => {
    for (const amount of [1, 7, 99, 1_234, 85_200]) {
      expect(Number.isInteger(perCheckSetAside(amount, "semiannual"))).toBe(true);
    }
  });
});

import { nextOccurrence, occurrencesBetween } from "./recurrence";

describe("nextOccurrence — weekly and biweekly", () => {
  it("returns the anchor itself when it is already on or after the date", () => {
    expect(nextOccurrence("2026-09-14", "weekly", "2026-09-14")).toBe("2026-09-14");
  });

  it("steps forward a week at a time", () => {
    expect(nextOccurrence("2026-09-07", "weekly", "2026-09-14")).toBe("2026-09-14");
    expect(nextOccurrence("2026-09-07", "weekly", "2026-09-15")).toBe("2026-09-21");
  });

  it("steps forward a fortnight at a time", () => {
    expect(nextOccurrence("2026-09-07", "biweekly", "2026-09-15")).toBe("2026-09-21");
  });

  it("returns the anchor when the target is before it", () => {
    // A bill does not exist before its first occurrence.
    expect(nextOccurrence("2026-09-14", "weekly", "2026-08-01")).toBe("2026-09-14");
  });
});

describe("nextOccurrence — monthly and longer", () => {
  it("keeps the day of month", () => {
    expect(nextOccurrence("2026-09-01", "monthly", "2026-09-02")).toBe("2026-10-01");
  });

  it("clamps to the last day of a short month", () => {
    expect(nextOccurrence("2027-01-31", "monthly", "2027-02-01")).toBe("2027-02-28");
  });

  it("clamps to 29 February in a leap year", () => {
    expect(nextOccurrence("2028-01-31", "monthly", "2028-02-01")).toBe("2028-02-29");
  });

  it("returns to the anchor day after a clamped month", () => {
    // Clamping February must not permanently move the bill to the 28th.
    expect(nextOccurrence("2027-01-31", "monthly", "2027-03-01")).toBe("2027-03-31");
  });

  it("steps a quarter at a time", () => {
    expect(nextOccurrence("2026-01-15", "quarterly", "2026-02-01")).toBe("2026-04-15");
  });

  it("steps six months at a time", () => {
    expect(nextOccurrence("2026-03-10", "semiannual", "2026-04-01")).toBe("2026-09-10");
  });

  it("steps a year at a time", () => {
    expect(nextOccurrence("2026-06-30", "annual", "2026-07-01")).toBe("2027-06-30");
  });

  it("crosses a year boundary", () => {
    expect(nextOccurrence("2026-12-05", "monthly", "2026-12-06")).toBe("2027-01-05");
  });
});

describe("occurrencesBetween", () => {
  it("lists every weekly occurrence in a window", () => {
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-09-01", "2026-09-30")).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("includes both endpoints", () => {
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-09-07", "2026-09-14")).toEqual([
      "2026-09-07",
      "2026-09-14",
    ]);
  });

  it("returns nothing before the anchor", () => {
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-08-01", "2026-08-31")).toEqual([]);
  });

  it("returns nothing for a window with no occurrence", () => {
    expect(occurrencesBetween("2026-01-15", "annual", "2026-03-01", "2026-03-31")).toEqual([]);
  });

  it("lists one monthly occurrence for a single month", () => {
    expect(occurrencesBetween("2026-01-03", "monthly", "2026-09-01", "2026-09-30")).toEqual([
      "2026-09-03",
    ]);
  });

  it("handles a month-end anchor across a short month", () => {
    expect(occurrencesBetween("2027-01-31", "monthly", "2027-02-01", "2027-04-30")).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });

  it("returns an empty array when the window is inverted", () => {
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-09-30", "2026-09-01")).toEqual([]);
  });
});
