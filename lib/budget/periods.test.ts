import { describe, it, expect } from "vitest";
import { nextPeriodBounds, periodBoundsFrom } from "./periods";

describe("periodBoundsFrom", () => {
  it("makes a fourteen-day period inclusive of both ends", () => {
    const r = periodBoundsFrom("2026-09-11");
    expect(r.startsOn).toBe("2026-09-11");
    expect(r.endsOn).toBe("2026-09-24");
  });

  it("spans a month boundary", () => {
    const r = periodBoundsFrom("2026-09-25");
    expect(r.endsOn).toBe("2026-10-08");
  });
});

describe("nextPeriodBounds", () => {
  it("starts the day after the previous period ends", () => {
    const r = nextPeriodBounds("2026-09-11");
    expect(r.startsOn).toBe("2026-09-25");
    expect(r.endsOn).toBe("2026-10-08");
  });

  it("chains without gaps or overlaps", () => {
    const a = periodBoundsFrom("2026-09-11");
    const b = nextPeriodBounds(a.startsOn);
    expect(b.startsOn).toBe("2026-09-25");
    // a ends 09-24, b starts 09-25: adjacent, no gap.
  });
});
