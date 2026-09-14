import { describe, it, expect } from "vitest";
import { formatCents } from "./format";

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
