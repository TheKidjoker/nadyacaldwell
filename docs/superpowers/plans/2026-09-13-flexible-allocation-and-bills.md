# Flexible Allocation, Recurring Bills & Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Nadya enter her own bills at any recurrence, assign what is left across flexible envelopes with live feedback, and see what is due on a calendar — with nothing seeded and every number her own.

**Architecture:** Two new pure modules (`recurrence.ts`, `calendar.ts`) joined to the existing `calc.ts`, all operating on `'YYYY-MM-DD'` strings and integer cents with no clock reads. A schema change replaces the monthly-only bill target with `(cadence, recurring_amount_cents, due_anchor)` and adds a needs/wants/savings `bucket`. Three new screens — onboarding, assign, calendar — read through the existing `lib/db/queries.ts` and write through `lib/budget/actions.ts`, so the data layer boundary established in earlier work is preserved.

**Tech Stack:** Next.js 16.3.4 (App Router, Turbopack), React 19.2.8, TypeScript 5, Vitest 5, CSS Modules, Postgres (Neon) via Drizzle.

## Global Constraints

- **Source spec:** `docs/superpowers/specs/2026-09-13-flexible-allocation-and-bills-design.md`. It supersedes parts of `2026-09-13-nadya-budget-design.md`; where they disagree, the newer one wins.
- **Read the bundled Next.js docs before writing any component.** `node_modules/next/dist/docs/` — this is not the Next.js in your training data.
- **Money is always integer cents.** Never a float, never a formatted string, in any function signature or database column.
- **Calendar dates are always `'YYYY-MM-DD'` strings**, never `Date` objects, and go through `lib/budget/dates.ts`.
- **Pure modules must be clock-free.** `lib/budget/*.ts` other than `actions.ts` must never call `new Date()` with no argument. `today` is always a parameter. Tests that depend on the current date rot.
- **Nothing is seeded with an amount.** No default rent, no example grocery budget, no placeholder figures reaching the UI. Every dollar figure in this plan is test data.
- **Tests before implementation.** Every task with logic writes a failing test, runs it, sees it fail, then implements.
- **Existing style:** double-quoted strings, semicolons, named exports, numeric separators in test data (`120_000`). Match `lib/budget/calc.ts`.
- **Colour tokens come from `app/globals.css`** (`--ink`, `--ink-soft`, `--sea-near`, `--pearl`, …). Do not introduce new hex values except the existing overspend red `#b4553f`.

## Dependency boundary

**Tasks 1–6 are pure logic and can be built today.** They need no database and no auth.

**Tasks 7–14 require the original plan's Task 7 (Neon + Drizzle schema) and Task 8 (Better Auth + DAL) to be complete first.** Those are blocked on two things only Chance can do: attaching a Neon database in the Vercel dashboard, and creating a Google OAuth client. Do not start Task 7 of this plan until `DATABASE_URL` is present in `.env.local`.

## File structure

| File | Responsibility |
|---|---|
| `lib/budget/recurrence.ts` | **New.** Cadence enum, annualisation, per-check set-aside, occurrence generation. Pure. |
| `lib/budget/recurrence.test.ts` | **New.** |
| `lib/budget/calendar.ts` | **New.** Month grid construction. Pure. |
| `lib/budget/calendar.test.ts` | **New.** |
| `lib/budget/types.ts` | **Modify.** `Category` gains cadence/bucket fields; `EnvelopeBalance` and `PeriodSummary` grow. |
| `lib/budget/calc.ts` | **Modify.** `envelopeBalance` derives set-aside from cadence; `summarizePeriod` gains bucket totals. |
| `lib/budget/calc.test.ts` | **Modify.** |
| `lib/db/schema.ts` | **Modify.** New columns, `allocation_targets` table. |
| `lib/db/queries.ts` | **Modify.** Onboarding state, assign data, calendar data. |
| `lib/budget/actions.ts` | **Modify.** Bill creation with cadence, bulk allocation save, target save. |
| `app/(private)/onboarding/` | **New.** Three-step wizard. |
| `app/(private)/budget/assign/` | **New.** Live allocation screen. |
| `app/(private)/budget/calendar/` | **New.** Month grid page. |
| `components/budget/BillRow.tsx` | **New.** One editable bill row; used by onboarding. |
| `components/budget/AssignForm.tsx` | **New.** Client component holding the live allocation state. |
| `components/budget/BucketBars.tsx` | **New.** The 50/30/20 lens. |
| `lib/db/demo-store.ts` | **Delete** in Task 14. |

---

## Task 1: Cadence arithmetic

The foundation of every bill figure. A bill is entered as it actually arrives — weekly, monthly, every six months — and everything downstream works from an annual total divided by 26 paychecks.

**Files:**
- Create: `lib/budget/recurrence.ts`
- Test: `lib/budget/recurrence.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "annual"`
  - `PER_YEAR: Record<Cadence, number>`
  - `annualCents(amountCents: number, cadence: Cadence): number`
  - `perCheckSetAside(amountCents: number, cadence: Cadence): number`

- [ ] **Step 1: Write the failing tests**

Create `lib/budget/recurrence.test.ts`:

```ts
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
    // 100 * 12 / 26 = 46.15 -> 46
    expect(perCheckSetAside(100, "monthly")).toBe(46);
    // 200 * 12 / 26 = 92.3 -> 92
    expect(perCheckSetAside(200, "monthly")).toBe(92);
    // 150 * 12 / 26 = 69.2 -> 69
    expect(perCheckSetAside(150, "monthly")).toBe(69);
  });

  it("returns zero for a zero amount rather than NaN", () => {
    expect(perCheckSetAside(0, "annual")).toBe(0);
  });

  it("never returns a fractional cent", () => {
    for (const amount of [1, 7, 99, 1_234, 85_200]) {
      const r = perCheckSetAside(amount, "semiannual");
      expect(Number.isInteger(r)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./recurrence"`.

- [ ] **Step 3: Implement `lib/budget/recurrence.ts`**

```ts
/**
 * Recurring-bill arithmetic.
 *
 * A bill is stored as she receives it -- $160 weekly, $852 every six months --
 * and everything downstream works from the annual total. The per-paycheck
 * set-aside is annual / 26, of which the old monthly * 12 / 26 is one case.
 */

export type Cadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export const PER_YEAR: Record<Cadence, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

/** Twenty-six biweekly paychecks in a year. */
export const CHECKS_PER_YEAR = 26;

export function annualCents(amountCents: number, cadence: Cadence): number {
  return amountCents * PER_YEAR[cadence];
}

export function perCheckSetAside(
  amountCents: number,
  cadence: Cadence,
): number {
  return Math.round(annualCents(amountCents, cadence) / CHECKS_PER_YEAR);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all recurrence arithmetic tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/budget/recurrence.ts lib/budget/recurrence.test.ts
git commit -m "Add cadence arithmetic for recurring bills

A bill is stored as it actually arrives and normalised through an annual
total, so the per-check set-aside is annual / 26. The existing monthly
* 12 / 26 becomes the monthly case rather than a special path."
```

---

## Task 2: Occurrence generation

Due dates are informational — they never move money — but the calendar needs to know which days a bill lands on, and the assign screen wants the next one.

**Files:**
- Modify: `lib/budget/recurrence.ts`
- Test: `lib/budget/recurrence.test.ts` (append)

**Interfaces:**
- Consumes: `Cadence` from Task 1, `addDays`/`compareISO` from `lib/budget/dates.ts`
- Produces:
  - `nextOccurrence(anchor: ISODate, cadence: Cadence, onOrAfter: ISODate): ISODate`
  - `occurrencesBetween(anchor: ISODate, cadence: Cadence, from: ISODate, to: ISODate): ISODate[]`

- [ ] **Step 1: Write the failing tests**

Append to `lib/budget/recurrence.test.ts`:

```ts
import { nextOccurrence, occurrencesBetween } from "./recurrence";

describe("nextOccurrence — weekly and biweekly", () => {
  it("returns the anchor itself when it is already on or after the date", () => {
    expect(nextOccurrence("2026-09-14", "weekly", "2026-09-14")).toBe("2026-09-14");
  });

  it("steps forward a week at a time", () => {
    expect(nextOccurrence("2026-09-07", "weekly", "2026-09-14")).toBe("2026-09-14");
    expect(nextOccurrence("2026-09-07", "weekly", "2026-09-15")).toBe("2026-09-21");
  });

  it("steps forward a fortnight at a time", () => {
    expect(nextOccurrence("2026-09-07", "biweekly", "2026-09-15")).toBe("2026-09-21");
  });

  it("returns the anchor when the target is before it", () => {
    // A bill does not exist before its first occurrence.
    expect(nextOccurrence("2026-09-14", "weekly", "2026-08-01")).toBe("2026-09-14");
  });
});

describe("nextOccurrence — monthly and longer", () => {
  it("keeps the day of month", () => {
    expect(nextOccurrence("2026-09-01", "monthly", "2026-09-02")).toBe("2026-10-01");
  });

  it("clamps to the last day of a short month", () => {
    // 31 January -> February has 28 days in 2027.
    expect(nextOccurrence("2027-01-31", "monthly", "2027-02-01")).toBe("2027-02-28");
  });

  it("clamps to 29 February in a leap year", () => {
    expect(nextOccurrence("2028-01-31", "monthly", "2028-02-01")).toBe("2028-02-29");
  });

  it("returns to the anchor day after a clamped month", () => {
    // Clamping February must not permanently move the bill to the 28th.
    expect(nextOccurrence("2027-01-31", "monthly", "2027-03-01")).toBe("2027-03-31");
  });

  it("steps a quarter at a time", () => {
    expect(nextOccurrence("2026-01-15", "quarterly", "2026-02-01")).toBe("2026-04-15");
  });

  it("steps six months at a time", () => {
    expect(nextOccurrence("2026-03-10", "semiannual", "2026-04-01")).toBe("2026-09-10");
  });

  it("steps a year at a time", () => {
    expect(nextOccurrence("2026-06-30", "annual", "2026-07-01")).toBe("2027-06-30");
  });

  it("crosses a year boundary", () => {
    expect(nextOccurrence("2026-12-05", "monthly", "2026-12-06")).toBe("2027-01-05");
  });
});

describe("occurrencesBetween", () => {
  it("lists every weekly occurrence in a window", () => {
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-09-01", "2026-09-30")).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("includes both endpoints", () => {
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-09-07", "2026-09-14")).toEqual([
      "2026-09-07",
      "2026-09-14",
    ]);
  });

  it("returns nothing before the anchor", () => {
    // The bill did not exist yet.
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-08-01", "2026-08-31")).toEqual([]);
  });

  it("returns nothing for a window with no occurrence", () => {
    expect(occurrencesBetween("2026-01-15", "annual", "2026-03-01", "2026-03-31")).toEqual([]);
  });

  it("lists one monthly occurrence for a single month", () => {
    expect(occurrencesBetween("2026-01-03", "monthly", "2026-09-01", "2026-09-30")).toEqual([
      "2026-09-03",
    ]);
  });

  it("handles a month-end anchor across a short month", () => {
    expect(occurrencesBetween("2027-01-31", "monthly", "2027-02-01", "2027-04-30")).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });

  it("returns an empty array when the window is inverted", () => {
    expect(occurrencesBetween("2026-09-07", "weekly", "2026-09-30", "2026-09-01")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `nextOccurrence is not a function`.

- [ ] **Step 3: Implement occurrence generation**

Replace the top import line of `lib/budget/recurrence.ts` — it currently has none — by adding this as the first line of the file, above the doc comment's closing:

```ts
import { addDays, compareISO } from "./dates";
import type { ISODate } from "./dates";
```

Then append to `lib/budget/recurrence.ts`:

```ts
/** Cadences measured in whole days; the rest step by calendar months. */
const DAY_STEP: Partial<Record<Cadence, number>> = {
  weekly: 7,
  biweekly: 14,
};

/** Cadences measured in calendar months. */
const MONTH_STEP: Partial<Record<Cadence, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * Add whole calendar months, clamping to the end of a short month.
 *
 * A bill anchored on the 31st falls on the 28th in February, but the anchor
 * day is remembered rather than overwritten, so March returns to the 31st.
 */
function addMonthsClamped(anchor: ISODate, months: number): ISODate {
  const [y, m, d] = anchor.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function nextOccurrence(
  anchor: ISODate,
  cadence: Cadence,
  onOrAfter: ISODate,
): ISODate {
  // A bill has no occurrences before its anchor.
  if (compareISO(anchor, onOrAfter) >= 0) return anchor;

  const dayStep = DAY_STEP[cadence];
  if (dayStep !== undefined) {
    const MS_PER_DAY = 86_400_000;
    const elapsed = Math.round(
      (Date.parse(`${onOrAfter}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) /
        MS_PER_DAY,
    );
    const steps = Math.ceil(elapsed / dayStep);
    return addDays(anchor, steps * dayStep);
  }

  const monthStep = MONTH_STEP[cadence]!;
  // Walk forward a step at a time. Clamping makes arithmetic shortcuts wrong:
  // the 31st -> 28th -> 31st sequence is not a fixed stride.
  let candidate = anchor;
  let n = 0;
  while (compareISO(candidate, onOrAfter) < 0) {
    n += monthStep;
    candidate = addMonthsClamped(anchor, n);
  }
  return candidate;
}

export function occurrencesBetween(
  anchor: ISODate,
  cadence: Cadence,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  if (compareISO(from, to) > 0) return [];

  const out: ISODate[] = [];
  let current = nextOccurrence(anchor, cadence, from);

  while (compareISO(current, to) <= 0) {
    // nextOccurrence clamps to the anchor when `from` precedes it, so an
    // occurrence before the window start must be skipped rather than emitted.
    if (compareISO(current, from) >= 0) out.push(current);

    const dayStep = DAY_STEP[cadence];
    const next =
      dayStep !== undefined
        ? addDays(current, dayStep)
        : nextOccurrence(anchor, cadence, addDays(current, 1));

    // Guard against a cadence that fails to advance.
    if (compareISO(next, current) <= 0) break;
    current = next;
  }

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all occurrence tests green.

- [ ] **Step 5: Verify the clamping behaviour by hand**

Run: `npx tsx -e "import('./lib/budget/recurrence.ts').then(r => console.log(r.occurrencesBetween('2027-01-31','monthly','2027-01-01','2027-05-31')))"`

If `tsx` is unavailable, skip this step — the test at Step 1 covers it. Expected output includes `2027-02-28` followed by `2027-03-31`, confirming February does not permanently capture the bill.

- [ ] **Step 6: Commit**

```bash
git add lib/budget/recurrence.ts lib/budget/recurrence.test.ts
git commit -m "Generate bill occurrences from an anchor and cadence

Month-stepping walks one step at a time rather than computing a stride,
because clamping makes the stride non-uniform: a bill anchored on the
31st goes 31 -> 28 -> 31, and a fixed offset would strand it on the 28th."
```

---

## Task 3: Domain types for cadence and buckets

Types only, no logic. Doing this in one commit keeps the compiler honest for the two tasks that follow.

**Files:**
- Modify: `lib/budget/types.ts`
- Modify: `lib/db/demo-store.ts` (to keep compiling — it is deleted in Task 14)

**Interfaces:**
- Consumes: `Cadence` from `lib/budget/recurrence.ts`
- Produces: `Bucket`, updated `Category`, updated `EnvelopeBalance`, updated `PeriodSummary`, `AllocationTargets`, `BucketTotals`

- [ ] **Step 1: Rewrite the `Category` interface**

In `lib/budget/types.ts`, add to the imports at the top:

```ts
import type { Cadence } from "./recurrence";
```

Add the bucket type below the existing `PaycheckKind`:

```ts
export type Bucket = "needs" | "wants" | "savings";
```

Replace the whole `Category` interface with:

```ts
export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Needs/wants/savings, independent of kind. Groceries is spending + needs. */
  bucket: Bucket;
  /** Does leftover money survive into the next period? Always true for bills. */
  carryover: boolean;
  /** Bills only: how often the bill actually arrives. Null for spending. */
  cadence: Cadence | null;
  /** Bills only: the bill as she receives it, not a monthly equivalent. */
  recurringAmountCents: number | null;
  /** Bills only: one reference due date; the rest are generated from it. */
  dueAnchor: ISODate | null;
  color: string;
  sortOrder: number;
}
```

- [ ] **Step 2: Extend `EnvelopeBalance`**

Replace the `monthlyTargetCents`, `perCheckSetAsideCents` and `fullyFunded` fields of `EnvelopeBalance` with:

```ts
  bucket: Bucket;
  /** Bills only. */
  cadence: Cadence | null;
  /** Bills only: the bill as it will arrive. */
  recurringAmountCents: number | null;
  /** Bills only: round(annual / 26). */
  perCheckSetAsideCents: number | null;
  /** Bills only: can she pay the next occurrence in full? */
  fullyFunded: boolean | null;
  /** Bills only: the next due date on or after the period start. */
  nextDueOn: ISODate | null;
```

- [ ] **Step 3: Add bucket totals and targets**

Append to `lib/budget/types.ts`:

```ts
export interface AllocationTargets {
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
}

export interface BucketTotals {
  needsCents: number;
  wantsCents: number;
  savingsCents: number;
  /** 0..1, always summing to 1. */
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  targets: AllocationTargets;
  /** True when she assigned more than she was paid. */
  overAllocated: boolean;
}

export const DEFAULT_TARGETS: AllocationTargets = {
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
};
```

Add to `PeriodSummary`, after `safeToSpendPerDayCents`:

```ts
  buckets: BucketTotals;
```

- [ ] **Step 4: Update the demo fixture so the project compiles**

`lib/db/demo-store.ts` is scaffolding that Task 14 deletes. For now it must satisfy the new `Category` shape. In its `categories` array, replace every entry with the equivalent below — note **every amount is zero**, because nothing is seeded:

```ts
  categories: [
    { id: "cat-groceries", name: "Groceries", kind: "spending", bucket: "needs", carryover: false, cadence: null, recurringAmountCents: null, dueAnchor: null, color: "#9ac5e7", sortOrder: 0 },
    { id: "cat-gas", name: "Gas", kind: "spending", bucket: "needs", carryover: false, cadence: null, recurringAmountCents: null, dueAnchor: null, color: "#93bee0", sortOrder: 1 },
    { id: "cat-starbucks", name: "Starbucks", kind: "spending", bucket: "wants", carryover: false, cadence: null, recurringAmountCents: null, dueAnchor: null, color: "#bedcf2", sortOrder: 2 },
    { id: "cat-eating-out", name: "Eating out", kind: "spending", bucket: "wants", carryover: false, cadence: null, recurringAmountCents: null, dueAnchor: null, color: "#cadff0", sortOrder: 3 },
  ] as Category[],
```

Delete the `bills` entries entirely along with every allocation, transaction, paycheck, goal and contribution row — replace each of those arrays with `[]`. Also delete the now-unused `addDays`, `periodBoundsFrom`, `prior` and `current` helpers if TypeScript reports them unused, but keep `store.periods` as `[]`.

- [ ] **Step 5: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: errors in `lib/budget/calc.ts` referencing `monthlyTargetCents` — those are fixed in Task 4. **No errors in `types.ts` or `demo-store.ts`.**

- [ ] **Step 6: Commit**

```bash
git add lib/budget/types.ts lib/db/demo-store.ts
git commit -m "Replace the monthly bill target with cadence, and add buckets

A bill is now (cadence, recurringAmount, dueAnchor) rather than a monthly
figure she has to compute. Bucket is orthogonal to kind: groceries is
spending and a need; rent is a bill and a need.

The demo fixture is emptied rather than updated -- nothing is seeded, so
there are no amounts for it to hold."
```

---

## Task 4: Envelope balance from cadence

**Files:**
- Modify: `lib/budget/calc.ts`
- Modify: `lib/budget/calc.test.ts`

**Interfaces:**
- Consumes: `perCheckSetAside`, `nextOccurrence` from `lib/budget/recurrence.ts`; updated types from Task 3
- Produces: `envelopeBalance` with the same call signature, returning the extended `EnvelopeBalance`

- [ ] **Step 1: Update the test fixtures and add new cases**

In `lib/budget/calc.test.ts`, replace the `spending()` and `bill()` factories with:

```ts
function spending(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Groceries",
    kind: "spending",
    bucket: "needs",
    carryover: false,
    cadence: null,
    recurringAmountCents: null,
    dueAnchor: null,
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
    bucket: "needs",
    carryover: true,
    cadence: "monthly",
    recurringAmountCents: 120_000,
    dueAnchor: "2026-09-01",
    color: "#6ba1cd",
    sortOrder: 1,
    ...overrides,
  };
}
```

Replace the `describe("envelopeBalance — bill set-asides")` block entirely with:

```ts
describe("envelopeBalance — bill set-asides", () => {
  it("computes the per-check set-aside as monthly * 12 / 26, not half", () => {
    const r = envelopeBalance({
      category: bill(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBe(55_385);
    expect(r.perCheckSetAsideCents).not.toBe(60_000);
  });

  it("computes the set-aside for a weekly bill", () => {
    const r = envelopeBalance({
      category: bill({ cadence: "weekly", recurringAmountCents: 16_000 }),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBe(32_000);
  });

  it("computes the set-aside for a semiannual premium", () => {
    const r = envelopeBalance({
      category: bill({ cadence: "semiannual", recurringAmountCents: 85_200 }),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBe(6_554);
  });

  it("is fully funded only when it can pay the bill in full", () => {
    // Three checks of 55,385 = 166,155, which covers the 120,000 rent.
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

  it("is not fully funded at a sixth of a semiannual premium", () => {
    // The old monthly-target rule would have called 14,200 'funded'.
    const r = envelopeBalance({
      category: bill({ cadence: "semiannual", recurringAmountCents: 85_200 }),
      period,
      allocations: [alloc("p2", "c2", 14_200)],
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

  it("reports the next due date on or after the period start", () => {
    const r = envelopeBalance({
      category: bill({ dueAnchor: "2026-09-01", cadence: "monthly" }),
      period, // 2026-09-11 .. 2026-09-24
      allocations: [],
      transactions: [],
    });

    expect(r.nextDueOn).toBe("2026-10-01");
  });

  it("leaves every bill field null for spending categories", () => {
    const r = envelopeBalance({
      category: spending(),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.perCheckSetAsideCents).toBeNull();
    expect(r.fullyFunded).toBeNull();
    expect(r.nextDueOn).toBeNull();
    expect(r.cadence).toBeNull();
  });

  it("carries the bucket through", () => {
    const r = envelopeBalance({
      category: spending({ bucket: "wants" }),
      period,
      allocations: [],
      transactions: [],
    });

    expect(r.bucket).toBe("wants");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — type errors on `monthlyTargetCents`, and `r.nextDueOn` undefined.

- [ ] **Step 3: Update `envelopeBalance`**

In `lib/budget/calc.ts`, add to the imports:

```ts
import { nextOccurrence, perCheckSetAside } from "./recurrence";
```

Delete the local `CHECKS_PER_YEAR`, `MONTHS_PER_YEAR` constants and the local `perCheckSetAside` function — they now live in `recurrence.ts`.

Replace the `return` block of `envelopeBalance` with:

```ts
  const isBill = category.kind === "bill";
  const amount = category.recurringAmountCents;
  const cadence = category.cadence;
  const isFullBill = isBill && amount !== null && cadence !== null;

  return {
    categoryId: category.id,
    kind: category.kind,
    bucket: category.bucket,
    carryover: category.carryover,
    allocatedCents,
    carriedInCents,
    spentCents,
    remainingCents,
    pctUsed: availableCents > 0 ? spentCents / availableCents : 0,
    overspent: remainingCents < 0,
    cadence: isFullBill ? cadence : null,
    recurringAmountCents: isFullBill ? amount : null,
    perCheckSetAsideCents: isFullBill ? perCheckSetAside(amount, cadence) : null,
    // Funded means she can pay the bill as it will actually arrive, not that
    // she has saved a monthly slice of it.
    fullyFunded: isFullBill ? remainingCents >= amount : null,
    nextDueOn:
      isFullBill && category.dueAnchor !== null
        ? nextOccurrence(category.dueAnchor, cadence, period.startsOn)
        : null,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. `npx tsc --noEmit` still reports errors in the UI components — Task 5 and Task 14 clear those.

- [ ] **Step 5: Commit**

```bash
git add lib/budget/calc.ts lib/budget/calc.test.ts
git commit -m "Derive the bill set-aside from cadence

fullyFunded now asks whether she can pay the bill as it arrives rather
than whether she has saved a monthly slice. A 852.00 semiannual premium
used to read 'funded' at 142.00; it now waits for the full amount."
```

---

## Task 5: Bucket totals and the 50/30/20 lens

The lens measures **allocation, not spend** — how she is dividing this paycheck, which is a decision she can act on.

**Files:**
- Modify: `lib/budget/calc.ts`
- Test: `lib/budget/buckets.test.ts`

**Interfaces:**
- Consumes: `Bucket`, `BucketTotals`, `AllocationTargets`, `DEFAULT_TARGETS` from Task 3
- Produces: `summarizePeriod` gains a required `targets: AllocationTargets` input and returns `buckets: BucketTotals`

**Note on goal contributions.** They are deliberately **not** added to the savings bucket separately. Money she moves to a goal comes out of unallocated income, and unallocated income already counts as savings — adding both would count the same dollar twice. The three buckets must sum to exactly her income, and this is what makes that true.

- [ ] **Step 1: Write the failing tests**

Create `lib/budget/buckets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizePeriod } from "./calc";
import { DEFAULT_TARGETS } from "./types";
import type { Category, PayPeriod, Allocation, Paycheck } from "./types";

const period: PayPeriod = {
  id: "p1",
  startsOn: "2026-09-11",
  endsOn: "2026-09-24",
};

function cat(
  id: string,
  bucket: Category["bucket"],
  kind: Category["kind"] = "spending",
): Category {
  return {
    id,
    name: id,
    kind,
    bucket,
    carryover: kind === "bill",
    cadence: kind === "bill" ? "monthly" : null,
    recurringAmountCents: kind === "bill" ? 120_000 : null,
    dueAnchor: kind === "bill" ? "2026-09-01" : null,
    color: "#9ac5e7",
    sortOrder: 0,
  };
}

const alloc = (categoryId: string, amountCents: number): Allocation => ({
  payPeriodId: "p1",
  categoryId,
  amountCents,
});

const check = (amountCents: number): Paycheck => ({
  id: "k1",
  receivedOn: "2026-09-11",
  amountCents,
  kind: "base",
});

function run(
  categories: Category[],
  allocations: Allocation[],
  incomeCents: number,
) {
  return summarizePeriod({
    period,
    paychecks: [check(incomeCents)],
    categories,
    allocations,
    transactions: [],
    today: "2026-09-11",
    targets: DEFAULT_TARGETS,
  }).buckets;
}

describe("bucket totals", () => {
  it("sums allocations into their buckets", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 50_000), alloc("starbucks", 10_000)],
      100_000,
    );

    expect(b.needsCents).toBe(50_000);
    expect(b.wantsCents).toBe(10_000);
  });

  it("counts unallocated income as savings", () => {
    const b = run([cat("rent", "needs", "bill")], [alloc("rent", 60_000)], 100_000);

    // 100,000 income - 60,000 allocated = 40,000 unassigned, and unassigned
    // money is money she has not spent.
    expect(b.savingsCents).toBe(40_000);
  });

  it("adds savings-bucket allocations to unallocated income", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("transfer", "savings")],
      [alloc("rent", 50_000), alloc("transfer", 20_000)],
      100_000,
    );

    // 20,000 assigned to savings + 30,000 left unassigned
    expect(b.savingsCents).toBe(50_000);
  });

  it("makes the three buckets sum to exactly her income", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 55_000), alloc("starbucks", 12_500)],
      100_000,
    );

    expect(b.needsCents + b.wantsCents + b.savingsCents).toBe(100_000);
  });

  it("makes the percentages sum to one", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 55_000), alloc("starbucks", 12_500)],
      100_000,
    );

    expect(b.needsPct + b.wantsPct + b.savingsPct).toBeCloseTo(1, 10);
    expect(b.needsPct).toBeCloseTo(0.55, 10);
    expect(b.wantsPct).toBeCloseTo(0.125, 10);
    expect(b.savingsPct).toBeCloseTo(0.325, 10);
  });

  it("defaults the targets to 50/30/20", () => {
    const b = run([cat("rent", "needs", "bill")], [alloc("rent", 50_000)], 100_000);

    expect(b.targets.needsPct).toBe(50);
    expect(b.targets.wantsPct).toBe(30);
    expect(b.targets.savingsPct).toBe(20);
  });

  it("carries custom targets through", () => {
    const r = summarizePeriod({
      period,
      paychecks: [check(100_000)],
      categories: [cat("rent", "needs", "bill")],
      allocations: [alloc("rent", 50_000)],
      transactions: [],
      today: "2026-09-11",
      targets: { needsPct: 75, wantsPct: 10, savingsPct: 15 },
    });

    expect(r.buckets.targets.needsPct).toBe(75);
  });

  it("flags over-allocation and never reports negative savings", () => {
    const b = run(
      [cat("rent", "needs", "bill"), cat("starbucks", "wants")],
      [alloc("rent", 90_000), alloc("starbucks", 30_000)],
      100_000,
    );

    expect(b.overAllocated).toBe(true);
    expect(b.savingsCents).toBe(0);
    // Shares fall back to a portion of total allocation, so they still sum
    // to one rather than exceeding it.
    expect(b.needsPct + b.wantsPct + b.savingsPct).toBeCloseTo(1, 10);
    expect(b.needsPct).toBeCloseTo(0.75, 10);
  });

  it("reports all zeroes without dividing by zero when nothing exists yet", () => {
    const b = run([], [], 0);

    expect(b.needsCents).toBe(0);
    expect(b.wantsCents).toBe(0);
    expect(b.savingsCents).toBe(0);
    expect(b.needsPct).toBe(0);
    expect(b.wantsPct).toBe(0);
    expect(b.savingsPct).toBe(0);
    expect(b.overAllocated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot read properties of undefined (reading 'needsCents')`.

- [ ] **Step 3: Implement bucket totals**

In `lib/budget/calc.ts`, add to the type import from `./types`:

```ts
  AllocationTargets,
  Bucket,
  BucketTotals,
```

Add this helper immediately above `summarizePeriod`:

```ts
/**
 * Split this period's allocations into needs/wants/savings.
 *
 * Unallocated income counts as savings -- money she has not assigned is money
 * she has not spent -- which is also what makes the three buckets sum to
 * exactly her income, so the bars never leave an unexplained gap.
 *
 * Goal contributions are NOT added separately. They are funded out of
 * unallocated income, which is already counted here; adding them again would
 * count the same dollar twice.
 */
function bucketTotals(input: {
  categories: Category[];
  periodAllocations: Allocation[];
  incomeCents: number;
  targets: AllocationTargets;
}): BucketTotals {
  const { categories, periodAllocations, incomeCents, targets } = input;

  const bucketOf = new Map(categories.map((c) => [c.id, c.bucket]));
  const totalFor = (bucket: Bucket) =>
    sum(
      periodAllocations
        .filter((a) => bucketOf.get(a.categoryId) === bucket)
        .map((a) => a.amountCents),
    );

  const needsCents = totalFor("needs");
  const wantsCents = totalFor("wants");
  const savingsAllocated = totalFor("savings");

  const totalAllocated = sum(periodAllocations.map((a) => a.amountCents));
  const unallocated = incomeCents - totalAllocated;
  const overAllocated = unallocated < 0;

  const savingsCents = overAllocated
    ? savingsAllocated
    : savingsAllocated + unallocated;

  // When she has assigned more than she was paid there is no surplus to
  // measure against income, so the shares are of what she actually assigned.
  const denominator = overAllocated ? totalAllocated : incomeCents;
  const share = (cents: number) => (denominator > 0 ? cents / denominator : 0);

  return {
    needsCents,
    wantsCents,
    savingsCents,
    needsPct: share(needsCents),
    wantsPct: share(wantsCents),
    savingsPct: share(savingsCents),
    targets,
    overAllocated,
  };
}
```

Add `targets: AllocationTargets;` to the `summarizePeriod` input type and destructure it. Inside the function, after the `periodTxns` declaration, add:

```ts
  const periodAllocations = allocations.filter(
    (a) => a.payPeriodId === period.id,
  );
```

Replace the two inline `allocations.filter(...)` expressions in the returned object with `sum(periodAllocations.map((a) => a.amountCents))`, and add to the returned object:

```ts
    buckets: bucketTotals({
      categories,
      periodAllocations,
      incomeCents: baseCents + commissionCents,
      targets,
    }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for `buckets.test.ts`; `calc.test.ts` now fails to typecheck because its `summarizePeriod` calls lack `targets`.

- [ ] **Step 5: Fix the existing summarizePeriod tests**

In `lib/budget/calc.test.ts` add:

```ts
import { DEFAULT_TARGETS } from "./types";
```

and add `targets: DEFAULT_TARGETS,` to every `summarizePeriod({...})` call in that file.

Run: `npm test`
Expected: PASS, every test green.

- [ ] **Step 6: Verify one split by hand**

Income 100,000, needs 55,000, wants 12,500 → savings 32,500 and shares 0.55 / 0.125 / 0.325. Confirm the Step 1 test asserts exactly that.

- [ ] **Step 7: Commit**

```bash
git add lib/budget/calc.ts lib/budget/calc.test.ts lib/budget/buckets.test.ts
git commit -m "Add needs/wants/savings totals to the period summary

Unallocated income counts as savings, which is both true and what makes
the three buckets sum to exactly her income.

Goal contributions are not added separately: they are funded out of
unallocated income, so counting them again would double-count. Over-
allocation floors savings at zero and measures shares against what she
assigned, because a negative bar is not a thing."
```

---

## Task 6: The calendar grid

Pure layout logic, tested without a DOM.

**Files:**
- Create: `lib/budget/calendar.ts`
- Test: `lib/budget/calendar.test.ts`

**Interfaces:**
- Consumes: `occurrencesBetween` from `recurrence.ts`; `addDays`/`isWithin` from `dates.ts`; domain types
- Produces:
  - `interface DayBill { categoryId: string; name: string; amountCents: number }`
  - `interface DayCell { date: ISODate; inMonth: boolean; isToday: boolean; bills: DayBill[]; isPayday: boolean; isPeriodStart: boolean; isPeriodEnd: boolean; spentCents: number }`
  - `buildMonthGrid(input): DayCell[]` — always exactly 42 cells

- [ ] **Step 1: Write the failing tests**

Create `lib/budget/calendar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMonthGrid } from "./calendar";
import type { Category, PayPeriod, Paycheck, Transaction } from "./types";

const rent: Category = {
  id: "rent",
  name: "Rent",
  kind: "bill",
  bucket: "needs",
  carryover: true,
  cadence: "monthly",
  recurringAmountCents: 120_000,
  dueAnchor: "2026-09-01",
  color: "#6ba1cd",
  sortOrder: 0,
};

const groceries: Category = {
  id: "groceries",
  name: "Groceries",
  kind: "spending",
  bucket: "needs",
  carryover: false,
  cadence: null,
  recurringAmountCents: null,
  dueAnchor: null,
  color: "#9ac5e7",
  sortOrder: 1,
};

const period: PayPeriod = { id: "p1", startsOn: "2026-09-11", endsOn: "2026-09-24" };

const base = {
  year: 2026,
  month: 9,
  categories: [rent, groceries],
  paychecks: [] as Paycheck[],
  periods: [period],
  transactions: [] as Transaction[],
  today: "2026-09-14",
};

const cellFor = (grid: DayCellArray, date: string) =>
  grid.find((c) => c.date === date)!;

type DayCellArray = ReturnType<typeof buildMonthGrid>;

describe("buildMonthGrid — shape", () => {
  it("always returns six weeks of cells", () => {
    expect(buildMonthGrid(base)).toHaveLength(42);
    expect(buildMonthGrid({ ...base, year: 2026, month: 2 })).toHaveLength(42);
  });

  it("starts on a Sunday", () => {
    // 2026-09-01 is a Tuesday, so the grid opens on Sunday 2026-08-30.
    expect(buildMonthGrid(base)[0].date).toBe("2026-08-30");
  });

  it("marks which cells belong to the month", () => {
    const grid = buildMonthGrid(base);
    expect(cellFor(grid, "2026-08-30").inMonth).toBe(false);
    expect(cellFor(grid, "2026-09-01").inMonth).toBe(true);
    expect(cellFor(grid, "2026-09-30").inMonth).toBe(true);
    expect(cellFor(grid, "2026-10-01").inMonth).toBe(false);
  });

  it("marks today", () => {
    const grid = buildMonthGrid(base);
    expect(cellFor(grid, "2026-09-14").isToday).toBe(true);
    expect(cellFor(grid, "2026-09-13").isToday).toBe(false);
  });

  it("marks no cell as today when today is in another month", () => {
    expect(buildMonthGrid({ ...base, today: "2027-01-05" }).every((c) => !c.isToday)).toBe(true);
  });
});

describe("buildMonthGrid — bills", () => {
  it("places a monthly bill on its due date", () => {
    expect(cellFor(buildMonthGrid(base), "2026-09-01").bills).toEqual([
      { categoryId: "rent", name: "Rent", amountCents: 120_000 },
    ]);
  });

  it("leaves other days without bills", () => {
    expect(cellFor(buildMonthGrid(base), "2026-09-02").bills).toEqual([]);
  });

  it("places every occurrence of a weekly bill", () => {
    const daycare: Category = {
      ...rent,
      id: "daycare",
      name: "Daycare",
      cadence: "weekly",
      recurringAmountCents: 16_000,
      dueAnchor: "2026-09-07",
    };
    const grid = buildMonthGrid({ ...base, categories: [daycare] });

    for (const d of ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]) {
      expect(cellFor(grid, d).bills).toHaveLength(1);
    }
    expect(cellFor(grid, "2026-09-08").bills).toEqual([]);
  });

  it("ignores spending categories", () => {
    const grid = buildMonthGrid({ ...base, categories: [groceries] });
    expect(grid.every((c) => c.bills.length === 0)).toBe(true);
  });

  it("shows bills falling in the leading cells", () => {
    const grid = buildMonthGrid({
      ...base,
      categories: [{ ...rent, dueAnchor: "2026-08-30", cadence: "monthly" }],
    });
    expect(cellFor(grid, "2026-08-30").bills).toHaveLength(1);
  });
});

describe("buildMonthGrid — paydays, periods and spend", () => {
  it("marks a payday", () => {
    const grid = buildMonthGrid({
      ...base,
      paychecks: [{ id: "k1", receivedOn: "2026-09-11", amountCents: 140_000, kind: "base" }],
    });

    expect(cellFor(grid, "2026-09-11").isPayday).toBe(true);
    expect(cellFor(grid, "2026-09-12").isPayday).toBe(false);
  });

  it("marks period boundaries", () => {
    const grid = buildMonthGrid(base);
    expect(cellFor(grid, "2026-09-11").isPeriodStart).toBe(true);
    expect(cellFor(grid, "2026-09-24").isPeriodEnd).toBe(true);
    expect(cellFor(grid, "2026-09-15").isPeriodStart).toBe(false);
  });

  it("totals the spend on each day", () => {
    const grid = buildMonthGrid({
      ...base,
      transactions: [
        { id: "t1", categoryId: "groceries", occurredOn: "2026-09-12", amountCents: 4_250 },
        { id: "t2", categoryId: "groceries", occurredOn: "2026-09-12", amountCents: 1_100 },
        { id: "t3", categoryId: null, occurredOn: "2026-09-13", amountCents: 900 },
      ],
    });

    expect(cellFor(grid, "2026-09-12").spentCents).toBe(5_350);
    expect(cellFor(grid, "2026-09-13").spentCents).toBe(900);
    expect(cellFor(grid, "2026-09-14").spentCents).toBe(0);
  });

  it("handles a month with nothing in it at all", () => {
    const grid = buildMonthGrid({
      year: 2026,
      month: 11,
      categories: [],
      paychecks: [],
      periods: [],
      transactions: [],
      today: "2026-09-14",
    });

    expect(grid).toHaveLength(42);
    expect(grid.every((c) => c.bills.length === 0 && c.spentCents === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./calendar"`.

- [ ] **Step 3: Implement `lib/budget/calendar.ts`**

```ts
/**
 * Month-grid construction for the bill calendar.
 *
 * Pure: `today` is a parameter and the clock is never read, so these tests
 * cannot rot. Six weeks of cells are always returned so the grid does not
 * change height from month to month.
 */
import { addDays, isWithin } from "./dates";
import type { ISODate } from "./dates";
import { occurrencesBetween } from "./recurrence";
import type { Category, Paycheck, PayPeriod, Transaction } from "./types";

const CELLS = 42; // six weeks

export interface DayBill {
  categoryId: string;
  name: string;
  amountCents: number;
}

export interface DayCell {
  date: ISODate;
  inMonth: boolean;
  isToday: boolean;
  bills: DayBill[];
  isPayday: boolean;
  isPeriodStart: boolean;
  isPeriodEnd: boolean;
  spentCents: number;
}

function iso(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Day of week, 0 = Sunday, via UTC so it cannot drift with the viewer. */
function dayOfWeek(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function buildMonthGrid(input: {
  /** Four-digit year. */
  year: number;
  /** 1-12, not zero-based. */
  month: number;
  categories: Category[];
  paychecks: Paycheck[];
  periods: PayPeriod[];
  transactions: Transaction[];
  today: ISODate;
}): DayCell[] {
  const { year, month, categories, paychecks, periods, transactions, today } = input;

  const firstOfMonth = iso(year, month, 1);
  const gridStart = addDays(firstOfMonth, -dayOfWeek(firstOfMonth));
  const gridEnd = addDays(gridStart, CELLS - 1);
  const monthPrefix = firstOfMonth.slice(0, 7);

  // Index everything by date once rather than rescanning per cell.
  const billsByDate = new Map<ISODate, DayBill[]>();
  for (const c of categories) {
    if (c.kind !== "bill") continue;
    if (c.cadence === null || c.dueAnchor === null || c.recurringAmountCents === null) {
      continue;
    }
    for (const date of occurrencesBetween(c.dueAnchor, c.cadence, gridStart, gridEnd)) {
      const list = billsByDate.get(date) ?? [];
      list.push({ categoryId: c.id, name: c.name, amountCents: c.recurringAmountCents });
      billsByDate.set(date, list);
    }
  }

  const paydays = new Set(paychecks.map((p) => p.receivedOn));
  const periodStarts = new Set(periods.map((p) => p.startsOn));
  const periodEnds = new Set(periods.map((p) => p.endsOn));

  const spentByDate = new Map<ISODate, number>();
  for (const t of transactions) {
    if (!isWithin(t.occurredOn, gridStart, gridEnd)) continue;
    spentByDate.set(t.occurredOn, (spentByDate.get(t.occurredOn) ?? 0) + t.amountCents);
  }

  return Array.from({ length: CELLS }, (_, i) => {
    const date = addDays(gridStart, i);
    return {
      date,
      inMonth: date.startsWith(monthPrefix),
      isToday: date === today,
      bills: billsByDate.get(date) ?? [],
      isPayday: paydays.has(date),
      isPeriodStart: periodStarts.has(date),
      isPeriodEnd: periodEnds.has(date),
      spentCents: spentByDate.get(date) ?? 0,
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all calendar tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/budget/calendar.ts lib/budget/calendar.test.ts
git commit -m "Build the calendar month grid as pure logic

Always six weeks so the grid does not change height between months, and
clock-free so the tests cannot rot. Bills, paydays, period boundaries and
daily spend are indexed by date once rather than rescanned per cell."
```

---

## Task 7: Checkpoint — the pure layer is done, and the gate to the rest

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS. Tasks 1-6 add roughly 60 tests on top of the existing 56.

- [ ] **Step 2: Confirm no clock reads leaked into the pure modules**

Run: `grep -n "new Date()" lib/budget/*.ts`
Expected: **no matches.** `new Date(Date.UTC(...))` is fine; a bare `new Date()` is not.

- [ ] **Step 3: Confirm the typechecker is clean apart from the UI**

Run: `npx tsc --noEmit`
Expected: errors only in `app/` and `components/` files that read `monthlyTargetCents` or call `summarizePeriod` without `targets`. Fix those call sites now by passing `DEFAULT_TARGETS` and reading `recurringAmountCents`; the screens are rebuilt properly in Tasks 10-13.

- [ ] **Step 4: Commit the call-site fixes**

```bash
git add app components
git commit -m "Update existing screens for the new category shape"
```

- [ ] **Step 5: Gate on the database**

Run: `grep -c DATABASE_URL .env.local`

Expected `1` to continue. **If `0`, stop here and report that Tasks 8-14 are blocked**: Chance must attach a Neon database in the Vercel dashboard (Storage → Create Database → Neon) and run `npx vercel env pull .env.local`, and create a Google OAuth client. Tasks 8-14 also require the original plan's Task 7 (Drizzle schema) and Task 8 (Better Auth + DAL) to be complete.

---

# Part 2 — requires Neon and auth

Everything below needs `DATABASE_URL` present and the original plan's Task 7 (Drizzle schema) and Task 8 (Better Auth + DAL, `verifySession`) complete. Column names below assume that schema; adjust to match if it landed differently.

---

## Task 8: Schema for cadence, buckets and targets

**Files:**
- Modify: `lib/db/schema.ts`
- Create: migration via `npx drizzle-kit generate`

**Interfaces:**
- Consumes: the `categories` table from the original plan's Task 7
- Produces: `cadenceEnum`, `bucketEnum`, `allocationTargets` table

- [ ] **Step 1: Add the enums and columns**

In `lib/db/schema.ts`:

```ts
export const cadenceEnum = pgEnum("cadence", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);

export const bucketEnum = pgEnum("bucket", ["needs", "wants", "savings"]);
```

In the `categories` table, **remove** `monthlyTargetCents` and add:

```ts
  bucket: bucketEnum("bucket").notNull().default("wants"),
  cadence: cadenceEnum("cadence"),
  recurringAmountCents: integer("recurring_amount_cents"),
  dueAnchor: date("due_anchor"),
```

Add a table-level check constraint so a half-specified bill cannot exist:

```ts
}, (t) => ({
  billFieldsTogether: check(
    "bill_fields_together",
    sql`(${t.kind} = 'bill' AND ${t.cadence} IS NOT NULL AND ${t.recurringAmountCents} IS NOT NULL AND ${t.dueAnchor} IS NOT NULL)
        OR (${t.kind} = 'spending' AND ${t.cadence} IS NULL AND ${t.recurringAmountCents} IS NULL AND ${t.dueAnchor} IS NULL)`,
  ),
}));
```

Import `check` and `sql` from `drizzle-orm/pg-core` and `drizzle-orm` respectively.

- [ ] **Step 2: Add the targets table**

```ts
export const allocationTargets = pgTable("allocation_targets", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  needsPct: integer("needs_pct").notNull().default(50),
  wantsPct: integer("wants_pct").notNull().default(30),
  savingsPct: integer("savings_pct").notNull().default(20),
});
```

One row per user; the primary key on `user_id` enforces that without a separate unique index.

- [ ] **Step 3: Generate and apply the migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: a new SQL file under `drizzle/`, applied without error.

- [ ] **Step 4: Verify the check constraint actually bites**

```bash
npx drizzle-kit studio
```

Try inserting a category with `kind = 'bill'` and `cadence = NULL`. Expected: the insert is **rejected**. If it succeeds, the constraint did not apply — fix before continuing, because application-level validation alone was explicitly rejected in the spec.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle
git commit -m "Add cadence, bucket and allocation targets to the schema

A bill's three fields are constrained to be all-present or all-absent in
the database rather than only in application code, so a half-specified
bill cannot exist even if a future code path forgets."
```

---

## Task 9: Queries and actions for onboarding and assign

**Files:**
- Modify: `lib/db/queries.ts`
- Modify: `lib/budget/actions.ts`

**Interfaces:**
- Consumes: `verifySession` from the DAL, schema from Task 8
- Produces:
  - `getOnboardingState(): Promise<{ hasPeriod: boolean; bills: Category[]; spending: Category[] }>`
  - `getAssignData(periodId?): Promise<{ period, periods, categories, paychecks, allocations, transactions, targets } | null>`
  - `getCalendarData(year, month): Promise<{ categories, paychecks, periods, transactions }>`
  - Actions: `createBill(formData)`, `createSpendingCategory(formData)`, `saveAllocations(formData)`, `saveTargets(formData)`, `completeOnboarding(formData)`

- [ ] **Step 1: Add the read queries**

Append to `lib/db/queries.ts`, following the existing `getPeriodData` pattern of scoping every query to `verifySession().userId`:

```ts
export async function getOnboardingState() {
  const { userId } = await verifySession();

  const [periodRows, catRows] = await Promise.all([
    db.select().from(payPeriods).where(eq(payPeriods.userId, userId)).limit(1),
    db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.archivedAt)))
      .orderBy(asc(categories.sortOrder)),
  ]);

  const all = catRows.map(toCategory);

  return {
    hasPeriod: periodRows.length > 0,
    bills: all.filter((c) => c.kind === "bill"),
    spending: all.filter((c) => c.kind === "spending"),
  };
}

export async function getTargets(): Promise<AllocationTargets> {
  const { userId } = await verifySession();

  const rows = await db
    .select()
    .from(allocationTargets)
    .where(eq(allocationTargets.userId, userId))
    .limit(1);

  // No row yet means she has never edited them.
  return rows[0]
    ? { needsPct: rows[0].needsPct, wantsPct: rows[0].wantsPct, savingsPct: rows[0].savingsPct }
    : DEFAULT_TARGETS;
}

export async function getAssignData(periodId?: string) {
  const data = await getPeriodData(periodId);
  if (!data) return null;
  return { ...data, targets: await getTargets() };
}

export async function getCalendarData(year: number, month: number) {
  const { userId } = await verifySession();

  const [cats, checks, periods, txns] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.archivedAt))),
    db.select().from(paychecks).where(eq(paychecks.userId, userId)),
    db.select().from(payPeriods).where(eq(payPeriods.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
  ]);

  return {
    categories: cats.map(toCategory),
    paychecks: checks.map(toPaycheck),
    periods: periods.map(toPeriod),
    transactions: txns.map(toTransaction),
  };
}
```

Update `toCategory` to map the new columns, and delete its `monthlyTargetCents` line:

```ts
const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  bucket: r.bucket,
  carryover: r.carryover,
  cadence: r.cadence,
  recurringAmountCents: r.recurringAmountCents,
  dueAnchor: r.dueAnchor,
  color: r.color,
  sortOrder: r.sortOrder,
});
```

- [ ] **Step 2: Replace `createCategory` with two explicit actions**

In `lib/budget/actions.ts`, delete `createCategory` and add:

```ts
const CADENCES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;

export async function createBill(formData: FormData) {
  const { userId } = await verifySession();

  const cadence = String(formData.get("cadence"));
  if (!CADENCES.includes(cadence as (typeof CADENCES)[number])) {
    throw new Error("Unknown cadence");
  }

  await db.insert(categories).values({
    userId,
    name: text(formData.get("name"), 60),
    kind: "bill",
    // Bills always carry over: a part-funded bill envelope is meaningless if
    // it resets every payday.
    carryover: true,
    bucket: "needs",
    cadence: cadence as (typeof CADENCES)[number],
    recurringAmountCents: toCents(formData.get("amount")),
    dueAnchor: isoDate(formData.get("dueAnchor")),
    color: String(formData.get("color") || "#6ba1cd"),
    sortOrder: Number(formData.get("sortOrder") || 0),
  });

  revalidatePath("/onboarding");
  revalidatePath("/budget");
}

export async function createSpendingCategory(formData: FormData) {
  const { userId } = await verifySession();

  await db.insert(categories).values({
    userId,
    name: text(formData.get("name"), 60),
    kind: "spending",
    carryover: formData.get("carryover") === "on",
    bucket: "wants",
    cadence: null,
    recurringAmountCents: null,
    dueAnchor: null,
    color: String(formData.get("color") || "#93bee0"),
    sortOrder: Number(formData.get("sortOrder") || 0),
  });

  revalidatePath("/onboarding");
  revalidatePath("/budget");
}
```

- [ ] **Step 3: Add the bulk allocation save**

The assign screen submits every flexible envelope at once, so one action writes them all rather than one request per envelope:

```ts
export async function saveAllocations(formData: FormData) {
  const { userId } = await verifySession();

  const payPeriodId = String(formData.get("payPeriodId"));

  const owned = await db
    .select({ id: payPeriods.id })
    .from(payPeriods)
    .where(and(eq(payPeriods.id, payPeriodId), eq(payPeriods.userId, userId)));
  if (owned.length === 0) throw new Error("Unknown pay period");

  const ownedCategories = new Set(
    (
      await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.userId, userId))
    ).map((c) => c.id),
  );

  // Inputs are named `amount:<categoryId>`.
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("amount:")) continue;
    const categoryId = key.slice("amount:".length);
    if (!ownedCategories.has(categoryId)) throw new Error("Unknown category");

    await db
      .insert(allocations)
      .values({ payPeriodId, categoryId, amountCents: toCents(value) })
      .onConflictDoUpdate({
        target: [allocations.payPeriodId, allocations.categoryId],
        set: { amountCents: toCents(value) },
      });
  }

  revalidatePath("/budget");
  revalidatePath("/budget/assign");
}

export async function saveTargets(formData: FormData) {
  const { userId } = await verifySession();

  const needsPct = Number(formData.get("needsPct"));
  const wantsPct = Number(formData.get("wantsPct"));
  const savingsPct = Number(formData.get("savingsPct"));

  if (![needsPct, wantsPct, savingsPct].every(Number.isInteger)) {
    throw new Error("Targets must be whole percentages");
  }
  // A reference line that does not add up is worse than no reference line.
  if (needsPct + wantsPct + savingsPct !== 100) {
    throw new Error("Targets must sum to 100");
  }

  await db
    .insert(allocationTargets)
    .values({ userId, needsPct, wantsPct, savingsPct })
    .onConflictDoUpdate({
      target: allocationTargets.userId,
      set: { needsPct, wantsPct, savingsPct },
    });

  revalidatePath("/budget/assign");
}
```

- [ ] **Step 4: Verify against the database**

Run `npm run dev`, sign in, and call `createBill` from the onboarding form built in Task 11. Until then, verify by inserting through `npx drizzle-kit studio` that a bill row with all three fields is accepted and a spending row with a cadence is rejected.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts lib/budget/actions.ts
git commit -m "Add queries and actions for onboarding, assign and calendar

createCategory splits into createBill and createSpendingCategory: the two
have different required fields, and one function taking a kind flag would
have to validate which half of its arguments to trust.

saveAllocations writes every envelope in one action, because the assign
screen is a single form and one request per envelope would let a partial
save leave her budget inconsistent."
```

---

## Task 10: Onboarding step 1 — her last paycheck

**Files:**
- Create: `app/(private)/onboarding/page.tsx`, `app/(private)/onboarding/onboarding.module.css`
- Modify: `lib/budget/actions.ts`

**Interfaces:**
- Consumes: `getOnboardingState`, `logPaycheck`, `periodBoundsFrom`
- Produces: `startFirstPeriod(formData)` — creates the first pay period and its paycheck together

- [ ] **Step 1: Add the action**

In `lib/budget/actions.ts`:

```ts
export async function startFirstPeriod(formData: FormData) {
  const { userId } = await verifySession();

  const receivedOn = isoDate(formData.get("receivedOn"));
  const amountCents = toCents(formData.get("amount"));
  const kind = String(formData.get("kind"));
  if (kind !== "base" && kind !== "commission") throw new Error("Unknown kind");

  const bounds = periodBoundsFrom(receivedOn);

  const [period] = await db
    .insert(payPeriods)
    .values({ userId, startsOn: bounds.startsOn, endsOn: bounds.endsOn })
    .returning();

  await db.insert(paychecks).values({ userId, receivedOn, amountCents, kind });

  revalidatePath("/onboarding");
  return period.id;
}
```

- [ ] **Step 2: Build the step-1 form**

`app/(private)/onboarding/page.tsx` renders whichever step is outstanding, so a half-finished setup resumes where she left off:

```tsx
import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/db/queries";
import { startFirstPeriod } from "@/lib/budget/actions";
import { BillsStep } from "@/components/budget/BillsStep";
import { SpendingStep } from "@/components/budget/SpendingStep";
import styles from "./onboarding.module.css";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const state = await getOnboardingState();

  if (!state.hasPeriod) {
    return (
      <main className={styles.page}>
        <p className={styles.stepOf}>Step 1 of 3</p>
        <h1 className={styles.title}>When were you last paid?</h1>
        <p className={styles.lede}>
          This sets up your first two-week period. Everything else follows from it.
        </p>

        <form action={startFirstPeriod} className={styles.form}>
          <label className={styles.label}>
            Date
            <input type="date" name="receivedOn" required className={styles.input} />
          </label>

          <label className={styles.label}>
            Amount
            <input
              type="number"
              name="amount"
              step="0.01"
              min="0"
              placeholder="0.00"
              inputMode="decimal"
              required
              className={styles.input}
            />
          </label>

          <fieldset className={styles.choice}>
            <legend className={styles.label}>What kind?</legend>
            <label>
              <input type="radio" name="kind" value="base" defaultChecked /> Base pay
            </label>
            <label>
              <input type="radio" name="kind" value="commission" /> Commission
            </label>
          </fieldset>

          <button type="submit" className={styles.primary}>
            Next
          </button>
        </form>
      </main>
    );
  }

  if (step !== "spending") {
    return <BillsStep bills={state.bills} />;
  }

  if (state.spending.length > 0 && step === "done") redirect("/budget/assign");

  return <SpendingStep existing={state.spending} />;
}
```

- [ ] **Step 3: Write the stylesheet**

`app/(private)/onboarding/onboarding.module.css`:

```css
.page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 2rem 1rem 5rem;
}

.stepOf {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.title {
  margin-top: 0.5rem;
  font-size: clamp(1.5rem, 6vw, 2rem);
  color: var(--ink);
  font-weight: 500;
}

.lede {
  margin-top: 0.5rem;
  color: var(--ink-body);
  font-size: 0.95rem;
}

.form {
  display: grid;
  gap: 1rem;
  margin-top: 2rem;
}

.label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.input {
  padding: 0.7rem 0.6rem;
  font-size: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ink-faint);
  background: var(--pearl);
  color: var(--ink-body);
  font-family: inherit;
  min-width: 0;
}

.choice {
  display: grid;
  gap: 0.4rem;
  border: none;
  padding: 0;
  margin: 0;
  color: var(--ink-body);
  font-size: 0.95rem;
}

.primary {
  justify-self: start;
  padding: 0.7rem 1.6rem;
  border-radius: 999px;
  border: none;
  background: var(--sea-near);
  color: var(--pearl);
  font-size: 1rem;
  cursor: pointer;
}

.secondary {
  background: none;
  border: none;
  color: var(--ink-soft);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}
```

- [ ] **Step 4: Verify in the browser**

Run `npm run dev`, sign in, visit `/onboarding`. Enter a date and amount. Expected: the page advances to the bills step, and `payPeriods` has exactly one row whose `endsOn` is 13 days after `startsOn`.

- [ ] **Step 5: Commit**

```bash
git add "app/(private)/onboarding" lib/budget/actions.ts
git commit -m "Add onboarding step one: her last paycheck

The period and its paycheck are created in one action, because a period
with no paycheck has nothing to allocate and would strand her on a screen
with an income of zero."
```

---

## Task 11: Onboarding step 2 — her bills

The moment the app's central idea becomes legible: she types "160 weekly" and sees "$320.00 per paycheck" appear.

**Files:**
- Create: `components/budget/BillsStep.tsx`, `components/budget/BillRow.tsx`

**Interfaces:**
- Consumes: `createBill`, `perCheckSetAside`, `formatCents`
- Produces: `<BillsStep bills={Category[]} />`

- [ ] **Step 1: Build the live bill row**

`components/budget/BillRow.tsx` — a client component so the derived figure updates as she types:

```tsx
"use client";

import { useState } from "react";
import { perCheckSetAside } from "@/lib/budget/recurrence";
import type { Cadence } from "@/lib/budget/recurrence";
import { formatCents } from "@/lib/budget/format";
import { createBill } from "@/lib/budget/actions";
import styles from "@/app/(private)/onboarding/onboarding.module.css";

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "every week" },
  { value: "biweekly", label: "every two weeks" },
  { value: "monthly", label: "every month" },
  { value: "quarterly", label: "every three months" },
  { value: "semiannual", label: "every six months" },
  { value: "annual", label: "every year" },
];

export function BillRow({ suggestedName }: { suggestedName?: string }) {
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");

  const cents = Math.round(Number(amount) * 100);
  const perCheck =
    Number.isFinite(cents) && cents > 0 ? perCheckSetAside(cents, cadence) : null;

  return (
    <form action={createBill} className={styles.billRow}>
      <input
        name="name"
        defaultValue={suggestedName}
        placeholder="What is it?"
        required
        maxLength={60}
        aria-label="Bill name"
        className={styles.input}
      />
      <input
        type="number"
        name="amount"
        step="0.01"
        min="0"
        placeholder="0.00"
        inputMode="decimal"
        required
        aria-label="Amount"
        className={styles.input}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <select
        name="cadence"
        aria-label="How often"
        className={styles.input}
        value={cadence}
        onChange={(e) => setCadence(e.target.value as Cadence)}
      >
        {CADENCES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="dueAnchor"
        required
        aria-label="Next due"
        className={styles.input}
      />

      <p className={styles.derived} aria-live="polite">
        {perCheck === null
          ? " "
          : `${formatCents(perCheck)} set aside per paycheck`}
      </p>

      <button type="submit" className={styles.primary}>
        Add
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Build the step**

`components/budget/BillsStep.tsx`:

```tsx
import Link from "next/link";
import { perCheckSetAside } from "@/lib/budget/recurrence";
import { formatCents } from "@/lib/budget/format";
import type { Category } from "@/lib/budget/types";
import { BillRow } from "./BillRow";
import styles from "@/app/(private)/onboarding/onboarding.module.css";

// Names only. No amounts -- an app that guesses her rent is worse than one
// that asks, because she would have to audit every line to find the real ones.
const SUGGESTED = ["Rent", "Daycare", "Car note", "Car insurance"];

export function BillsStep({ bills }: { bills: Category[] }) {
  const nextSuggestion = SUGGESTED.find(
    (name) => !bills.some((b) => b.name.toLowerCase() === name.toLowerCase()),
  );

  return (
    <main className={styles.page}>
      <p className={styles.stepOf}>Step 2 of 3</p>
      <h1 className={styles.title}>What do you pay every month?</h1>
      <p className={styles.lede}>
        Enter each bill the way it actually arrives &mdash; weekly, monthly, twice a
        year. We work out what to set aside from each paycheck.
      </p>

      {bills.length > 0 && (
        <ul className={styles.added}>
          {bills.map((b) => (
            <li key={b.id} className={styles.addedItem}>
              <span>{b.name}</span>
              <span className={styles.addedAmount}>
                {formatCents(b.recurringAmountCents!)} {b.cadence}
                {" · "}
                {formatCents(perCheckSetAside(b.recurringAmountCents!, b.cadence!))} per check
              </span>
            </li>
          ))}
        </ul>
      )}

      <BillRow key={bills.length} suggestedName={nextSuggestion} />

      <Link href="/onboarding?step=spending" className={styles.secondary}>
        {bills.length > 0 ? "Done with bills" : "Skip for now"}
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Add the row styles**

Append to `app/(private)/onboarding/onboarding.module.css`:

```css
.billRow {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
  margin: 1.5rem 0 1rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background: var(--pearl);
  border: 1px solid color-mix(in srgb, var(--ink-faint) 35%, transparent);
}

.derived {
  min-height: 1.2em;
  font-size: 0.85rem;
  color: var(--sea-near);
  font-variant-numeric: tabular-nums;
}

.added {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
  display: grid;
  gap: 0.5rem;
}

.addedItem {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.9rem;
  color: var(--ink);
}

.addedAmount {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

@media (min-width: 32rem) {
  .billRow {
    grid-template-columns: 1.4fr 1fr 1.2fr 1fr;
    align-items: end;
  }

  .derived {
    grid-column: 1 / -2;
  }
}
```

- [ ] **Step 4: Verify the derived figure updates live**

Run `npm run dev`, visit `/onboarding`, reach step 2. Type `160` and choose "every week". Expected: **"$320.00 set aside per paycheck"** appears without submitting. Change the cadence to "every month" — expected **$73.85**.

Check the arithmetic by hand once: 160 × 52 ÷ 26 = 320 exactly; 160 × 12 ÷ 26 = 73.85.

- [ ] **Step 5: Commit**

```bash
git add components/budget/BillRow.tsx components/budget/BillsStep.tsx "app/(private)/onboarding"
git commit -m "Add onboarding step two: her bills, with the set-aside shown live

The per-paycheck figure appears as she types rather than on a later
screen, because it is the one idea the whole tool rests on and she should
meet it in the first minute.

Suggested names carry no amounts. A budget pre-filled with a guess at her
rent is worse than an empty one."
```

---

## Task 12: Onboarding step 3 and the assign screen

**Files:**
- Create: `components/budget/SpendingStep.tsx`, `components/budget/AssignForm.tsx`, `components/budget/BucketBars.tsx`
- Create: `app/(private)/budget/assign/page.tsx`, `app/(private)/budget/assign/assign.module.css`

**Interfaces:**
- Consumes: `getAssignData`, `saveAllocations`, `summarizePeriod`, `envelopeBalance`, `formatCents`
- Produces: the screen she lands on after onboarding

- [ ] **Step 1: Build the spending step**

`components/budget/SpendingStep.tsx` — names only, no amounts, because asking her to invent a grocery budget before she can see what is left is asking her to guess:

```tsx
import Link from "next/link";
import { createSpendingCategory } from "@/lib/budget/actions";
import type { Category } from "@/lib/budget/types";
import styles from "@/app/(private)/onboarding/onboarding.module.css";

const SUGGESTED = ["Groceries", "Gas", "Starbucks", "Eating out"];

export function SpendingStep({ existing }: { existing: Category[] }) {
  const remaining = SUGGESTED.filter(
    (name) => !existing.some((c) => c.name.toLowerCase() === name.toLowerCase()),
  );

  return (
    <main className={styles.page}>
      <p className={styles.stepOf}>Step 3 of 3</p>
      <h1 className={styles.title}>What do you spend on?</h1>
      <p className={styles.lede}>
        Just the names for now. You will set the amounts on the next screen,
        where you can see what is left after bills.
      </p>

      {existing.length > 0 && (
        <ul className={styles.added}>
          {existing.map((c) => (
            <li key={c.id} className={styles.addedItem}>
              <span>{c.name}</span>
            </li>
          ))}
        </ul>
      )}

      <form action={createSpendingCategory} className={styles.form}>
        <input
          name="name"
          defaultValue={remaining[0]}
          placeholder="Add a category"
          required
          maxLength={60}
          aria-label="Category name"
          className={styles.input}
        />
        <button type="submit" className={styles.primary}>
          Add
        </button>
      </form>

      <Link href="/budget/assign" className={styles.secondary}>
        {existing.length > 0 ? "Done" : "Skip for now"}
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Build the bucket bars**

`components/budget/BucketBars.tsx` — reports, never scores:

```tsx
import type { BucketTotals } from "@/lib/budget/types";
import { formatCents } from "@/lib/budget/format";
import styles from "@/app/(private)/budget/assign/assign.module.css";

const ROWS = [
  { key: "needs", label: "Needs" },
  { key: "wants", label: "Wants" },
  { key: "savings", label: "Savings" },
] as const;

export function BucketBars({ buckets }: { buckets: BucketTotals }) {
  return (
    <section className={styles.buckets}>
      <h2 className={styles.sectionTitle}>How this paycheck splits</h2>

      {ROWS.map(({ key, label }) => {
        const pct = buckets[`${key}Pct`];
        const cents = buckets[`${key}Cents`];
        const target = buckets.targets[`${key}Pct`];

        return (
          <div key={key} className={styles.bucketRow}>
            <span className={styles.bucketLabel}>{label}</span>

            <div className={styles.bucketTrack}>
              <div
                className={styles.bucketFill}
                style={{ width: `${Math.min(100, pct * 100)}%` }}
              />
              {/* A reference line, not a pass mark. */}
              <div className={styles.bucketTarget} style={{ left: `${target}%` }} />
            </div>

            <span className={styles.bucketValue}>
              {Math.round(pct * 100)}%
              <span className={styles.bucketCents}>{formatCents(cents)}</span>
            </span>
          </div>
        );
      })}

      <p className={styles.bucketsNote}>
        The marks are your targets of {buckets.targets.needsPct}/
        {buckets.targets.wantsPct}/{buckets.targets.savingsPct}.
        {buckets.overAllocated && " You have assigned more than you were paid."}
      </p>
    </section>
  );
}
```

**No red state and no congratulation.** The needs bar will sit above its mark for as long as she has a child and a car, and that is arithmetic rather than behaviour.

- [ ] **Step 3: Build the live assign form**

`components/budget/AssignForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { saveAllocations } from "@/lib/budget/actions";
import { formatCents } from "@/lib/budget/format";
import type { Category, EnvelopeBalance } from "@/lib/budget/types";
import styles from "@/app/(private)/budget/assign/assign.module.css";

export function AssignForm({
  payPeriodId,
  flexible,
  initial,
  incomeCents,
  billsTotalCents,
  daysRemaining,
}: {
  payPeriodId: string;
  flexible: { category: Category; balance: EnvelopeBalance }[];
  initial: Record<string, number>;
  incomeCents: number;
  billsTotalCents: number;
  daysRemaining: number;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      flexible.map((f) => [f.category.id, ((initial[f.category.id] ?? 0) / 100).toFixed(2)]),
    ),
  );

  const assignedCents = Object.values(amounts).reduce((total, v) => {
    const cents = Math.round(Number(v) * 100);
    return total + (Number.isFinite(cents) ? cents : 0);
  }, 0);

  const leftToAssign = incomeCents - billsTotalCents - assignedCents;
  const perDay = daysRemaining > 0 ? Math.floor(assignedCents / daysRemaining) : null;

  return (
    <form action={saveAllocations} className={styles.assign}>
      <input type="hidden" name="payPeriodId" value={payPeriodId} />

      {flexible.map(({ category }) => (
        <label key={category.id} className={styles.assignRow}>
          <span className={styles.assignName}>{category.name}</span>
          <input
            type="number"
            name={`amount:${category.id}`}
            step="0.01"
            min="0"
            inputMode="decimal"
            className={styles.assignInput}
            value={amounts[category.id]}
            onChange={(e) =>
              setAmounts((prev) => ({ ...prev, [category.id]: e.target.value }))
            }
          />
        </label>
      ))}

      <div className={styles.totals} aria-live="polite">
        <p className={leftToAssign < 0 ? styles.leftOver : styles.left}>
          {formatCents(Math.abs(leftToAssign))}{" "}
          {leftToAssign < 0 ? "over" : "left to assign"}
        </p>
        {perDay !== null && (
          <p className={styles.perDay}>
            {formatCents(perDay)} a day for {daysRemaining}{" "}
            {daysRemaining === 1 ? "day" : "days"}
          </p>
        )}
      </div>

      <button type="submit" className={styles.primary}>
        Save
      </button>
    </form>
  );
}
```

Nothing here edits a number she did not type. Only `leftToAssign` and `perDay` move.

- [ ] **Step 4: Build the page**

`app/(private)/budget/assign/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAssignData } from "@/lib/db/queries";
import { summarizePeriod } from "@/lib/budget/calc";
import { formatCents } from "@/lib/budget/format";
import { AssignForm } from "@/components/budget/AssignForm";
import { BucketBars } from "@/components/budget/BucketBars";
import styles from "./assign.module.css";

export default async function AssignPage() {
  const data = await getAssignData();
  if (!data) redirect("/onboarding");

  const today = new Date().toISOString().slice(0, 10);
  const summary = summarizePeriod({ ...data, today, targets: data.targets });

  const byId = new Map(data.categories.map((c) => [c.id, c]));
  const bills = summary.envelopes.filter((e) => e.kind === "bill");
  const flexible = summary.envelopes
    .filter((e) => e.kind === "spending")
    .map((balance) => ({ category: byId.get(balance.categoryId)!, balance }));

  const billsTotalCents = bills.reduce(
    (total, b) => total + (b.perCheckSetAsideCents ?? 0),
    0,
  );

  const initial = Object.fromEntries(
    data.allocations
      .filter((a) => a.payPeriodId === data.period.id)
      .map((a) => [a.categoryId, a.amountCents]),
  );

  return (
    <main className={styles.page}>
      <nav className={styles.topNav}>
        <Link href="/">&larr; Home</Link>
        <Link href="/budget">Budget</Link>
      </nav>

      <h1 className={styles.title}>Assign this paycheck</h1>
      <p className={styles.income}>{formatCents(summary.incomeCents)} came in</p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Bills, set aside for you</h2>
        <ul className={styles.bills}>
          {bills.map((b) => (
            <li key={b.categoryId} className={styles.billItem}>
              <span>{byId.get(b.categoryId)!.name}</span>
              <span className={styles.billMeta}>
                {formatCents(b.recurringAmountCents!)} {b.cadence}
                {b.nextDueOn && ` · due ${b.nextDueOn}`}
              </span>
              <span className={styles.billAmount}>
                {formatCents(b.perCheckSetAsideCents!)}
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.billsTotal}>
          {formatCents(billsTotalCents)} off the top
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The rest is yours</h2>
        <AssignForm
          payPeriodId={data.period.id}
          flexible={flexible}
          initial={initial}
          incomeCents={summary.incomeCents}
          billsTotalCents={billsTotalCents}
          daysRemaining={summary.daysRemaining}
        />
      </section>

      <BucketBars buckets={summary.buckets} />
    </main>
  );
}
```

- [ ] **Step 5: Write `assign.module.css`**

Reuse the tokens and shapes from `budget.module.css` — `.page`, `.topNav`, `.sectionTitle`, `.primary` follow the same rules already established there. Add:

```css
.assignRow {
  display: grid;
  grid-template-columns: 1fr 8rem;
  gap: 0.75rem;
  align-items: center;
  padding: 0.6rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ink-faint) 25%, transparent);
}

.assignInput {
  padding: 0.6rem;
  font-size: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ink-faint);
  background: var(--pearl);
  color: var(--ink-body);
  text-align: right;
  font-variant-numeric: tabular-nums;
  min-width: 0;
}

.totals {
  margin-top: 1rem;
  text-align: right;
}

.left,
.leftOver {
  font-size: 1.4rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.left {
  color: var(--ink);
}

.leftOver {
  color: #b4553f;
}

.perDay {
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.buckets {
  margin-top: 2.5rem;
}

.bucketRow {
  display: grid;
  grid-template-columns: 5rem 1fr 5.5rem;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.bucketLabel {
  font-size: 0.85rem;
  color: var(--ink-body);
}

.bucketTrack {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sea-far) 45%, transparent);
  overflow: hidden;
}

.bucketFill {
  height: 100%;
  border-radius: 999px;
  background: var(--sea-near);
}

.bucketTarget {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--ink-soft);
  opacity: 0.8;
}

.bucketValue {
  display: grid;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  color: var(--ink);
}

.bucketCents {
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.bucketsNote {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: var(--ink-soft);
}
```

- [ ] **Step 6: Verify the live behaviour**

Run `npm run dev`, complete onboarding, land on `/budget/assign`. Type into an envelope. Expected: **left to assign** and the **daily number** change on every keystroke; no other envelope's value changes. Save, reload, and confirm the values persisted.

- [ ] **Step 7: Commit**

```bash
git add components/budget "app/(private)/budget/assign" "app/(private)/onboarding"
git commit -m "Add onboarding step three and the live assign screen

Only derived figures move as she types. The bucket bars carry a target
mark but no pass or fail state: her needs share will sit above the mark
for as long as she has a child and a car, and that is arithmetic rather
than behaviour."
```

---

## Task 13: The calendar page

**Files:**
- Create: `app/(private)/budget/calendar/page.tsx`, `app/(private)/budget/calendar/calendar.module.css`

**Interfaces:**
- Consumes: `getCalendarData`, `buildMonthGrid`, `formatCents`
- Produces: `/budget/calendar`, with `?y=&m=` navigation

- [ ] **Step 1: Build the page**

```tsx
import Link from "next/link";
import { getCalendarData } from "@/lib/db/queries";
import { buildMonthGrid } from "@/lib/budget/calendar";
import { formatCents } from "@/lib/budget/format";
import styles from "./calendar.module.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const { y, m } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const year = Number(y) || Number(today.slice(0, 4));
  const month = Number(m) || Number(today.slice(5, 7));

  const data = await getCalendarData(year, month);
  const grid = buildMonthGrid({ year, month, ...data, today });

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <main className={styles.page}>
      <nav className={styles.topNav}>
        <Link href="/">&larr; Home</Link>
        <Link href="/budget">Budget</Link>
      </nav>

      <nav className={styles.monthNav}>
        <Link href={`/budget/calendar?y=${prev.y}&m=${prev.m}`}>&larr;</Link>
        <h1 className={styles.title}>
          {MONTHS[month - 1]} {year}
        </h1>
        <Link href={`/budget/calendar?y=${next.y}&m=${next.m}`}>&rarr;</Link>
      </nav>

      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className={styles.grid}>
        {grid.map((cell) => (
          <Link
            key={cell.date}
            href={`/budget?add=${cell.date}`}
            className={[
              styles.cell,
              cell.inMonth ? "" : styles.outside,
              cell.isToday ? styles.today : "",
              cell.isPeriodStart ? styles.periodStart : "",
              cell.isPeriodEnd ? styles.periodEnd : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`${cell.date}${cell.bills.length ? `, ${cell.bills.map((b) => b.name).join(", ")} due` : ""}${cell.isPayday ? ", payday" : ""}${cell.spentCents ? `, ${formatCents(cell.spentCents)} spent` : ""}`}
          >
            <span className={styles.dayNumber}>{Number(cell.date.slice(8))}</span>

            {cell.isPayday && <span className={styles.payday} aria-hidden="true">&#9650;</span>}

            {cell.bills.map((b) => (
              <span key={b.categoryId} className={styles.bill}>
                {formatCents(b.amountCents)}
              </span>
            ))}

            {cell.spentCents > 0 && (
              <span className={styles.spent}>{formatCents(cell.spentCents)}</span>
            )}
          </Link>
        ))}
      </div>

      <p className={styles.key}>
        &#9650; payday &middot; blue is a bill due &middot; grey is what you spent
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Write `calendar.module.css`**

```css
.page {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1rem 0.5rem 5rem;
}

.topNav {
  display: flex;
  gap: 1.25rem;
  font-size: 0.85rem;
  padding: 0 0.5rem;
  margin-bottom: 1rem;
}

.topNav a {
  color: var(--ink);
}

.monthNav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.5rem;
  margin-bottom: 1rem;
}

.monthNav a {
  color: var(--ink);
  font-size: 1.2rem;
  text-decoration: none;
  padding: 0.25rem 0.75rem;
}

.title {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--ink);
}

.weekdays,
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.weekdays {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  text-align: center;
  padding-bottom: 0.35rem;
}

.grid {
  gap: 2px;
}

.cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 4.5rem;
  padding: 0.3rem 0.25rem;
  border-radius: 0.4rem;
  background: var(--pearl);
  text-decoration: none;
  font-size: 0.62rem;
  overflow: hidden;
}

.outside {
  opacity: 0.45;
}

.today {
  outline: 2px solid var(--sea-near);
  outline-offset: -2px;
}

.periodStart {
  border-left: 3px solid var(--sea-mid);
}

.periodEnd {
  border-right: 3px solid var(--sea-mid);
}

.dayNumber {
  font-size: 0.75rem;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.payday {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  font-size: 0.5rem;
  color: var(--sea-near);
}

.bill {
  color: var(--sea-near);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.spent {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.key {
  margin-top: 1rem;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  color: var(--ink-soft);
  text-align: center;
}

@media (max-width: 24rem) {
  .cell {
    min-height: 3.6rem;
    font-size: 0.55rem;
  }
}
```

A seven-column month stays a grid at 375px because each cell carries a marker and an amount, never a category name.

- [ ] **Step 3: Verify at two widths**

Run `npm run dev`, visit `/budget/calendar`. Expected: six week-rows, the current day outlined, bills on their due dates, no horizontal scroll at 375px or 1440px. Navigate back a month and forward two; expected: the grid keeps its height and the dates stay correct across the year boundary.

- [ ] **Step 4: Commit**

```bash
git add "app/(private)/budget/calendar"
git commit -m "Add the bill calendar

Six fixed week-rows so the grid does not jump height between months. Day
cells carry a marker and an amount rather than a category name, which is
what keeps seven columns legible on a phone."
```

---

## Task 14: Empty states, and delete the fixture

With nothing seeded these are load-bearing, not decoration.

**Files:**
- Delete: `lib/db/demo-store.ts`
- Modify: `app/page.tsx`, `app/(private)/budget/page.tsx`, `lib/db/queries.ts`

- [ ] **Step 1: Delete the fixture**

```bash
git rm lib/db/demo-store.ts
```

Confirm nothing imports it:

```bash
grep -rn "demo-store" --include=*.ts --include=*.tsx app components lib
```

Expected: **no matches.** If `lib/db/queries.ts` still imports it, that file's bodies were never switched to Drizzle — finish Task 9 first.

- [ ] **Step 2: Give the landing page a real empty state**

In `app/page.tsx`, when `getPeriodData()` returns null, render the name and a single way in — **not** a zeroed dashboard. `$0.00 a day` reads as alarming rather than neutral:

```tsx
  if (!data) {
    return (
      <div className={styles.stage}>
        <Sprig className={`${florals.cornerSprig} ${florals.topLeft}`} />
        <Sprig className={`${florals.cornerSprig} ${florals.bottomRight}`} />
        <Corners />
        <main className={styles.content}>
          <div className={styles.contentInner}>
            <Hero />
            <p className={styles.dashLabel}>Let&rsquo;s set up your budget.</p>
            <nav className={styles.dashLinks}>
              <Link href="/onboarding" className={styles.dashLink}>
                Get started
              </Link>
            </nav>
          </div>
        </main>
      </div>
    );
  }
```

- [ ] **Step 3: Give the budget page an empty envelope state**

In `app/(private)/budget/page.tsx`, when `spending.length === 0 && bills.length === 0`:

```tsx
        <section className={styles.section}>
          <p className={styles.sectionNote}>No envelopes yet.</p>
          <Link href="/onboarding?step=spending" className={styles.quickSubmit}>
            Add a category
          </Link>
        </section>
```

- [ ] **Step 4: Verify every empty state by hand**

With a fresh signed-in account and no data:

| Visit | Expect |
|---|---|
| `/` | Name, "Let's set up your budget", one button |
| `/budget` | Redirect to `/onboarding` |
| `/budget/assign` | Redirect to `/onboarding` |
| `/budget/calendar` | Grid with no bills and no crash |
| `/budget/goals` | Existing empty case |

- [ ] **Step 5: Run everything**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Delete the demo fixture and add real empty states

Nothing is seeded, so what she sees before onboarding is now part of the
product rather than an accident. The landing page shows a way in instead
of a zeroed dashboard -- \$0.00 a day reads as alarming, not neutral."
```

---

## Self-review notes

**Spec coverage.** Every section of the design maps to a task: cadence arithmetic (1), occurrence generation (2), schema types (3), envelope changes (4), the 50/30/20 lens (5), the calendar grid (6), the database schema (8), queries and actions (9), the three onboarding steps (10-12), the assign screen (12), the calendar page (13), empty states and fixture deletion (14).

**One refinement to the spec.** The spec's savings-bucket definition listed goal contributions *and* unallocated income as separate additions. Implementing it revealed that would double-count, since goal contributions are funded out of unallocated income. Task 5 counts unallocated only, which preserves the property the spec actually cares about — the three buckets summing to exactly her income. The spec should be amended to match.

**Type consistency.** `Cadence` is defined once in `recurrence.ts` and imported by `types.ts`; `Bucket`, `BucketTotals` and `AllocationTargets` are defined once in `types.ts`. `perCheckSetAside` moves out of `calc.ts` into `recurrence.ts` in Task 4 and is never redefined. `summarizePeriod` gains exactly one new required input, `targets`, in Task 5, and every existing call site is fixed in the same task.
