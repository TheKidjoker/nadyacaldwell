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
