# Nadya's Budget Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, pay-period budget tool for Nadya at `/budget` — envelopes that track spending between paychecks, bill set-asides, and savings goals — plus simplify the public landing page.

**Architecture:** One Next.js 16 App Router application. All budget arithmetic lives in `lib/budget/`, as pure functions with no database or React imports, written test-first. Persistence is Drizzle against Neon Postgres. Mutations go through Server Actions, each of which verifies the session through a Data Access Layer before touching data. `proxy.ts` does a cheap optimistic redirect; it is never the only gate.

**Tech Stack:** Next.js 16.3.4, React 19.2.8, TypeScript 5, Drizzle ORM 0.45.2, Neon serverless Postgres, Better Auth 1.7.4 (Google provider), Zod 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-13-nadya-budget-design.md`

## Global Constraints

- **All money is integer cents.** Never a float, never a `number` holding dollars. Column type `integer`. Any function taking or returning money uses a name ending in `Cents`.
- **All calendar dates are `'YYYY-MM-DD'` strings**, never JS `Date` objects, in the database (`date` columns) and throughout `lib/budget/`. This sidesteps timezone drift entirely.
- **`lib/budget/calc.ts` and `lib/budget/dates.ts` import only their own siblings** (`./dates`, `./types`) and nothing else. No `drizzle`, no `react`, no `next`, no `server-only`, no `Date.now()` or `new Date()`. `today` is always a parameter. This is what makes them testable and is not negotiable.
- **Every Server Action and every query function calls `verifySession()` first** and scopes its work to the returned `userId`. Never accept a `userId` from a client argument.
- **`middleware.ts` does not exist in Next.js 16.** The file is `proxy.ts` and the export is `proxy`.
- **Mobile-first.** The quick-add expense form is used standing at a register. Design at 375px width first, then widen.
- Existing baby-blue CSS custom properties in `app/globals.css` are the palette. Do not introduce new base colors; derive from `--sky-*`, `--sea-*`, `--ink*`, `--pearl`.
- Per-check set-aside for a monthly bill is `round(monthlyTargetCents * 12 / 26)`. **Not** half. Twelve bills a year over twenty-six biweekly checks.

---

### Task 1: Strip Three.js, add Vitest

Removes ~600KB of scene code the new design does not use, and establishes the test runner everything after this depends on.

**Files:**
- Delete: `components/scene/` (entire directory), `lib/scene/` (entire directory)
- Modify: `package.json`, `app/page.tsx`
- Create: `vitest.config.ts`, `lib/budget/dates.test.ts` (placeholder proving the runner works)

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` command; `app/page.tsx` renders without WebGL

- [ ] **Step 1: Remove the scene directories and the SceneBackdrop import**

```bash
rm -rf components/scene lib/scene
```

Rewrite `app/page.tsx` to:

```tsx
import styles from "./scene.module.css";
import { Corners } from "@/components/Corners";
import { Hero } from "@/components/Hero";

export default function Page() {
  return (
    <div className={styles.stage}>
      <Corners />
      <Hero />
    </div>
  );
}
```

- [ ] **Step 2: Remove the Three.js dependencies**

```bash
npm uninstall three @react-three/fiber @react-three/drei @react-three/postprocessing @types/three
```

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds. If it fails on a missing `SceneBackdrop` or `scene-poster.jpg` reference, grep for the symbol and remove that reference too:

```bash
grep -rn "SceneBackdrop\|scene-poster\|@react-three\|from \"three\"" app components lib
```

Expected after cleanup: no matches.

- [ ] **Step 4: Install Vitest**

```bash
npm install -D vitest@^5.0.0
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 6: Add the test script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Write a placeholder test proving the runner works**

Create `lib/budget/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test runner", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Strip the Three.js scene and add Vitest

The new design does not use the coastal scene, and it was roughly 600KB
of JS on a page that shows four lines of text. Recoverable from b6489f4."
```

---

### Task 2: Date helpers

Every later calculation needs to know how many days are left in a pay period and whether a transaction falls inside one. Doing this with JS `Date` objects invites timezone bugs where a transaction logged at 11pm lands in the wrong period, so these operate on `'YYYY-MM-DD'` strings using UTC internally.

**Files:**
- Create: `lib/budget/dates.ts`
- Test: `lib/budget/dates.test.ts` (replace the placeholder from Task 1)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ISODate = string`
  - `addDays(date: ISODate, n: number): ISODate`
  - `daysInclusive(from: ISODate, to: ISODate): number` — 1 when `from === to`, 0 when `to < from`
  - `isWithin(date: ISODate, start: ISODate, end: ISODate): boolean` — inclusive both ends
  - `compareISO(a: ISODate, b: ISODate): number` — negative/zero/positive
  - `monthsBetween(from: ISODate, to: ISODate): number` — fractional, for goal pacing

- [ ] **Step 1: Write the failing tests**

Replace `lib/budget/dates.test.ts` entirely:

```ts
import { describe, it, expect } from "vitest";
import {
  addDays,
  daysInclusive,
  isWithin,
  compareISO,
  monthsBetween,
} from "./dates";

describe("addDays", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-09-13", 4)).toBe("2026-09-17");
  });

  it("rolls over a month boundary", () => {
    expect(addDays("2026-09-28", 5)).toBe("2026-10-03");
  });

  it("rolls over a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("subtracts with a negative count", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("daysInclusive", () => {
  it("counts a single day as one", () => {
    expect(daysInclusive("2026-09-13", "2026-09-13")).toBe(1);
  });

  it("counts a two-week period as fourteen", () => {
    expect(daysInclusive("2026-09-13", "2026-09-26")).toBe(14);
  });

  it("returns zero when the end is before the start", () => {
    expect(daysInclusive("2026-09-13", "2026-09-12")).toBe(0);
  });

  it("spans a month boundary correctly", () => {
    expect(daysInclusive("2026-09-28", "2026-10-02")).toBe(5);
  });
});

describe("isWithin", () => {
  it("includes the start date", () => {
    expect(isWithin("2026-09-13", "2026-09-13", "2026-09-26")).toBe(true);
  });

  it("includes the end date", () => {
    expect(isWithin("2026-09-26", "2026-09-13", "2026-09-26")).toBe(true);
  });

  it("excludes a date before the range", () => {
    expect(isWithin("2026-09-12", "2026-09-13", "2026-09-26")).toBe(false);
  });

  it("excludes a date after the range", () => {
    expect(isWithin("2026-09-27", "2026-09-13", "2026-09-26")).toBe(false);
  });
});

describe("compareISO", () => {
  it("orders dates lexically and chronologically alike", () => {
    expect(compareISO("2026-09-13", "2026-09-14")).toBeLessThan(0);
    expect(compareISO("2026-09-14", "2026-09-13")).toBeGreaterThan(0);
    expect(compareISO("2026-09-13", "2026-09-13")).toBe(0);
  });
});

describe("monthsBetween", () => {
  it("returns one for a calendar month", () => {
    expect(monthsBetween("2026-09-13", "2026-10-13")).toBeCloseTo(1, 1);
  });

  it("returns roughly six for half a year", () => {
    expect(monthsBetween("2026-01-01", "2026-07-01")).toBeCloseTo(6, 0);
  });

  it("returns zero when the dates match", () => {
    expect(monthsBetween("2026-09-13", "2026-09-13")).toBe(0);
  });

  it("returns negative when the target is in the past", () => {
    expect(monthsBetween("2026-09-13", "2026-08-13")).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./dates"`.

- [ ] **Step 3: Implement `lib/budget/dates.ts`**

```ts
/**
 * Calendar-date helpers operating on 'YYYY-MM-DD' strings.
 *
 * Everything goes through Date.UTC so a user in any timezone gets the same
 * answer — a transaction logged at 11pm must not land in the wrong pay period.
 */

export type ISODate = string;

const MS_PER_DAY = 86_400_000;

function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTC(toUTC(date) + n * MS_PER_DAY);
}

export function daysInclusive(from: ISODate, to: ISODate): number {
  const diff = Math.round((toUTC(to) - toUTC(from)) / MS_PER_DAY);
  return diff < 0 ? 0 : diff + 1;
}

export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  const t = toUTC(date);
  return t >= toUTC(start) && t <= toUTC(end);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return toUTC(a) - toUTC(b);
}

/** Fractional months, using the average Gregorian month. Good enough for pacing. */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const days = (toUTC(to) - toUTC(from)) / MS_PER_DAY;
  return days / 30.436875;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all date tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/budget/dates.ts lib/budget/dates.test.ts
git commit -m "Add calendar-date helpers on ISO strings

Dates go through Date.UTC rather than local Date objects so an expense
logged at 11pm cannot land in the wrong pay period."
```

---

### Task 3: Domain types

A single file of shared shapes so every later task uses the same property names. No logic, no tests — it is types only.

**Files:**
- Create: `lib/budget/types.ts`

**Interfaces:**
- Consumes: `ISODate` from `lib/budget/dates.ts`
- Produces: `CategoryKind`, `PaycheckKind`, `Category`, `PayPeriod`, `Paycheck`, `Allocation`, `Transaction`, `Goal`, `GoalContribution`, `EnvelopeBalance`, `PeriodSummary`, `GoalProgress`

- [ ] **Step 1: Create `lib/budget/types.ts`**

```ts
import type { ISODate } from "./dates";

export type CategoryKind = "spending" | "bill";
export type PaycheckKind = "base" | "commission";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Does leftover money survive into the next period? Always true for bills. */
  carryover: boolean;
  /** Bill categories only; null for spending. */
  monthlyTargetCents: number | null;
  color: string;
  sortOrder: number;
}

export interface PayPeriod {
  id: string;
  startsOn: ISODate;
  endsOn: ISODate;
}

export interface Paycheck {
  id: string;
  receivedOn: ISODate;
  amountCents: number;
  kind: PaycheckKind;
}

export interface Allocation {
  payPeriodId: string;
  categoryId: string;
  amountCents: number;
}

export interface Transaction {
  id: string;
  categoryId: string | null;
  occurredOn: ISODate;
  amountCents: number;
}

export interface Goal {
  id: string;
  name: string;
  targetCents: number;
  targetDate: ISODate | null;
}

export interface GoalContribution {
  goalId: string;
  occurredOn: ISODate;
  amountCents: number;
}

export interface EnvelopeBalance {
  categoryId: string;
  kind: CategoryKind;
  carryover: boolean;
  /** This period's allocation only. */
  allocatedCents: number;
  /** Balance brought forward from prior periods. Always 0 when !carryover. */
  carriedInCents: number;
  /** Spend inside this period only. */
  spentCents: number;
  /** carriedIn + allocated - spent */
  remainingCents: number;
  /** 0 when nothing is available, so this never divides by zero. */
  pctUsed: number;
  overspent: boolean;
  monthlyTargetCents: number | null;
  /** Bill categories only: round(monthlyTarget * 12 / 26). */
  perCheckSetAsideCents: number | null;
  /** Bill categories only. */
  fullyFunded: boolean | null;
}

export interface PeriodSummary {
  incomeCents: number;
  baseCents: number;
  commissionCents: number;
  envelopes: EnvelopeBalance[];
  totalAllocatedCents: number;
  totalSpentCents: number;
  /** income - allocated. Negative means she allocated more than she was paid. */
  unallocatedCents: number;
  uncategorizedCents: number;
  /** Spending envelopes only — bill set-asides are not hers to spend. */
  spendableRemainingCents: number;
  /** today through endsOn, inclusive. 0 once the period has passed. */
  daysRemaining: number;
  /** null when daysRemaining is 0, rather than dividing by zero. */
  safeToSpendPerDayCents: number | null;
}

export interface GoalProgress {
  goalId: string;
  savedCents: number;
  remainingCents: number;
  /** 0..1, capped at 1. */
  pctComplete: number;
  isComplete: boolean;
  /** null when the goal has no target date. */
  monthsRemaining: number | null;
  /** null when there is no target date, or the goal is already complete. */
  requiredPerMonthCents: number | null;
  /** null when it cannot be determined. */
  onPace: boolean | null;
  isOverdue: boolean;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/budget/types.ts
git commit -m "Add shared budget domain types"
```

---

### Task 4: Envelope balance

The heart of the model. One formula with a flag, rather than separate code paths for spending and bill envelopes.

**Files:**
- Create: `lib/budget/calc.ts`
- Test: `lib/budget/calc.test.ts`

**Interfaces:**
- Consumes: `lib/budget/types.ts`, `lib/budget/dates.ts`
- Produces: `envelopeBalance(input: { category, period, allocations, transactions }): EnvelopeBalance`
  - `allocations` is every allocation for this category across all periods
  - `transactions` is every transaction in this category across all time

- [ ] **Step 1: Write the failing tests**

Create `lib/budget/calc.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { envelopeBalance } from "./calc";
import type { Category, PayPeriod, Allocation, Transaction } from "./types";

const period: PayPeriod = {
  id: "p2",
  startsOn: "2026-09-11",
  endsOn: "2026-09-24",
};

const priorPeriod = "p1";

function spending(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Groceries",
    kind: "spending",
    carryover: false,
    monthlyTargetCents: null,
    color: "#9ac5e7",
    sortOrder: 0,
    ...overrides,
  };
}

function bill(overrides: Partial<Category> = {}): Category {
  return {
    id: "c2",
    name: "Rent",
    kind: "bill",
    carryover: true,
    monthlyTargetCents: 120_000,
    color: "#6ba1cd",
    sortOrder: 1,
    ...overrides,
  };
}

const alloc = (payPeriodId: string, categoryId: string, amountCents: number): Allocation =>
  ({ payPeriodId, categoryId, amountCents });

const txn = (id: string, categoryId: string, occurredOn: string, amountCents: number): Transaction =>
  ({ id, categoryId, occurredOn, amountCents });

describe("envelopeBalance — non-carryover spending", () => {
  it("subtracts this period's spend from this period's allocation", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc("p2", "c1", 30_000)],
      transactions: [txn("t1", "c1", "2026-09-15", 4_250)],
    });

    expect(r.allocatedCents).toBe(30_000);
    expect(r.spentCents).toBe(4_250);
    expect(r.carriedInCents).toBe(0);
    expect(r.remainingCents).toBe(25_750);
    expect(r.overspent).toBe(false);
  });

  it("ignores allocations and spend from other periods", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc(priorPeriod, "c1", 99_999), alloc("p2", "c1", 30_000)],
      transactions: [
        txn("t0", "c1", "2026-09-01", 50_000), // before this period
        txn("t1", "c1", "2026-09-15", 4_250),
        txn("t2", "c1", "2026-10-01", 7_000), // after this period
      ],
    });

    expect(r.allocatedCents).toBe(30_000);
    expect(r.spentCents).toBe(4_250);
    expect(r.remainingCents).toBe(25_750);
  });

  it("reports overspent with a negative remaining", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [txn("t1", "c1", "2026-09-15", 13_500)],
    });

    expect(r.remainingCents).toBe(-3_500);
    expect(r.overspent).toBe(true);
    expect(r.pctUsed).toBeGreaterThan(1);
  });

  it("returns pctUsed of 0 rather than dividing by zero", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.allocatedCents).toBe(0);
    expect(r.pctUsed).toBe(0);
    expect(r.remainingCents).toBe(0);
    expect(r.overspent).toBe(false);
  });

  it("counts spend on the first and last day of the period", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [
        txn("t1", "c1", "2026-09-11", 1_000),
        txn("t2", "c1", "2026-09-24", 2_000),
      ],
    });

    expect(r.spentCents).toBe(3_000);
  });
});

describe("envelopeBalance — carryover", () => {
  it("brings forward an unspent balance from prior periods", () => {
    const r = envelopeBalance({
      category: spending({ carryover: true }),
      period,
      allocations: [alloc(priorPeriod, "c1", 20_000), alloc("p2", "c1", 20_000)],
      transactions: [txn("t0", "c1", "2026-09-02", 5_000)],
    });

    expect(r.carriedInCents).toBe(15_000);
    expect(r.allocatedCents).toBe(20_000);
    expect(r.spentCents).toBe(0);
    expect(r.remainingCents).toBe(35_000);
  });

  it("carries a negative balance forward, so past overspend follows her", () => {
    const r = envelopeBalance({
      category: spending({ carryover: true }),
      period,
      allocations: [alloc(priorPeriod, "c1", 10_000), alloc("p2", "c1", 10_000)],
      transactions: [txn("t0", "c1", "2026-09-02", 18_000)],
    });

    expect(r.carriedInCents).toBe(-8_000);
    expect(r.remainingCents).toBe(2_000);
  });
});

describe("envelopeBalance — bill set-asides", () => {
  it("computes the per-check set-aside as monthly * 12 / 26, not half", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [],
      transactions: [],
    });

    // 120000 * 12 / 26 = 55384.6 -> 55385. Half would be 60000.
    expect(r.perCheckSetAsideCents).toBe(55_385);
    expect(r.perCheckSetAsideCents).not.toBe(60_000);
  });

  it("accumulates across periods and reports fully funded", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [
        alloc("p0", "c2", 55_385),
        alloc(priorPeriod, "c2", 55_385),
        alloc("p2", "c2", 55_385),
      ],
      transactions: [],
    });

    expect(r.remainingCents).toBe(166_155);
    expect(r.fullyFunded).toBe(true);
  });

  it("is not fully funded before the target is reached", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [alloc("p2", "c2", 55_385)],
      transactions: [],
    });

    expect(r.fullyFunded).toBe(false);
  });

  it("goes negative when the bill is paid before it is funded", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [alloc("p2", "c2", 55_385)],
      transactions: [txn("t1", "c2", "2026-09-15", 120_000)],
    });

    expect(r.remainingCents).toBe(-64_615);
    expect(r.overspent).toBe(true);
  });

  it("leaves perCheckSetAside null for spending categories", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBeNull();
    expect(r.fullyFunded).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./calc"`.

- [ ] **Step 3: Implement `envelopeBalance` in `lib/budget/calc.ts`**

```ts
import { compareISO, isWithin } from "./dates";
import type {
  Allocation,
  Category,
  EnvelopeBalance,
  PayPeriod,
  Transaction,
} from "./types";

/** Twelve monthly bills spread across twenty-six biweekly checks. */
const CHECKS_PER_YEAR = 26;
const MONTHS_PER_YEAR = 12;

export function perCheckSetAside(monthlyTargetCents: number): number {
  return Math.round((monthlyTargetCents * MONTHS_PER_YEAR) / CHECKS_PER_YEAR);
}

export function envelopeBalance(input: {
  category: Category;
  period: PayPeriod;
  /** Every allocation for this category, across all periods. */
  allocations: Allocation[];
  /** Every transaction in this category, across all time. */
  transactions: Transaction[];
}): EnvelopeBalance {
  const { category, period, allocations, transactions } = input;

  const mine = allocations.filter((a) => a.categoryId === category.id);
  const myTxns = transactions.filter((t) => t.categoryId === category.id);

  const allocatedCents = sum(
    mine.filter((a) => a.payPeriodId === period.id).map((a) => a.amountCents),
  );

  const spentCents = sum(
    myTxns
      .filter((t) => isWithin(t.occurredOn, period.startsOn, period.endsOn))
      .map((t) => t.amountCents),
  );

  // Carryover envelopes bring forward everything allocated and spent before
  // this period began. Non-carryover envelopes start each period at zero.
  let carriedInCents = 0;
  if (category.carryover) {
    const priorAllocated = sum(
      mine.filter((a) => a.payPeriodId !== period.id).map((a) => a.amountCents),
    );
    const priorSpent = sum(
      myTxns
        .filter((t) => compareISO(t.occurredOn, period.startsOn) < 0)
        .map((t) => t.amountCents),
    );
    carriedInCents = priorAllocated - priorSpent;
  }

  const availableCents = carriedInCents + allocatedCents;
  const remainingCents = availableCents - spentCents;

  const isBill = category.kind === "bill";
  const target = category.monthlyTargetCents;

  return {
    categoryId: category.id,
    kind: category.kind,
    carryover: category.carryover,
    allocatedCents,
    carriedInCents,
    spentCents,
    remainingCents,
    pctUsed: availableCents > 0 ? spentCents / availableCents : 0,
    overspent: remainingCents < 0,
    monthlyTargetCents: target,
    perCheckSetAsideCents: isBill && target !== null ? perCheckSetAside(target) : null,
    fullyFunded: isBill && target !== null ? remainingCents >= target : null,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
```

> **Note on carryover allocations:** prior allocations are identified by `payPeriodId !== period.id` rather than by date, because `Allocation` carries no date of its own. Callers must pass only allocations from this period and earlier — never future periods. Task 8's query enforces this.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all `envelopeBalance` tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/budget/calc.ts lib/budget/calc.test.ts
git commit -m "Add envelope balance calculation

One formula with a carryover flag rather than parallel code paths for
spending and bill envelopes. Per-check set-aside is monthly * 12 / 26,
not half -- halving over-saves by about 8%."
```

---

### Task 5: Period summary and safe-to-spend-per-day

The headline number. Bill set-asides must be excluded from it — money reserved for rent is not spendable, and counting it would make the tool lie in the most damaging possible direction.

**Files:**
- Modify: `lib/budget/calc.ts`
- Test: `lib/budget/calc.test.ts` (append)

**Interfaces:**
- Consumes: `envelopeBalance` from Task 4
- Produces: `summarizePeriod(input: { period, paychecks, categories, allocations, transactions, today }): PeriodSummary`

- [ ] **Step 1: Write the failing tests**

Append to `lib/budget/calc.test.ts`:

```ts
import { summarizePeriod } from "./calc";
import type { Paycheck } from "./types";

const check = (id: string, receivedOn: string, amountCents: number, kind: Paycheck["kind"]): Paycheck =>
  ({ id, receivedOn, amountCents, kind });

describe("summarizePeriod", () => {
  const categories = [spending(), bill()];

  it("sums base and commission checks landing inside the period", () => {
    const r = summarizePeriod({
      period,
      paychecks: [
        check("k1", "2026-09-11", 140_000, "base"),
        check("k2", "2026-09-18", 62_000, "commission"),
        check("k0", "2026-08-28", 140_000, "base"), // prior period
      ],
      categories,
      allocations: [],
      transactions: [],
      today: "2026-09-18",
    });

    expect(r.baseCents).toBe(140_000);
    expect(r.commissionCents).toBe(62_000);
    expect(r.incomeCents).toBe(202_000);
  });

  it("excludes bill set-asides from spendable remaining", () => {
    const r = summarizePeriod({
      period,
      paychecks: [check("k1", "2026-09-11", 140_000, "base")],
      categories,
      allocations: [alloc("p2", "c1", 30_000), alloc("p2", "c2", 55_385)],
      transactions: [],
      today: "2026-09-11",
    });

    // Only the groceries envelope is spendable. Rent's 55,385 is not.
    expect(r.spendableRemainingCents).toBe(30_000);
    expect(r.totalAllocatedCents).toBe(85_385);
  });

  it("computes safe-to-spend-per-day over the days remaining", () => {
    const r = summarizePeriod({
      period, // 2026-09-11 .. 2026-09-24
      paychecks: [check("k1", "2026-09-11", 140_000, "base")],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 28_000)],
      transactions: [txn("t1", "c1", "2026-09-12", 14_000)],
      today: "2026-09-18", // 18th through 24th inclusive = 7 days
    });

    expect(r.daysRemaining).toBe(7);
    expect(r.spendableRemainingCents).toBe(14_000);
    expect(r.safeToSpendPerDayCents).toBe(2_000);
  });

  it("returns null for safe-to-spend once the period has passed", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 28_000)],
      transactions: [],
      today: "2026-09-25",
    });

    expect(r.daysRemaining).toBe(0);
    expect(r.safeToSpendPerDayCents).toBeNull();
  });

  it("rounds the day rate down, never encouraging an overspend", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 1_000)],
      transactions: [],
      today: "2026-09-22", // 22,23,24 = 3 days; 1000/3 = 333.33
    });

    expect(r.safeToSpendPerDayCents).toBe(333);
  });

  it("reports a negative day rate when spending envelopes are overspent", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [txn("t1", "c1", "2026-09-12", 14_000)],
      today: "2026-09-22",
    });

    expect(r.spendableRemainingCents).toBe(-4_000);
    expect(r.safeToSpendPerDayCents).toBeLessThan(0);
  });

  it("tracks uncategorized spend separately", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 10_000)],
      transactions: [
        txn("t1", "c1", "2026-09-12", 3_000),
        { id: "t2", categoryId: null, occurredOn: "2026-09-13", amountCents: 1_500 },
      ],
      today: "2026-09-13",
    });

    expect(r.uncategorizedCents).toBe(1_500);
    expect(r.totalSpentCents).toBe(4_500);
  });

  it("reports negative unallocated when she allocates more than she was paid", () => {
    const r = summarizePeriod({
      period,
      paychecks: [check("k1", "2026-09-11", 50_000, "base")],
      categories: [spending()],
      allocations: [alloc("p2", "c1", 70_000)],
      transactions: [],
      today: "2026-09-11",
    });

    expect(r.unallocatedCents).toBe(-20_000);
  });

  it("gives a full period of days when today is before it starts", () => {
    const r = summarizePeriod({
      period,
      paychecks: [],
      categories: [spending()],
      allocations: [],
      transactions: [],
      today: "2026-09-01",
    });

    expect(r.daysRemaining).toBe(14);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `summarizePeriod is not a function`.

- [ ] **Step 3: Implement `summarizePeriod` in `lib/budget/calc.ts`**

**Replace** the two existing import lines at the top of the file — do not add duplicates of `compareISO` or `isWithin`:

```ts
import { compareISO, daysInclusive, isWithin } from "./dates";
import type { ISODate } from "./dates";
import type {
  Allocation,
  Category,
  EnvelopeBalance,
  Paycheck,
  PayPeriod,
  PeriodSummary,
  Transaction,
} from "./types";
```

Then append:

```ts
export function summarizePeriod(input: {
  period: PayPeriod;
  paychecks: Paycheck[];
  categories: Category[];
  allocations: Allocation[];
  transactions: Transaction[];
  today: ISODate;
}): PeriodSummary {
  const { period, paychecks, categories, allocations, transactions, today } = input;

  const inPeriod = paychecks.filter((p) =>
    isWithin(p.receivedOn, period.startsOn, period.endsOn),
  );
  const baseCents = sum(
    inPeriod.filter((p) => p.kind === "base").map((p) => p.amountCents),
  );
  const commissionCents = sum(
    inPeriod.filter((p) => p.kind === "commission").map((p) => p.amountCents),
  );

  const envelopes = categories.map((category) =>
    envelopeBalance({ category, period, allocations, transactions }),
  );

  const periodTxns = transactions.filter((t) =>
    isWithin(t.occurredOn, period.startsOn, period.endsOn),
  );

  // Bill set-asides are reserved, not spendable. Including them here would
  // inflate the headline number and is the one error that actively misleads.
  const spendableRemainingCents = sum(
    envelopes.filter((e) => e.kind === "spending").map((e) => e.remainingCents),
  );

  const daysRemaining =
    compareISO(today, period.startsOn) < 0
      ? daysInclusive(period.startsOn, period.endsOn)
      : daysInclusive(today, period.endsOn);

  return {
    incomeCents: baseCents + commissionCents,
    baseCents,
    commissionCents,
    envelopes,
    totalAllocatedCents: sum(
      allocations.filter((a) => a.payPeriodId === period.id).map((a) => a.amountCents),
    ),
    totalSpentCents: sum(periodTxns.map((t) => t.amountCents)),
    unallocatedCents:
      baseCents +
      commissionCents -
      sum(
        allocations.filter((a) => a.payPeriodId === period.id).map((a) => a.amountCents),
      ),
    uncategorizedCents: sum(
      periodTxns.filter((t) => t.categoryId === null).map((t) => t.amountCents),
    ),
    spendableRemainingCents,
    daysRemaining,
    // Math.floor rather than round, so the number never encourages an overspend.
    safeToSpendPerDayCents:
      daysRemaining > 0 ? Math.floor(spendableRemainingCents / daysRemaining) : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all summary tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/budget/calc.ts lib/budget/calc.test.ts
git commit -m "Add period summary and safe-to-spend-per-day

Bill set-asides are excluded from spendable remaining. Counting money
reserved for rent as spendable is the one error that actively misleads,
so it gets its own test. The day rate floors rather than rounds."
```

---

### Task 6: Goal progress

**Files:**
- Modify: `lib/budget/calc.ts`
- Test: `lib/budget/goals.test.ts`

**Interfaces:**
- Consumes: `lib/budget/dates.ts`, `lib/budget/types.ts`
- Produces: `goalProgress(input: { goal, contributions, today }): GoalProgress`

- [ ] **Step 1: Write the failing tests**

Create `lib/budget/goals.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `goalProgress is not a function`.

- [ ] **Step 3: Implement `goalProgress` in `lib/budget/calc.ts`**

Merge `monthsBetween` into the existing `./dates` import line, and `Goal`, `GoalContribution`, `GoalProgress` into the existing `./types` type import, rather than adding second import statements for the same modules.

Append:

```ts
export function goalProgress(input: {
  goal: Goal;
  contributions: GoalContribution[];
  today: ISODate;
}): GoalProgress {
  const { goal, contributions, today } = input;

  const savedCents = sum(
    contributions.filter((c) => c.goalId === goal.id).map((c) => c.amountCents),
  );

  const isComplete = savedCents >= goal.targetCents;
  const remainingCents = Math.max(0, goal.targetCents - savedCents);

  const pctComplete =
    goal.targetCents <= 0 ? 1 : Math.min(1, savedCents / goal.targetCents);

  if (goal.targetDate === null) {
    return {
      goalId: goal.id,
      savedCents,
      remainingCents,
      pctComplete,
      isComplete,
      monthsRemaining: null,
      requiredPerMonthCents: null,
      onPace: null,
      isOverdue: false,
    };
  }

  const monthsRemaining = monthsBetween(today, goal.targetDate);
  const isOverdue = !isComplete && monthsRemaining < 0;

  // No monthly figure to quote once the goal is met, or once the date is past.
  const requiredPerMonthCents =
    isComplete || monthsRemaining <= 0
      ? null
      : Math.ceil(remainingCents / monthsRemaining);

  return {
    goalId: goal.id,
    savedCents,
    remainingCents,
    pctComplete,
    isComplete,
    monthsRemaining,
    requiredPerMonthCents,
    onPace: isComplete ? true : isOverdue ? false : null,
    isOverdue,
  };
}
```

> **`onPace` is deliberately `null` for an in-flight goal.** Judging pace needs a contribution schedule the app does not have — she contributes irregularly from commission checks. Claiming "behind" from a straight-line assumption would be a guess dressed as a fact. `requiredPerMonthCents` gives her the real information instead.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all goal tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/budget/calc.ts lib/budget/goals.test.ts
git commit -m "Add savings goal progress

onPace stays null for in-flight goals: judging pace needs a contribution
schedule the app does not have, and a straight-line guess presented as a
verdict would be worse than no verdict."
```

---

### Task 7: Database schema and Neon connection

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/index.ts`, `drizzle.config.ts`, `.env.example`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `db` (Drizzle client) from `lib/db/index.ts`; table objects `user`, `session`, `account`, `verification`, `payPeriods`, `paychecks`, `categories`, `allocations`, `transactions`, `goals`, `goalContributions` from `lib/db/schema.ts`

- [ ] **Step 1: Install the database packages**

```bash
npm install drizzle-orm@^0.45.2 @neondatabase/serverless@^1.1.0
npm install -D drizzle-kit@^0.31.10
```

- [ ] **Step 2: Provision Neon and capture the connection string**

In the Vercel dashboard: **Storage → Create Database → Neon**, attach it to this project. Vercel injects `DATABASE_URL` into the project's environment.

Pull it locally:

```bash
npx vercel env pull .env.local
```

Verify `.env.local` now contains a `DATABASE_URL` line and that `.gitignore` already covers `.env*.local`:

```bash
grep -c "DATABASE_URL" .env.local && grep -n "env" .gitignore
```

Expected: a count of 1, and `.gitignore` listing `.env*`.

- [ ] **Step 3: Create `lib/db/schema.ts`**

Better Auth owns the first four tables; its CLI expects these exact names.

```ts
import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// --- Better Auth tables (names fixed by the adapter) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- Budget tables ---
// Money is always integer cents. Calendar days are `date`, never `timestamp`.

export const payPeriods = pgTable(
  "pay_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
  },
  (t) => [unique("pay_periods_user_start").on(t.userId, t.startsOn)],
);

export const paychecks = pgTable("paychecks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  receivedOn: date("received_on").notNull(),
  amountCents: integer("amount_cents").notNull(),
  /** 'base' | 'commission' */
  kind: text("kind").notNull(),
  note: text("note"),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** 'spending' | 'bill' */
  kind: text("kind").notNull(),
  /** Bills force this true; accumulating is what a set-aside means. */
  carryover: boolean("carryover").notNull().default(false),
  monthlyTargetCents: integer("monthly_target_cents"),
  color: text("color").notNull().default("#9ac5e7"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at"),
});

export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payPeriodId: uuid("pay_period_id")
      .notNull()
      .references(() => payPeriods.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [unique("allocations_period_category").on(t.payPeriodId, t.categoryId)],
);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Null means uncategorized: counts toward total spend, no envelope. */
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  occurredOn: date("occurred_on").notNull(),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  targetDate: date("target_date"),
  archivedAt: timestamp("archived_at"),
});

export const goalContributions = pgTable("goal_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  occurredOn: date("occurred_on").notNull(),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
});
```

- [ ] **Step 4: Create `lib/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Run: npx vercel env pull .env.local");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export { schema };
```

- [ ] **Step 5: Create `drizzle.config.ts`**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

- [ ] **Step 6: Add database scripts to `package.json`**

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 7: Create `.env.example`** (committed; documents required vars without values)

```
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAIL=
```

- [ ] **Step 8: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: a new `drizzle/0000_*.sql` file, and the migration applying without error.

- [ ] **Step 9: Verify the tables exist**

```bash
npx drizzle-kit studio
```

Expected: all eleven tables listed. Close it with Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add lib/db drizzle.config.ts drizzle .env.example package.json package-lock.json
git commit -m "Add Drizzle schema on Neon Postgres

Money is integer cents throughout; calendar days are date columns, never
timestamps, so a late-evening expense cannot shift into another period."
```

---

### Task 8: Authentication, the allowlist, and the Data Access Layer

Two layers: `proxy.ts` bounces strangers cheaply, and `verifySession()` is the gate everything touching data must pass. The allowlist means a stranger signing in with Google gets no account at all.

**Files:**
- Create: `lib/auth.ts`, `lib/auth-client.ts`, `lib/dal.ts`, `app/api/auth/[...all]/route.ts`, `proxy.ts`, `app/(private)/layout.tsx`, `app/signin/page.tsx`
- Modify: `.env.local`

**Interfaces:**
- Consumes: `db` from `lib/db/index.ts`
- Produces:
  - `auth` from `lib/auth.ts`
  - `authClient` from `lib/auth-client.ts`
  - `verifySession(): Promise<{ userId: string; email: string; name: string }>` from `lib/dal.ts` — redirects to `/signin` when there is no session, so callers never handle the null case

- [ ] **Step 1: Install Better Auth**

```bash
npm install better-auth@^1.7.4 @better-auth/drizzle-adapter@^1.7.4
```

- [ ] **Step 2: Create a Google OAuth client**

In Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application. Authorized redirect URIs:

```
http://localhost:3000/api/auth/callback/google
https://<your-vercel-domain>/api/auth/callback/google
```

Add the resulting id and secret to `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, plus:

```
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
ALLOWED_EMAIL=<nadya's google address>
```

- [ ] **Step 3: Create `lib/auth.ts` with the allowlist**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/lib/db";

const allowedEmail = process.env.ALLOWED_EMAIL?.toLowerCase().trim();

if (!allowedEmail) {
  throw new Error("ALLOWED_EMAIL is not set — refusing to start an open sign-up.");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Reject anyone but Nadya before a row is ever written.
        before: async (user) => {
          if (user.email?.toLowerCase().trim() !== allowedEmail) {
            return false;
          }
          return { data: user };
        },
      },
    },
  },
});
```

- [ ] **Step 4: Create the route handler at `app/api/auth/[...all]/route.ts`**

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Create `lib/auth-client.ts`**

```ts
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 6: Create the Data Access Layer at `lib/dal.ts`**

```ts
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export interface VerifiedSession {
  userId: string;
  email: string;
  name: string;
}

/**
 * The real authorization gate. Every server component, Server Action, and
 * query that touches budget data calls this FIRST and scopes its work to the
 * returned userId. proxy.ts is an optimistic redirect, not a substitute.
 *
 * Memoized per render pass with React's cache(), so calling it in a layout and
 * again in a page costs one lookup.
 */
export const verifySession = cache(async (): Promise<VerifiedSession> => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/signin");
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
});
```

- [ ] **Step 7: Create `proxy.ts` in the project root**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * OPTIMISTIC check only. It reads the cookie's presence, not its validity,
 * so a forged cookie gets past this — verifySession() in the DAL is what
 * actually protects the data. This exists so strangers get bounced fast.
 *
 * Next.js 16 renamed middleware.ts to proxy.ts; the export is `proxy`.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("better-auth.session_token");

  if (!hasSession) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/budget/:path*", "/onboarding/:path*"],
};
```

- [ ] **Step 8: Create the sign-in page at `app/signin/page.tsx`**

```tsx
"use client";

import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "22rem" }}>
        <h1 style={{ fontSize: "1.5rem", color: "var(--ink)" }}>Nadya&rsquo;s Budget</h1>
        <p style={{ color: "var(--ink-soft)", margin: "0.75rem 0 1.5rem" }}>
          This is a private tool.
        </p>
        <button
          onClick={() => signIn.social({ provider: "google", callbackURL: "/budget" })}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "999px",
            border: "1px solid var(--ink-faint)",
            background: "var(--pearl)",
            color: "var(--ink)",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Create the private layout at `app/(private)/layout.tsx`**

```tsx
import { verifySession } from "@/lib/dal";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate the whole private area. Pages still call verifySession() themselves
  // for the userId — it is memoized, so this costs one lookup per render.
  await verifySession();

  return <>{children}</>;
}
```

- [ ] **Step 10: Regenerate the auth schema and migrate**

Better Auth's own CLI confirms the four auth tables match what the adapter expects:

```bash
npx @better-auth/cli generate
npm run db:generate
npm run db:migrate
```

Expected: either no schema changes, or a migration that applies cleanly.

- [ ] **Step 11: Verify sign-in end to end**

```bash
npm run dev
```

Then in a browser:
1. Visit `http://localhost:3000/budget` → expect a redirect to `/signin`.
2. Sign in with Nadya's Google account → expect a redirect to `/budget` (a 404 for now is fine; the route arrives in Task 10).
3. Sign out, then attempt sign-in with a different Google account → expect failure and **no new row** in the `user` table.

Confirm the allowlist held:

```bash
npx drizzle-kit studio
```

Expected: exactly one row in `user`.

- [ ] **Step 12: Commit**

```bash
git add lib/auth.ts lib/auth-client.ts lib/dal.ts app/api/auth app/signin app/\(private\) proxy.ts package.json package-lock.json
git commit -m "Add Google sign-in restricted to one address

Two layers: proxy.ts bounces strangers on cookie presence alone, and
verifySession() in the DAL is the real gate every data path goes through.
A non-allowlisted Google account is rejected before a user row exists."
```

---

### Task 9: Queries and Server Actions

**Files:**
- Create: `lib/db/queries.ts`, `lib/budget/actions.ts`, `lib/budget/periods.ts`
- Test: `lib/budget/periods.test.ts`

**Interfaces:**
- Consumes: `db`, `schema`, `verifySession`, `lib/budget/types.ts`
- Produces:
  - `nextPeriodBounds(lastStartsOn: ISODate): { startsOn: ISODate; endsOn: ISODate }` — biweekly, 14 days
  - `getPeriodData(periodId?: string)` → everything one budget page render needs
  - Server Actions: `logPaycheck`, `addTransaction`, `setAllocation`, `addGoalContribution`, `createCategory`, `createGoal`

- [ ] **Step 1: Write the failing test for period bounds**

Create `lib/budget/periods.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./periods"`.

- [ ] **Step 3: Implement `lib/budget/periods.ts`**

```ts
import { addDays } from "./dates";
import type { ISODate } from "./dates";

/** Biweekly: fourteen days, inclusive of both ends. */
export const PERIOD_LENGTH_DAYS = 14;

export function periodBoundsFrom(startsOn: ISODate): {
  startsOn: ISODate;
  endsOn: ISODate;
} {
  return { startsOn, endsOn: addDays(startsOn, PERIOD_LENGTH_DAYS - 1) };
}

export function nextPeriodBounds(lastStartsOn: ISODate): {
  startsOn: ISODate;
  endsOn: ISODate;
} {
  return periodBoundsFrom(addDays(lastStartsOn, PERIOD_LENGTH_DAYS));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Create `lib/db/queries.ts`**

```ts
import "server-only";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  allocations,
  categories,
  goalContributions,
  goals,
  paychecks,
  payPeriods,
  transactions,
} from "@/lib/db/schema";
import { verifySession } from "@/lib/dal";
import type {
  Allocation,
  Category,
  Goal,
  GoalContribution,
  Paycheck,
  PayPeriod,
  Transaction,
} from "@/lib/budget/types";

/**
 * Everything one budget page render needs, in one round trip's worth of
 * queries, all scoped to the verified session's user.
 *
 * Allocations are fetched for this period AND EARLIER ONLY. envelopeBalance
 * treats every allocation that is not this period's as prior history, so
 * including a future period's allocations would inflate carried-in balances.
 */
export async function getPeriodData(periodId?: string) {
  const { userId } = await verifySession();

  const periods = await db
    .select()
    .from(payPeriods)
    .where(eq(payPeriods.userId, userId))
    .orderBy(asc(payPeriods.startsOn));

  if (periods.length === 0) return null;

  const current = periodId
    ? periods.find((p) => p.id === periodId)
    : periods[periods.length - 1];

  if (!current) return null;

  const [cats, checks, txns, allocRows] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.archivedAt)))
      .orderBy(asc(categories.sortOrder)),
    db.select().from(paychecks).where(eq(paychecks.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db
      .select({
        payPeriodId: allocations.payPeriodId,
        categoryId: allocations.categoryId,
        amountCents: allocations.amountCents,
      })
      .from(allocations)
      .innerJoin(payPeriods, eq(allocations.payPeriodId, payPeriods.id))
      .where(
        and(
          eq(payPeriods.userId, userId),
          lte(payPeriods.startsOn, current.startsOn),
        ),
      ),
  ]);

  return {
    period: toPeriod(current),
    periods: periods.map(toPeriod),
    categories: cats.map(toCategory),
    paychecks: checks.map(toPaycheck),
    transactions: txns.map(toTransaction),
    allocations: allocRows as Allocation[],
  };
}

export async function getGoalsData() {
  const { userId } = await verifySession();

  const rows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.archivedAt)))
    .orderBy(asc(goals.name));

  const contributions = rows.length
    ? await db
        .select()
        .from(goalContributions)
        .innerJoin(goals, eq(goalContributions.goalId, goals.id))
        .where(eq(goals.userId, userId))
    : [];

  return {
    goals: rows.map(
      (g): Goal => ({
        id: g.id,
        name: g.name,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
      }),
    ),
    contributions: contributions.map(
      (row): GoalContribution => ({
        goalId: row.goal_contributions.goalId,
        occurredOn: row.goal_contributions.occurredOn,
        amountCents: row.goal_contributions.amountCents,
      }),
    ),
  };
}

// --- row -> domain mappers, so db shapes never leak into calc ---

type PeriodRow = typeof payPeriods.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type PaycheckRow = typeof paychecks.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

const toPeriod = (r: PeriodRow): PayPeriod => ({
  id: r.id,
  startsOn: r.startsOn,
  endsOn: r.endsOn,
});

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  kind: r.kind as Category["kind"],
  carryover: r.carryover,
  monthlyTargetCents: r.monthlyTargetCents,
  color: r.color,
  sortOrder: r.sortOrder,
});

const toPaycheck = (r: PaycheckRow): Paycheck => ({
  id: r.id,
  receivedOn: r.receivedOn,
  amountCents: r.amountCents,
  kind: r.kind as Paycheck["kind"],
});

const toTransaction = (r: TransactionRow): Transaction => ({
  id: r.id,
  categoryId: r.categoryId,
  occurredOn: r.occurredOn,
  amountCents: r.amountCents,
});
```

- [ ] **Step 6: Install Zod and create `lib/budget/actions.ts`**

```bash
npm install zod@^4.6.4
```

```ts
"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  allocations,
  categories,
  goalContributions,
  goals,
  paychecks,
  payPeriods,
  transactions,
} from "@/lib/db/schema";
import { verifySession } from "@/lib/dal";
import { periodBoundsFrom } from "./periods";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const cents = z.coerce.number().int().min(0).max(100_000_000);

/** Dollars from a form input -> integer cents, without float drift. */
function toCents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}

export async function logPaycheck(formData: FormData) {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      receivedOn: isoDate,
      amount: z.string(),
      kind: z.enum(["base", "commission"]),
    })
    .parse(Object.fromEntries(formData));

  const amountCents = cents.parse(toCents(parsed.amount));

  await db.insert(paychecks).values({
    userId,
    receivedOn: parsed.receivedOn,
    amountCents,
    kind: parsed.kind,
  });

  // A base check starts the next pay period if one does not already exist.
  if (parsed.kind === "base") {
    const bounds = periodBoundsFrom(parsed.receivedOn);
    await db
      .insert(payPeriods)
      .values({ userId, startsOn: bounds.startsOn, endsOn: bounds.endsOn })
      .onConflictDoNothing();
  }

  revalidatePath("/budget");
}

export async function addTransaction(formData: FormData) {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      categoryId: z.string().uuid().nullable().catch(null),
      occurredOn: isoDate,
      amount: z.string(),
      note: z.string().max(200).optional(),
    })
    .parse({
      ...Object.fromEntries(formData),
      categoryId: formData.get("categoryId") || null,
    });

  // Scope the category to this user, so a forged id cannot write elsewhere.
  if (parsed.categoryId) {
    const owned = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, parsed.categoryId), eq(categories.userId, userId)));
    if (owned.length === 0) throw new Error("Unknown category");
  }

  await db.insert(transactions).values({
    userId,
    categoryId: parsed.categoryId,
    occurredOn: parsed.occurredOn,
    amountCents: cents.parse(toCents(parsed.amount)),
    note: parsed.note || null,
  });

  revalidatePath("/budget");
}

export async function setAllocation(formData: FormData) {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      payPeriodId: z.string().uuid(),
      categoryId: z.string().uuid(),
      amount: z.string(),
    })
    .parse(Object.fromEntries(formData));

  const owned = await db
    .select({ id: payPeriods.id })
    .from(payPeriods)
    .where(and(eq(payPeriods.id, parsed.payPeriodId), eq(payPeriods.userId, userId)));
  if (owned.length === 0) throw new Error("Unknown period");

  const amountCents = cents.parse(toCents(parsed.amount));

  await db
    .insert(allocations)
    .values({
      payPeriodId: parsed.payPeriodId,
      categoryId: parsed.categoryId,
      amountCents,
    })
    .onConflictDoUpdate({
      target: [allocations.payPeriodId, allocations.categoryId],
      set: { amountCents },
    });

  revalidatePath("/budget");
}

export async function createCategory(formData: FormData) {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      name: z.string().min(1).max(60),
      kind: z.enum(["spending", "bill"]),
      carryover: z.coerce.boolean().default(false),
      monthlyTarget: z.string().optional(),
    })
    .parse(Object.fromEntries(formData));

  const isBill = parsed.kind === "bill";

  await db.insert(categories).values({
    userId,
    name: parsed.name,
    kind: parsed.kind,
    // Accumulating IS what a set-aside means, so bills force this true.
    carryover: isBill ? true : parsed.carryover,
    monthlyTargetCents:
      isBill && parsed.monthlyTarget ? toCents(parsed.monthlyTarget) : null,
  });

  revalidatePath("/budget");
}

export async function createGoal(formData: FormData) {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      name: z.string().min(1).max(60),
      target: z.string(),
      targetDate: isoDate.optional().or(z.literal("")),
    })
    .parse(Object.fromEntries(formData));

  await db.insert(goals).values({
    userId,
    name: parsed.name,
    targetCents: cents.parse(toCents(parsed.target)),
    targetDate: parsed.targetDate || null,
  });

  revalidatePath("/budget/goals");
}

export async function addGoalContribution(formData: FormData) {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      goalId: z.string().uuid(),
      occurredOn: isoDate,
      amount: z.string(),
      note: z.string().max(200).optional(),
    })
    .parse(Object.fromEntries(formData));

  const owned = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, parsed.goalId), eq(goals.userId, userId)));
  if (owned.length === 0) throw new Error("Unknown goal");

  await db.insert(goalContributions).values({
    goalId: parsed.goalId,
    occurredOn: parsed.occurredOn,
    amountCents: cents.parse(toCents(parsed.amount)),
    note: parsed.note || null,
  });

  revalidatePath("/budget/goals");
}
```

- [ ] **Step 7: Verify it typechecks and tests still pass**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/db/queries.ts lib/budget/actions.ts lib/budget/periods.ts lib/budget/periods.test.ts package.json package-lock.json
git commit -m "Add user-scoped queries and Server Actions

Every action verifies the session first and re-checks ownership of any
id arriving from a form, so a forged category or goal id cannot write
into someone else's rows. Bills force carryover true on creation."
```

---

### Task 10: Onboarding

First run cannot be an empty screen. Three questions, then she has a working budget.

**Files:**
- Create: `app/(private)/onboarding/page.tsx`, `app/(private)/onboarding/actions.ts`, `app/(private)/onboarding/onboarding.module.css`

**Interfaces:**
- Consumes: `verifySession`, `db`, `periodBoundsFrom`
- Produces: `completeOnboarding(formData: FormData)` — creates the first pay period, the first paycheck, bill categories with targets, and default spending categories, then redirects to `/budget`

- [ ] **Step 1: Create `app/(private)/onboarding/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { categories, paychecks, payPeriods } from "@/lib/db/schema";
import { verifySession } from "@/lib/dal";
import { periodBoundsFrom } from "@/lib/budget/periods";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Seeded so she edits a list rather than facing an empty screen. */
const DEFAULT_SPENDING = [
  { name: "Groceries", color: "#9ac5e7" },
  { name: "Gas", color: "#bedcf2" },
  { name: "Eating out", color: "#93bee0" },
  { name: "Personal", color: "#cadff0" },
  { name: "Misc", color: "#dceefb" },
];

export async function completeOnboarding(formData: FormData) {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      lastPaycheckOn: isoDate,
      lastPaycheckAmount: z.string(),
      billNames: z.string(),
      billAmounts: z.string(),
    })
    .parse(Object.fromEntries(formData));

  const toCents = (d: string) => Math.round(Number(d) * 100);

  const bounds = periodBoundsFrom(parsed.lastPaycheckOn);

  await db
    .insert(payPeriods)
    .values({ userId, startsOn: bounds.startsOn, endsOn: bounds.endsOn })
    .onConflictDoNothing();

  await db.insert(paychecks).values({
    userId,
    receivedOn: parsed.lastPaycheckOn,
    amountCents: toCents(parsed.lastPaycheckAmount),
    kind: "base",
  });

  const names = parsed.billNames.split("\n").map((s) => s.trim()).filter(Boolean);
  const amounts = parsed.billAmounts.split("\n").map((s) => s.trim()).filter(Boolean);

  const billRows = names.map((name, i) => ({
    userId,
    name,
    kind: "bill" as const,
    carryover: true,
    monthlyTargetCents: toCents(amounts[i] ?? "0"),
    color: "#6ba1cd",
    sortOrder: i,
  }));

  const spendingRows = DEFAULT_SPENDING.map((c, i) => ({
    userId,
    name: c.name,
    kind: "spending" as const,
    carryover: false,
    monthlyTargetCents: null,
    color: c.color,
    sortOrder: billRows.length + i,
  }));

  if (billRows.length + spendingRows.length > 0) {
    await db.insert(categories).values([...billRows, ...spendingRows]);
  }

  redirect("/budget");
}
```

- [ ] **Step 2: Create `app/(private)/onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payPeriods } from "@/lib/db/schema";
import { verifySession } from "@/lib/dal";
import { completeOnboarding } from "./actions";
import styles from "./onboarding.module.css";

export default async function OnboardingPage() {
  const { userId, name } = await verifySession();

  // Already set up? Nothing to do here.
  const existing = await db
    .select({ id: payPeriods.id })
    .from(payPeriods)
    .where(eq(payPeriods.userId, userId));

  if (existing.length > 0) redirect("/budget");

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className={styles.wrap}>
      <h1 className={styles.title}>Hi {name.split(" ")[0]}</h1>
      <p className={styles.lede}>Three questions and you&rsquo;re set up.</p>

      <form action={completeOnboarding} className={styles.form}>
        <fieldset className={styles.field}>
          <legend>When was your last paycheck, and how much?</legend>
          <input
            type="date"
            name="lastPaycheckOn"
            defaultValue={today}
            required
            className={styles.input}
          />
          <input
            type="number"
            name="lastPaycheckAmount"
            step="0.01"
            min="0"
            placeholder="1400.00"
            inputMode="decimal"
            required
            className={styles.input}
          />
          <p className={styles.hint}>
            This starts your first two-week period. Commission checks get logged
            separately as they arrive.
          </p>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>What monthly bills do you have?</legend>
          <textarea
            name="billNames"
            rows={5}
            placeholder={"Rent\nCar payment\nPhone\nInsurance"}
            className={styles.input}
          />
          <textarea
            name="billAmounts"
            rows={5}
            placeholder={"1200\n340\n75\n130"}
            className={styles.input}
          />
          <p className={styles.hint}>
            One per line, matching up. Each paycheck will set aside about 46% of
            the monthly amount &mdash; twelve bills a year across twenty-six
            checks &mdash; so rent never lands on one check all at once.
          </p>
        </fieldset>

        <button type="submit" className={styles.submit}>
          Set up my budget
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create `app/(private)/onboarding/onboarding.module.css`**

```css
.wrap {
  max-width: 32rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}

.title {
  font-size: 1.75rem;
  color: var(--ink);
  margin-bottom: 0.25rem;
}

.lede {
  color: var(--ink-soft);
  margin-bottom: 2rem;
}

.form {
  display: grid;
  gap: 2rem;
}

.field {
  display: grid;
  gap: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ink-faint) 40%, transparent);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.field legend {
  color: var(--ink);
  font-weight: 600;
  padding: 0 0.5rem;
}

.input {
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ink-faint);
  background: var(--pearl);
  color: var(--ink-body);
  font-family: inherit;
}

.hint {
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.5;
}

.submit {
  padding: 0.9rem;
  font-size: 1rem;
  border-radius: 999px;
  border: none;
  background: var(--sea-near);
  color: var(--pearl);
  cursor: pointer;
}
```

- [ ] **Step 4: Verify onboarding end to end**

Run `npm run dev`, sign in, visit `http://localhost:3000/onboarding`.

Fill in a paycheck date and amount, two bills, and submit.

Expected: redirect to `/budget`. Then check the data:

```bash
npx drizzle-kit studio
```

Expected: one `pay_periods` row with `ends_on` 13 days after `starts_on`; one `paychecks` row with `kind = 'base'`; bill categories with `carryover = true` and a `monthly_target_cents`; five spending categories with `carryover = false`.

- [ ] **Step 5: Commit**

```bash
git add "app/(private)/onboarding"
git commit -m "Add onboarding

Three questions, then a working budget. Spending categories are seeded so
first run is a list to edit rather than an empty screen."
```

---

### Task 11: Florals

Shared SVG components used by both the budget UI and the landing page, so the private tool and the public page read as one thing.

**Files:**
- Create: `components/florals/Bloom.tsx`, `components/florals/Sprig.tsx`, `components/florals/florals.module.css`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `<Bloom progress={number} label?: string size?: number />` — `progress` is 0..1; petals fill proportionally. With `label`, it is a real progress indicator with `role="img"`; without, it is `aria-hidden` decoration.
  - `<Sprig className?: string />` — decorative only, always `aria-hidden`

- [ ] **Step 1: Create `components/florals/Bloom.tsx`**

```tsx
const PETALS = 6;

export function Bloom({
  progress,
  label,
  size = 64,
}: {
  /** 0..1. Values outside are clamped. */
  progress: number;
  /** Omit for decoration; provide for a real progress indicator. */
  label?: string;
  size?: number;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const filled = p * PETALS;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: PETALS }, (_, i) => {
        // Each petal fills in turn, the last one partially.
        const fill = Math.max(0, Math.min(1, filled - i));
        return (
          <ellipse
            key={i}
            cx="50"
            cy="27"
            rx="11"
            ry="21"
            transform={`rotate(${(360 / PETALS) * i} 50 50)`}
            fill="var(--sea-mid)"
            fillOpacity={0.18 + fill * 0.72}
            stroke="var(--sea-near)"
            strokeOpacity={0.35}
            strokeWidth="1"
          />
        );
      })}
      <circle cx="50" cy="50" r="9" fill="var(--sun-warm)" />
    </svg>
  );
}
```

- [ ] **Step 2: Create `components/florals/Sprig.tsx`**

```tsx
export function Sprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 200"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M60 200 C 60 150, 54 110, 60 60"
        stroke="var(--sea-mid)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {[
        { y: 158, dir: -1 },
        { y: 126, dir: 1 },
        { y: 96, dir: -1 },
        { y: 70, dir: 1 },
      ].map(({ y, dir }, i) => (
        <ellipse
          key={i}
          cx={60 + dir * 17}
          cy={y}
          rx="17"
          ry="7"
          transform={`rotate(${dir * -22} ${60 + dir * 17} ${y})`}
          fill="var(--sea-far)"
          fillOpacity="0.75"
        />
      ))}
      <circle cx="60" cy="52" r="11" fill="var(--sky-mid)" />
      <circle cx="60" cy="52" r="5" fill="var(--sun-warm)" />
    </svg>
  );
}
```

- [ ] **Step 3: Create `components/florals/florals.module.css`**

```css
.cornerSprig {
  position: absolute;
  width: 5rem;
  opacity: 0.5;
  pointer-events: none;
}

.topLeft {
  top: 0;
  left: 0.5rem;
  transform: rotate(180deg);
}

.bottomRight {
  bottom: 0;
  right: 0.5rem;
}

@media (max-width: 480px) {
  .cornerSprig {
    width: 3.5rem;
    opacity: 0.35;
  }
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. If `former` was left in, this is where it surfaces.

- [ ] **Step 5: Commit**

```bash
git add components/florals
git commit -m "Add shared SVG florals

Bloom doubles as the savings-goal indicator, so the same component
decorates the landing page and carries real numbers in the budget UI."
```

---

### Task 12: The budget page

**Files:**
- Create: `app/(private)/budget/page.tsx`, `app/(private)/budget/budget.module.css`, `components/budget/QuickAdd.tsx`, `components/budget/EnvelopeCard.tsx`, `lib/budget/format.ts`
- Test: `lib/budget/format.test.ts`

**Interfaces:**
- Consumes: `getPeriodData`, `summarizePeriod`, `addTransaction`, `logPaycheck`, `setAllocation`, `Bloom`
- Produces: `formatCents(cents: number): string` from `lib/budget/format.ts`

- [ ] **Step 1: Write the failing test for money formatting**

Create `lib/budget/format.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 3: Implement `lib/budget/format.ts`**

```ts
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Create `components/budget/EnvelopeCard.tsx`**

```tsx
import { formatCents } from "@/lib/budget/format";
import type { EnvelopeBalance, Category } from "@/lib/budget/types";
import styles from "@/app/(private)/budget/budget.module.css";

export function EnvelopeCard({
  category,
  balance,
}: {
  category: Category;
  balance: EnvelopeBalance;
}) {
  const pct = Math.min(100, Math.round(balance.pctUsed * 100));

  return (
    <article className={styles.envelope}>
      <header className={styles.envelopeHead}>
        <h3 className={styles.envelopeName}>{category.name}</h3>
        <span
          className={balance.overspent ? styles.amountOver : styles.amount}
        >
          {formatCents(balance.remainingCents)}
        </span>
      </header>

      <div
        className={styles.bar}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${category.name}: ${formatCents(balance.spentCents)} spent of ${formatCents(
          balance.carriedInCents + balance.allocatedCents,
        )}`}
      >
        <div
          className={balance.overspent ? styles.fillOver : styles.fill}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className={styles.envelopeMeta}>
        {formatCents(balance.spentCents)} spent
        {balance.carriedInCents !== 0 && (
          <> &middot; {formatCents(balance.carriedInCents)} carried in</>
        )}
        {balance.kind === "bill" && balance.monthlyTargetCents !== null && (
          <>
            {" "}
            &middot; {balance.fullyFunded ? "fully funded" : "funding"} toward{" "}
            {formatCents(balance.monthlyTargetCents)}
          </>
        )}
      </p>
    </article>
  );
}
```

- [ ] **Step 6: Create `components/budget/QuickAdd.tsx`**

```tsx
"use client";

import { useRef } from "react";
import { addTransaction } from "@/lib/budget/actions";
import type { Category } from "@/lib/budget/types";
import styles from "@/app/(private)/budget/budget.module.css";

export function QuickAdd({
  categories,
  today,
}: {
  categories: Category[];
  today: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addTransaction(formData);
        formRef.current?.reset();
      }}
      className={styles.quickAdd}
    >
      <input
        type="number"
        name="amount"
        step="0.01"
        min="0"
        placeholder="0.00"
        inputMode="decimal"
        required
        aria-label="Amount"
        className={styles.quickAmount}
      />
      <select name="categoryId" aria-label="Category" className={styles.quickSelect}>
        {categories
          .filter((c) => c.kind === "spending")
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        <option value="">Uncategorized</option>
      </select>
      <input type="hidden" name="occurredOn" value={today} />
      <button type="submit" className={styles.quickSubmit}>
        Add
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Create `app/(private)/budget/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPeriodData } from "@/lib/db/queries";
import { summarizePeriod } from "@/lib/budget/calc";
import { formatCents } from "@/lib/budget/format";
import { EnvelopeCard } from "@/components/budget/EnvelopeCard";
import { QuickAdd } from "@/components/budget/QuickAdd";
import styles from "./budget.module.css";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodId } = await searchParams;
  const data = await getPeriodData(periodId);

  if (!data) redirect("/onboarding");

  const today = new Date().toISOString().slice(0, 10);

  const summary = summarizePeriod({
    period: data.period,
    paychecks: data.paychecks,
    categories: data.categories,
    allocations: data.allocations,
    transactions: data.transactions,
    today,
  });

  const index = data.periods.findIndex((p) => p.id === data.period.id);
  const prev = data.periods[index - 1];
  const next = data.periods[index + 1];

  const byId = new Map(data.categories.map((c) => [c.id, c]));
  const spending = summary.envelopes.filter((e) => e.kind === "spending");
  const bills = summary.envelopes.filter((e) => e.kind === "bill");

  return (
    <main className={styles.page}>
      <nav className={styles.periodNav}>
        {prev ? (
          <Link href={`/budget?period=${prev.id}`}>&larr; Previous</Link>
        ) : (
          <span />
        )}
        <span className={styles.periodLabel}>
          {data.period.startsOn} &ndash; {data.period.endsOn}
        </span>
        {next ? <Link href={`/budget?period=${next.id}`}>Next &rarr;</Link> : <span />}
      </nav>

      <section className={styles.headline}>
        {summary.safeToSpendPerDayCents === null ? (
          <>
            <p className={styles.headlineNumber}>
              {formatCents(summary.spendableRemainingCents)}
            </p>
            <p className={styles.headlineLabel}>left &middot; period has ended</p>
          </>
        ) : (
          <>
            <p className={styles.headlineNumber}>
              {formatCents(summary.safeToSpendPerDayCents)}
            </p>
            <p className={styles.headlineLabel}>
              a day for {summary.daysRemaining}{" "}
              {summary.daysRemaining === 1 ? "day" : "days"} &middot;{" "}
              {formatCents(summary.spendableRemainingCents)} left
            </p>
          </>
        )}
      </section>

      <QuickAdd categories={data.categories} today={today} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>This paycheck</h2>
        <p className={styles.income}>
          {formatCents(summary.baseCents)} base
          {summary.commissionCents > 0 && (
            <> &middot; {formatCents(summary.commissionCents)} commission</>
          )}
        </p>
        {summary.unallocatedCents !== 0 && (
          <p className={styles.unallocated}>
            {formatCents(Math.abs(summary.unallocatedCents))}{" "}
            {summary.unallocatedCents > 0 ? "unallocated" : "over-allocated"} &middot;{" "}
            <Link href="/budget/goals">send to a goal</Link>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Spending</h2>
        <div className={styles.envelopes}>
          {spending.map((balance) => (
            <EnvelopeCard
              key={balance.categoryId}
              category={byId.get(balance.categoryId)!}
              balance={balance}
            />
          ))}
        </div>
      </section>

      {bills.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Set aside for bills</h2>
          <p className={styles.sectionNote}>
            Not counted in your daily number &mdash; this money is spoken for.
          </p>
          <div className={styles.envelopes}>
            {bills.map((balance) => (
              <EnvelopeCard
                key={balance.categoryId}
                category={byId.get(balance.categoryId)!}
                balance={balance}
              />
            ))}
          </div>
        </section>
      )}

      <nav className={styles.footerNav}>
        <Link href="/budget/goals">Savings goals &rarr;</Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 8: Create `app/(private)/budget/budget.module.css`**

Mobile-first: base styles target 375px, the media query widens.

```css
.page {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem 1rem 5rem;
}

.periodNav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin-bottom: 1.5rem;
}

.periodNav a {
  color: var(--ink);
}

.periodLabel {
  font-variant-numeric: tabular-nums;
}

.headline {
  text-align: center;
  padding: 1.5rem 0 2rem;
}

.headlineNumber {
  font-size: clamp(2.75rem, 14vw, 4rem);
  font-weight: 600;
  color: var(--ink);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.headlineLabel {
  margin-top: 0.5rem;
  color: var(--ink-soft);
  font-size: 0.95rem;
}

.quickAdd {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.5rem;
  position: sticky;
  top: 0.5rem;
  z-index: 10;
  background: var(--pearl);
  padding: 0.5rem;
  border-radius: 0.75rem;
  box-shadow: 0 2px 12px rgb(62 90 121 / 0.12);
  margin-bottom: 2rem;
}

.quickAmount,
.quickSelect {
  padding: 0.7rem 0.6rem;
  font-size: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ink-faint);
  background: var(--pearl);
  color: var(--ink-body);
  min-width: 0;
}

.quickSubmit {
  padding: 0.7rem 1.1rem;
  border-radius: 0.5rem;
  border: none;
  background: var(--sea-near);
  color: var(--pearl);
  font-size: 1rem;
  cursor: pointer;
}

.section {
  margin-bottom: 2rem;
}

.sectionTitle {
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 0.75rem;
}

.sectionNote {
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin-bottom: 0.75rem;
}

.income {
  color: var(--ink-body);
  font-variant-numeric: tabular-nums;
}

.unallocated {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: var(--ink-soft);
}

.envelopes {
  display: grid;
  gap: 0.75rem;
}

.envelope {
  border: 1px solid color-mix(in srgb, var(--ink-faint) 35%, transparent);
  border-radius: 0.75rem;
  padding: 0.9rem 1rem;
  background: var(--pearl);
}

.envelopeHead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.envelopeName {
  font-size: 1rem;
  color: var(--ink);
  font-weight: 500;
}

.amount,
.amountOver {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.amount {
  color: var(--ink);
}

.amountOver {
  color: #b4553f;
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sea-far) 45%, transparent);
  overflow: hidden;
  margin: 0.6rem 0 0.5rem;
}

.fill,
.fillOver {
  height: 100%;
  border-radius: 999px;
  transition: width 240ms var(--ease-soft);
}

.fill {
  background: var(--sea-near);
}

.fillOver {
  background: #b4553f;
}

.envelopeMeta {
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.footerNav {
  text-align: center;
  padding-top: 1rem;
}

.footerNav a {
  color: var(--ink);
}

@media (min-width: 40rem) {
  .page {
    padding: 2rem 1.5rem 5rem;
  }

  .envelopes {
    grid-template-columns: 1fr 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fill,
  .fillOver {
    transition: none;
  }
}
```

- [ ] **Step 9: Verify the budget page renders with real data**

Run `npm run dev`, sign in, and visit `/budget`.

Expected:
- The daily number is the largest thing on screen.
- Bill envelopes sit under "Set aside for bills" and are **not** included in the daily number.
- Adding an expense through Quick Add updates the envelope and the daily number without a full page reload.

Check the arithmetic by hand once: with a $280 groceries allocation, $140 spent, and 7 days left, the headline must read `$20.00`.

- [ ] **Step 10: Commit**

```bash
git add "app/(private)/budget" components/budget lib/budget/format.ts lib/budget/format.test.ts
git commit -m "Add the budget page

Safe-to-spend-per-day is the headline. Bill set-asides render in their
own section and are excluded from that number, with the reason stated on
the page so it does not read as a bug."
```

---

### Task 13: The goals page

**Files:**
- Create: `app/(private)/budget/goals/page.tsx`, `app/(private)/budget/goals/goals.module.css`

**Interfaces:**
- Consumes: `getGoalsData`, `goalProgress`, `createGoal`, `addGoalContribution`, `Bloom`, `formatCents`
- Produces: nothing later tasks depend on

- [ ] **Step 1: Create `app/(private)/budget/goals/page.tsx`**

```tsx
import Link from "next/link";
import { getGoalsData } from "@/lib/db/queries";
import { goalProgress } from "@/lib/budget/calc";
import { formatCents } from "@/lib/budget/format";
import { createGoal, addGoalContribution } from "@/lib/budget/actions";
import { Bloom } from "@/components/florals/Bloom";
import styles from "./goals.module.css";

export default async function GoalsPage() {
  const { goals, contributions } = await getGoalsData();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className={styles.page}>
      <nav className={styles.topNav}>
        <Link href="/budget">&larr; Budget</Link>
      </nav>

      <h1 className={styles.title}>Savings goals</h1>

      <div className={styles.goals}>
        {goals.map((goal) => {
          const p = goalProgress({ goal, contributions, today });

          return (
            <article key={goal.id} className={styles.goal}>
              <div className={styles.bloom}>
                <Bloom
                  progress={p.pctComplete}
                  label={`${goal.name}: ${formatCents(p.savedCents)} saved of ${formatCents(
                    goal.targetCents,
                  )}, ${Math.round(p.pctComplete * 100)} percent`}
                  size={72}
                />
              </div>

              <div className={styles.goalBody}>
                <h2 className={styles.goalName}>{goal.name}</h2>
                <p className={styles.goalAmount}>
                  {formatCents(p.savedCents)}{" "}
                  <span className={styles.goalTarget}>
                    of {formatCents(goal.targetCents)}
                  </span>
                </p>

                <p className={styles.goalMeta}>
                  {p.isComplete ? (
                    "Done."
                  ) : p.isOverdue ? (
                    <span className={styles.overdue}>
                      Past its date &middot; {formatCents(p.remainingCents)} short
                    </span>
                  ) : p.requiredPerMonthCents !== null ? (
                    <>
                      {formatCents(p.requiredPerMonthCents)} a month to make{" "}
                      {goal.targetDate}
                    </>
                  ) : (
                    <>{formatCents(p.remainingCents)} to go</>
                  )}
                </p>

                <form action={addGoalContribution} className={styles.contribute}>
                  <input type="hidden" name="goalId" value={goal.id} />
                  <input type="hidden" name="occurredOn" value={today} />
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    inputMode="decimal"
                    required
                    aria-label={`Add to ${goal.name}`}
                    className={styles.input}
                  />
                  <button type="submit" className={styles.addButton}>
                    Add
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>

      <section className={styles.newGoal}>
        <h2 className={styles.sectionTitle}>New goal</h2>
        <form action={createGoal} className={styles.newGoalForm}>
          <input
            name="name"
            placeholder="What for?"
            required
            maxLength={60}
            aria-label="Goal name"
            className={styles.input}
          />
          <input
            type="number"
            name="target"
            step="0.01"
            min="0"
            placeholder="Amount"
            inputMode="decimal"
            required
            aria-label="Target amount"
            className={styles.input}
          />
          <input
            type="date"
            name="targetDate"
            aria-label="Target date (optional)"
            className={styles.input}
          />
          <button type="submit" className={styles.addButton}>
            Create
          </button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Create `app/(private)/budget/goals/goals.module.css`**

```css
.page {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem 1rem 5rem;
}

.topNav {
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
}

.topNav a {
  color: var(--ink);
}

.title {
  font-size: 1.5rem;
  color: var(--ink);
  margin-bottom: 1.5rem;
}

.goals {
  display: grid;
  gap: 1rem;
  margin-bottom: 2.5rem;
}

.goal {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  align-items: start;
  border: 1px solid color-mix(in srgb, var(--ink-faint) 35%, transparent);
  border-radius: 0.75rem;
  padding: 1rem;
  background: var(--pearl);
}

.bloom {
  line-height: 0;
}

.goalName {
  font-size: 1rem;
  color: var(--ink);
  font-weight: 500;
}

.goalAmount {
  font-size: 1.25rem;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  margin-top: 0.15rem;
}

.goalTarget {
  font-size: 0.9rem;
  color: var(--ink-soft);
  font-weight: 400;
}

.goalMeta {
  font-size: 0.85rem;
  color: var(--ink-soft);
  margin-top: 0.35rem;
}

.overdue {
  color: #b4553f;
}

.contribute,
.newGoalForm {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

.input {
  flex: 1 1 8rem;
  min-width: 0;
  padding: 0.6rem;
  font-size: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ink-faint);
  background: var(--pearl);
  color: var(--ink-body);
  font-family: inherit;
}

.addButton {
  padding: 0.6rem 1.1rem;
  border-radius: 0.5rem;
  border: none;
  background: var(--sea-near);
  color: var(--pearl);
  font-size: 1rem;
  cursor: pointer;
}

.sectionTitle {
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 0.75rem;
}
```

- [ ] **Step 3: Verify the goals page**

Run `npm run dev` and visit `/budget/goals`.

Expected: create a goal, add a contribution, and watch the Bloom's petals fill. With a screen reader or the accessibility inspector, confirm the Bloom announces real numbers rather than being silent.

- [ ] **Step 4: Commit**

```bash
git add "app/(private)/budget/goals"
git commit -m "Add the savings goals page

The Bloom carries an accessible label with the real numbers, so it is a
progress indicator rather than decoration that happens to move."
```

---

### Task 14: The landing page

**Files:**
- Modify: `app/page.tsx`, `app/scene.module.css` (rename to `app/landing.module.css`), `components/Hero.tsx`, `components/Corners.tsx`
- Delete: `public/scene-poster.jpg`

**Interfaces:**
- Consumes: `Sprig` from `components/florals/Sprig.tsx`
- Produces: nothing later tasks depend on

- [ ] **Step 1: Rename the stylesheet and update its imports**

```bash
git mv app/scene.module.css app/landing.module.css
grep -rln "scene.module.css" app components | xargs sed -i 's|scene\.module\.css|landing.module.css|g'
grep -rn "scene.module.css" app components
```

Expected: no matches remain.

- [ ] **Step 2: Replace the WebGL backdrop with florals in `app/page.tsx`**

```tsx
import { Corners } from "@/components/Corners";
import { Hero } from "@/components/Hero";
import { Sprig } from "@/components/florals/Sprig";
import florals from "@/components/florals/florals.module.css";
import styles from "./landing.module.css";

export default function Page() {
  return (
    <div className={styles.stage}>
      <Sprig className={`${florals.cornerSprig} ${florals.topLeft}`} />
      <Sprig className={`${florals.cornerSprig} ${florals.bottomRight}`} />

      <Corners />
      <Hero />
    </div>
  );
}
```

- [ ] **Step 3: Give the stage a gradient in `app/landing.module.css`**

Find the `.stage` rule and replace its background with:

```css
.stage {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(
    to bottom,
    var(--sky-zenith) 0%,
    var(--sky-upper) 22%,
    var(--sky-mid) 45%,
    var(--sky-low) 72%,
    var(--horizon) 100%
  );
}
```

Then delete any rules referencing the removed scene — search for leftovers:

```bash
grep -n "canvas\|poster\|webgl\|scene" app/landing.module.css
```

Remove whatever that turns up.

- [ ] **Step 4: Remove the orphaned poster image**

```bash
git rm public/scene-poster.jpg
```

- [ ] **Step 5: Verify the landing page and measure the win**

```bash
npm run build
```

Expected: the build succeeds, and the First Load JS for `/` is a small fraction of what it was — the Three.js bundle is gone.

Run `npm run dev` and check `http://localhost:3000` at 375px and 1440px widths. Expected: the gradient reads as sky, sprigs sit in opposite corners without crowding the type, and nothing scrolls horizontally.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Replace the 3D scene with a floral landing page

Same palette and type, a CSS gradient instead of a WebGL sky, and the
shared Sprig component so the public page and the budget tool read as
one design."
```

---

### Task 15: Deploy

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Set the production environment variables**

In the Vercel dashboard → Settings → Environment Variables, add for Production:

| Name | Value |
|---|---|
| `BETTER_AUTH_SECRET` | the same secret, or a fresh `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `https://<your-vercel-domain>` |
| `GOOGLE_CLIENT_ID` | from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud |
| `ALLOWED_EMAIL` | Nadya's Google address |

`DATABASE_URL` is already injected by the Neon integration.

- [ ] **Step 2: Add the production redirect URI to Google**

In Google Cloud Console → Credentials → your OAuth client, add:

```
https://<your-vercel-domain>/api/auth/callback/google
```

- [ ] **Step 3: Run the migration against production**

```bash
npx vercel env pull .env.production.local --environment production
DATABASE_URL=$(grep DATABASE_URL .env.production.local | cut -d= -f2- | tr -d '"') npm run db:migrate
```

Expected: migrations apply cleanly.

- [ ] **Step 4: Rewrite `README.md`**

````markdown
# Nadya's site

A public landing page plus a private, pay-period budget tool.

## Stack

Next.js 16 (App Router) · TypeScript · Drizzle ORM on Neon Postgres ·
Better Auth (Google) · Vitest

## Local development

```bash
npm install
npx vercel env pull .env.local   # pulls DATABASE_URL
npm run db:migrate
npm run dev
```

`.env.local` also needs `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `ALLOWED_EMAIL`.
See `.env.example`.

## Tests

```bash
npm test
```

The budget arithmetic in `lib/budget/` is pure — no database, no React, and
`today` is always passed in rather than read from the clock. That is what makes
it testable, and it should stay that way.

## How the budget works

Planning happens per **pay period** (14 days), not per calendar month, because
Nadya is paid biweekly plus a monthly commission check.

Categories come in two kinds:

- **Spending** envelopes fund day-to-day costs and are the only ones counted in
  the safe-to-spend-per-day figure.
- **Bill** envelopes accumulate a set-aside across checks so rent does not land
  on one paycheck all at once. The per-check share is `monthly × 12 / 26` —
  twelve bills a year over twenty-six checks, roughly 46%, not half.

Whether leftover money survives into the next period is the per-category
`carryover` flag. Balances are always derived from allocations minus
transactions, never stored, so they cannot drift.

## Access

Sign-in is Google, restricted to the single address in `ALLOWED_EMAIL`. Any
other account is rejected before a user row is created. `proxy.ts` is an
optimistic redirect only; `verifySession()` in `lib/dal.ts` is the real
gate and every data path goes through it.
````

- [ ] **Step 5: Deploy and verify**

```bash
git add README.md
git commit -m "Document the budget tool in the README"
git push
```

Then on the deployed URL:
1. Visit `/budget` signed out → redirected to `/signin`.
2. Sign in with Nadya's account → onboarding, then the budget.
3. Sign in with any other Google account → rejected, and no new `user` row.
4. Add an expense on a phone → the daily number updates.

- [ ] **Step 6: Final verification**

```bash
npm test && npx tsc --noEmit && npm run build
```

Expected: all tests pass, no type errors, build succeeds.

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: landing page → 14; pay
periods, paychecks, envelopes, carryover → 4, 5, 7, 9; safe-to-spend → 5; goals
→ 6, 13; florals → 11; auth, allowlist, proxy, DAL → 8; onboarding → 10;
testing → 1; Three.js removal → 1 and 14; deployment → 15.

**Deliberately not built**, per the spec's out-of-scope section: bank sync,
paystub parsing, CSV import, recurring transactions, charts, trend dashboards,
data export, and any second hub module.

**Known gap to watch during execution.** Task 9's `getPeriodData` loads all of
a user's transactions to compute carryover balances. At one person's volume
this is fine for years; if it ever matters, the fix is a SQL aggregate for
prior-period totals rather than a different data model.

**One deviation from the spec**, flagged for approval: the spec names Auth.js /
NextAuth, but this plan uses **Better Auth 1.7.4**. NextAuth v5 has been in
beta for years, while Better Auth is on a stable major, supports Next 16 in its
peer range, and pins the exact Drizzle version this project uses. The spec's
security architecture — allowlist, optimistic proxy, DAL as the real gate — is
unchanged.
