import { describe, it, expect } from "vitest";
import {
  duePresetsFor,
  resolveDuePreset,
  lastDayOfMonth,
  dayOfWeek,
} from "./duePresets";
import type { DuePreset } from "./duePresets";

const first: DuePreset = {
  kind: "dayOfMonth",
  label: "1st",
  description: "",
  day: 1,
};
const fifteenth: DuePreset = {
  kind: "dayOfMonth",
  label: "15th",
  description: "",
  day: 15,
};
const lastDay: DuePreset = {
  kind: "lastDayOfMonth",
  label: "Last day",
  description: "",
};
const monday: DuePreset = {
  kind: "dayOfWeek",
  label: "Mon",
  description: "",
  weekday: 1,
};
const friday: DuePreset = {
  kind: "dayOfWeek",
  label: "Fri",
  description: "",
  weekday: 5,
};

describe("duePresetsFor", () => {
  it("offers weekdays for the cadences that step in days", () => {
    for (const cadence of ["weekly", "biweekly"] as const) {
      const presets = duePresetsFor(cadence);
      expect(presets).toHaveLength(7);
      expect(presets.every((p) => p.kind === "dayOfWeek")).toBe(true);
    }
  });

  it("offers days of the month for the cadences that step in months", () => {
    for (const cadence of [
      "monthly",
      "quarterly",
      "semiannual",
      "annual",
    ] as const) {
      const presets = duePresetsFor(cadence);
      expect(presets.map((p) => p.label)).toEqual(["1st", "15th", "Last day"]);
    }
  });

  it("starts the week on Monday", () => {
    expect(duePresetsFor("weekly")[0].label).toBe("Mon");
    expect(duePresetsFor("weekly")[6].label).toBe("Sun");
  });
});

describe("resolveDuePreset — day of the month", () => {
  it("keeps this month when the day is still ahead", () => {
    expect(resolveDuePreset(fifteenth, "2026-09-02")).toBe("2026-09-15");
  });

  it("gives today when today is the day", () => {
    expect(resolveDuePreset(fifteenth, "2026-09-15")).toBe("2026-09-15");
  });

  it("never resolves into the past: the 1st in late January is February", () => {
    expect(resolveDuePreset(first, "2026-01-28")).toBe("2026-02-01");
    expect(resolveDuePreset(first, "2026-01-31")).toBe("2026-02-01");
  });

  it("rolls the 1st over a year boundary", () => {
    expect(resolveDuePreset(first, "2026-12-15")).toBe("2027-01-01");
  });

  it("rolls the 15th into the next month once it has passed", () => {
    expect(resolveDuePreset(fifteenth, "2026-01-31")).toBe("2026-02-15");
  });

  it("never resolves before today, whatever the day", () => {
    for (const today of ["2026-01-01", "2026-02-14", "2026-02-28", "2026-12-31"]) {
      expect(resolveDuePreset(first, today) >= today).toBe(true);
      expect(resolveDuePreset(fifteenth, today) >= today).toBe(true);
      expect(resolveDuePreset(lastDay, today) >= today).toBe(true);
    }
  });
});

describe("resolveDuePreset — last day of the month", () => {
  it("finds a 31-day month", () => {
    expect(resolveDuePreset(lastDay, "2026-01-05")).toBe("2026-01-31");
  });

  it("finds a 30-day month", () => {
    expect(resolveDuePreset(lastDay, "2026-04-10")).toBe("2026-04-30");
  });

  it("finds a short February", () => {
    expect(resolveDuePreset(lastDay, "2026-02-10")).toBe("2026-02-28");
  });

  it("finds a leap February", () => {
    expect(resolveDuePreset(lastDay, "2028-02-05")).toBe("2028-02-29");
  });

  it("stays on today when today already ends the month", () => {
    expect(resolveDuePreset(lastDay, "2026-02-28")).toBe("2026-02-28");
    expect(resolveDuePreset(lastDay, "2026-12-31")).toBe("2026-12-31");
  });

  it("does not spill into the next year in December", () => {
    expect(resolveDuePreset(lastDay, "2026-12-01")).toBe("2026-12-31");
  });
});

describe("lastDayOfMonth", () => {
  it("covers a whole year of month lengths", () => {
    expect(
      [
        "01",
        "02",
        "03",
        "04",
        "05",
        "06",
        "07",
        "08",
        "09",
        "10",
        "11",
        "12",
      ].map((m) => lastDayOfMonth(`2026-${m}-07`).slice(8)),
    ).toEqual([
      "31",
      "28",
      "31",
      "30",
      "31",
      "30",
      "31",
      "31",
      "30",
      "31",
      "30",
      "31",
    ]);
  });

  it("handles February in a leap year and a century non-leap year", () => {
    expect(lastDayOfMonth("2028-02-01")).toBe("2028-02-29");
    expect(lastDayOfMonth("2100-02-01")).toBe("2100-02-28");
    expect(lastDayOfMonth("2000-02-01")).toBe("2000-02-29");
  });
});

describe("resolveDuePreset — day of the week", () => {
  it("gives today when today is already that weekday", () => {
    // 2026-09-14 is a Monday.
    expect(resolveDuePreset(monday, "2026-09-14")).toBe("2026-09-14");
  });

  it("steps forward to the next one", () => {
    expect(resolveDuePreset(friday, "2026-09-14")).toBe("2026-09-18");
    expect(resolveDuePreset(monday, "2026-09-15")).toBe("2026-09-21");
  });

  it("crosses a month boundary", () => {
    // 2026-09-30 is a Wednesday, so the next Monday is in October.
    expect(resolveDuePreset(monday, "2026-09-30")).toBe("2026-10-05");
  });

  it("is always within the coming week", () => {
    for (const preset of duePresetsFor("weekly")) {
      const resolved = resolveDuePreset(preset, "2026-09-14");
      expect(resolved >= "2026-09-14").toBe(true);
      expect(resolved <= "2026-09-20").toBe(true);
    }
  });
});

describe("dayOfWeek", () => {
  it("numbers Sunday zero", () => {
    expect(dayOfWeek("2026-09-13")).toBe(0);
    expect(dayOfWeek("2026-09-14")).toBe(1);
    expect(dayOfWeek("2026-09-19")).toBe(6);
  });
});
