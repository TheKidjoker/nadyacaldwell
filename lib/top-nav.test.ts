import { describe, it, expect } from "vitest";
import { TABS, isCurrentTab } from "./top-nav";

describe("isCurrentTab", () => {
  it("matches a tab's own path", () => {
    expect(isCurrentTab("/budget", "/budget")).toBe(true);
    expect(isCurrentTab("/notes", "/notes")).toBe(true);
  });

  it("keeps the parent tab current on a nested route", () => {
    expect(isCurrentTab("/budget/goals", "/budget")).toBe(true);
    expect(isCurrentTab("/notes/8f14e45f", "/notes")).toBe(true);
  });

  it("does not light up a tab whose href is only a string prefix", () => {
    expect(isCurrentTab("/notesomething", "/notes")).toBe(false);
    expect(isCurrentTab("/budgeting", "/budget")).toBe(false);
  });

  it("matches home only exactly, never as everything's ancestor", () => {
    expect(isCurrentTab("/", "/")).toBe(true);
    expect(isCurrentTab("/budget", "/")).toBe(false);
    expect(isCurrentTab("/notes/abc", "/")).toBe(false);
  });

  it("leaves every tab unlit on a path none of them own", () => {
    expect(TABS.filter((t) => isCurrentTab("/signin", t.href))).toEqual([]);
  });

  it("lights exactly one tab on each route the app has", () => {
    for (const path of ["/", "/budget", "/budget/goals", "/notes", "/notes/x"]) {
      expect(TABS.filter((t) => isCurrentTab(path, t.href))).toHaveLength(1);
    }
  });
});
