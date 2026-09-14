import { describe, it, expect } from "vitest";
import { noteForDay } from "./notes";

const THREE = ["first", "second", "third"];

describe("noteForDay — nothing written yet", () => {
  it("returns null for an empty list", () => {
    expect(noteForDay("2026-09-14", [])).toBeNull();
  });

  it("returns null when every note is blank", () => {
    expect(noteForDay("2026-09-14", ["", "", ""])).toBeNull();
  });

  it("returns null when every note is only whitespace", () => {
    expect(noteForDay("2026-09-14", ["   ", "\n", "  \t "])).toBeNull();
  });
});

describe("noteForDay — partially written", () => {
  it("always returns the only note there is", () => {
    for (const d of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(noteForDay(d, ["", "only one", ""])).toBe("only one");
    }
  });

  it("rotates over just the non-blank notes", () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 28; i++) {
      const day = `2026-02-${String(i).padStart(2, "0")}`;
      seen.add(noteForDay(day, ["a", "", "b"])!);
    }
    expect([...seen].sort()).toEqual(["a", "b"]);
  });
});

describe("noteForDay — rotation", () => {
  it("returns the same note twice on the same day", () => {
    expect(noteForDay("2026-09-14", THREE)).toBe(noteForDay("2026-09-14", THREE));
  });

  it("changes from one day to the next", () => {
    expect(noteForDay("2026-09-14", THREE)).not.toBe(noteForDay("2026-09-15", THREE));
  });

  it("shows all three across three consecutive days", () => {
    const run = ["2026-03-01", "2026-03-02", "2026-03-03"].map((d) => noteForDay(d, THREE));
    expect([...run].sort()).toEqual(["first", "second", "third"]);
  });

  it("keeps rotating across a year boundary", () => {
    const a = noteForDay("2026-12-31", THREE);
    const b = noteForDay("2027-01-01", THREE);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it("handles a leap year without repeating a day", () => {
    expect(noteForDay("2028-02-29", THREE)).not.toBe(noteForDay("2028-03-01", THREE));
  });

  it("trims surrounding whitespace off what it returns", () => {
    expect(noteForDay("2026-09-14", ["  padded  "])).toBe("padded");
  });
});
