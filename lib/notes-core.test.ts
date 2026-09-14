import { describe, it, expect } from "vitest";
import {
  formatEntryDay,
  isMoveDirection,
  isSectionKind,
  moveWithin,
  renumber,
  summarizeSection,
} from "./notes-core";

const IDS = ["a", "b", "c", "d"];

describe("moveWithin", () => {
  it("swaps an item with the one above it", () => {
    expect(moveWithin(IDS, "c", "up")).toEqual(["a", "c", "b", "d"]);
  });

  it("swaps an item with the one below it", () => {
    expect(moveWithin(IDS, "b", "down")).toEqual(["a", "c", "b", "d"]);
  });

  it("leaves the first item alone when asked to move it up", () => {
    expect(moveWithin(IDS, "a", "up")).toEqual(IDS);
  });

  it("leaves the last item alone when asked to move it down", () => {
    expect(moveWithin(IDS, "d", "down")).toEqual(IDS);
  });

  it("ignores an id that is not in the list", () => {
    expect(moveWithin(IDS, "zzz", "up")).toEqual(IDS);
  });

  it("handles a single-item list in both directions", () => {
    expect(moveWithin(["only"], "only", "up")).toEqual(["only"]);
    expect(moveWithin(["only"], "only", "down")).toEqual(["only"]);
  });

  it("never mutates the input, even on a no-op", () => {
    const input = [...IDS];
    moveWithin(input, "a", "up");
    moveWithin(input, "b", "down");
    expect(input).toEqual(IDS);
  });

  it("round-trips: down then up is the original order", () => {
    const moved = moveWithin(IDS, "b", "down");
    expect(moveWithin(moved, "b", "up")).toEqual(IDS);
  });

  it("keeps every id exactly once", () => {
    expect([...moveWithin(IDS, "c", "up")].sort()).toEqual([...IDS].sort());
  });
});

describe("renumber", () => {
  it("assigns 0-based sequential positions", () => {
    expect(renumber(["x", "y", "z"])).toEqual([
      { id: "x", sortOrder: 0 },
      { id: "y", sortOrder: 1 },
      { id: "z", sortOrder: 2 },
    ]);
  });

  it("returns nothing for an empty list", () => {
    expect(renumber([])).toEqual([]);
  });

  it("breaks the ties that default-0 rows arrive with", () => {
    // Every pre-existing row has sort_order 0; after one move they are
    // distinct, which is what makes the next move meaningful.
    const orders = renumber(moveWithin(IDS, "d", "up")).map((r) => r.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe("isMoveDirection / isSectionKind", () => {
  it("accepts only the two directions", () => {
    expect(isMoveDirection("up")).toBe(true);
    expect(isMoveDirection("down")).toBe(true);
    expect(isMoveDirection("UP")).toBe(false);
    expect(isMoveDirection("sideways")).toBe(false);
    expect(isMoveDirection("")).toBe(false);
  });

  it("accepts only the two section kinds", () => {
    expect(isSectionKind("journal")).toBe(true);
    expect(isSectionKind("todo")).toBe(true);
    expect(isSectionKind("diary")).toBe(false);
    expect(isSectionKind("")).toBe(false);
  });
});

describe("formatEntryDay", () => {
  const today = "2026-09-14"; // a Monday

  it("names today and yesterday rather than dating them", () => {
    expect(formatEntryDay("2026-09-14", today)).toBe("Today");
    expect(formatEntryDay("2026-09-13", today)).toBe("Yesterday");
  });

  it("spells out an older day in the same year, without the year", () => {
    expect(formatEntryDay("2026-09-12", today)).toBe("Saturday, September 12");
  });

  it("adds the year only when it differs from today's", () => {
    expect(formatEntryDay("2025-12-31", today)).toBe(
      "Wednesday, December 31 2025",
    );
  });

  it("crosses a month boundary without an off-by-one", () => {
    expect(formatEntryDay("2026-09-01", today)).toBe("Tuesday, September 1");
    expect(formatEntryDay("2026-08-31", today)).toBe("Monday, August 31");
  });

  it("handles the yesterday case across a year boundary", () => {
    expect(formatEntryDay("2025-12-31", "2026-01-01")).toBe("Yesterday");
  });

  it("handles a leap day", () => {
    expect(formatEntryDay("2028-02-29", "2028-03-05")).toBe(
      "Tuesday, February 29",
    );
  });

  it("dates a future entry rather than calling it today", () => {
    expect(formatEntryDay("2026-09-20", today)).toBe("Sunday, September 20");
  });
});

describe("summarizeSection", () => {
  it("says nothing is there yet, in the section's own words", () => {
    expect(summarizeSection("journal", 0, 0)).toBe("Nothing written yet");
    expect(summarizeSection("todo", 0, 0)).toBe("Nothing on it yet");
  });

  it("counts a journal's entries and gets the singular right", () => {
    expect(summarizeSection("journal", 1, 0)).toBe("1 entry");
    expect(summarizeSection("journal", 7, 0)).toBe("7 entries");
  });

  it("counts what is left on a to-do list", () => {
    expect(summarizeSection("todo", 5, 2)).toBe("2 left of 5");
  });

  it("celebrates an emptied list without a number left over", () => {
    expect(summarizeSection("todo", 5, 0)).toBe("All 5 done");
  });
});
