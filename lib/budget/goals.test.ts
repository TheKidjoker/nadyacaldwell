import { describe, it, expect } from "vitest";
import { goalProgress } from "./calc";
import type { Goal, GoalContribution } from "./types";

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "g1",
  name: "Trip",
  targetCents: 200_000,
  targetDate: "2027-03-13",
  ...overrides,
});

const give = (occurredOn: string, amountCents: number): GoalContribution =>
  ({ goalId: "g1", occurredOn, amountCents });

describe("goalProgress", () => {
  it("sums contributions and computes what is left", () => {
    const r = goalProgress({
      goal: goal(),
      contributions: [give("2026-08-01", 50_000), give("2026-09-01", 25_000)],
      today: "2026-09-13",
    });

    expect(r.savedCents).toBe(75_000);
    expect(r.remainingCents).toBe(125_000);
    expect(r.pctComplete).toBeCloseTo(0.375, 3);
    expect(r.isComplete).toBe(false);
  });

  it("caps pctComplete at 1 when the goal is exceeded", () => {
    const r = goalProgress({
      goal: goal(),
      contributions: [give("2026-08-01", 250_000)],
      today: "2026-09-13",
    });

    expect(r.pctComplete).toBe(1);
    expect(r.isComplete).toBe(true);
    expect(r.remainingCents).toBe(0);
    expect(r.requiredPerMonthCents).toBeNull();
  });

  it("computes the monthly amount needed to hit the target date", () => {
    const r = goalProgress({
      goal: goal({ targetCents: 120_000, targetDate: "2026-12-13" }),
      contributions: [],
      today: "2026-09-13", // about 3 months out
    });

    expect(r.monthsRemaining).toBeCloseTo(3, 0);
    expect(r.requiredPerMonthCents).toBeGreaterThan(38_000);
    expect(r.requiredPerMonthCents).toBeLessThan(42_000);
  });

  it("returns nulls for a goal with no target date", () => {
    const r = goalProgress({
      goal: goal({ targetDate: null }),
      contributions: [give("2026-08-01", 50_000)],
      today: "2026-09-13",
    });

    expect(r.monthsRemaining).toBeNull();
    expect(r.requiredPerMonthCents).toBeNull();
    expect(r.onPace).toBeNull();
    expect(r.isOverdue).toBe(false);
  });

  it("flags an overdue, unmet goal", () => {
    const r = goalProgress({
      goal: goal({ targetDate: "2026-08-01" }),
      contributions: [give("2026-07-01", 10_000)],
      today: "2026-09-13",
    });

    expect(r.isOverdue).toBe(true);
    expect(r.onPace).toBe(false);
    expect(r.requiredPerMonthCents).toBeNull();
  });

  it("does not flag a completed goal as overdue", () => {
    const r = goalProgress({
      goal: goal({ targetDate: "2026-08-01" }),
      contributions: [give("2026-07-01", 200_000)],
      today: "2026-09-13",
    });

    expect(r.isComplete).toBe(true);
    expect(r.isOverdue).toBe(false);
  });

  it("counts a future-dated contribution, since she chose to record it", () => {
    const r = goalProgress({
      goal: goal(),
      contributions: [give("2026-12-01", 50_000)],
      today: "2026-09-13",
    });

    expect(r.savedCents).toBe(50_000);
  });

  it("handles a zero-target goal without dividing by zero", () => {
    const r = goalProgress({
      goal: goal({ targetCents: 0 }),
      contributions: [],
      today: "2026-09-13",
    });

    expect(r.pctComplete).toBe(1);
    expect(r.isComplete).toBe(true);
  });
});
