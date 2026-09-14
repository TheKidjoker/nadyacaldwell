import { describe, it, expect } from "vitest";
import { formatCents, formatShortDate } from "./format";

describe("formatCents", () => {
  it("formats a whole dollar amount", () => {
    expect(formatCents(30_000)).toBe("$300.00");
  });

  it("formats cents", () => {
    expect(formatCents(4_250)).toBe("$42.50");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("puts the minus sign outside the dollar sign", () => {
    expect(formatCents(-3_500)).toBe("-$35.00");
  });

  it("adds thousands separators", () => {
    expect(formatCents(120_000_0)).toBe("$12,000.00");
  });
});

describe("formatShortDate", () => {
  it("shortens an ISO day", () => {
    expect(formatShortDate("2026-09-01")).toBe("Sep 1");
  });

  it("drops the leading zero on the day", () => {
    expect(formatShortDate("2026-10-08")).toBe("Oct 8");
  });

  it("does not shift the day across a timezone", () => {
    // Parsed as a Date in a western zone this would render as Dec 31.
    expect(formatShortDate("2027-01-01")).toBe("Jan 1");
  });

  it("returns anything it cannot read unchanged", () => {
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
  });
});
