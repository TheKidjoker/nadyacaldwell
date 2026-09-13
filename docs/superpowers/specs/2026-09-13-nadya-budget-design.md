# Nadya's Site + Private Budget Tool — Design

**Date:** 2026-09-13
**Status:** Approved

## Summary

Turn the current single-page "Coming Soon" site into two things:

1. A lightweight public landing page (baby blue, SVG florals, no WebGL).
2. A private budget tool at `/budget`, accessible only to Nadya via Google
   sign-in, combining a monthly envelope budget with long-term savings goals.

One Next.js 16 app, TypeScript throughout, deployed on Vercel, backed by Neon
Postgres.

## The longer arc

The budget is the **first module of a personal organization hub**, not the whole
product. More modules are intended to follow. That does not change what v1
builds, but it does set three constraints on how v1 is built:

- **The private area is `/app/(private)`, not `/app/(budget)`.** Auth, the DAL,
  the shared layout, and the navigation are hub-level concerns, so a second
  module drops in beside `budget/` without moving anything.
- **Each module owns its own tables and its own `lib/<module>/` folder**, with
  pure logic separated from persistence exactly as `calc.ts` is here. Modules do
  not import each other's internals.
- **One `users` table serves every module.** Auth is solved once.

Deciding *which* module comes second is deliberately deferred until the budget
is in Nadya's hands and she has used it — what she reaches for next is better
evidence than what we guess now.

## Context

The repo today is a Next.js 16.3.4 / React 19 app with a single page rendering
a Three.js coastal scene (`components/scene/*`, `lib/scene/*`) behind a
"Coming Soon" hero. The baby-blue palette lives in `app/globals.css` as CSS
custom properties and is the design foundation we keep. There is no backend,
no database, and no test setup.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Audience | Nadya only, private | Not a client tool or public calculator |
| Budget model | Envelopes + savings goals | Covers day-to-day and long-term |
| Language | TypeScript, no Python | The logic is arithmetic; a second runtime would cost a second dependency chain and a second auth verification for no gain. `calc.ts` is isolated as the seam to port later if real analytics arrive. |
| Login | Google, email allowlisted | No password to remember or rotate |
| Database | Neon Postgres | Vercel-native, injects `DATABASE_URL`, scales to zero |
| Landing page | Simplify, drop Three.js | ~600KB of JS for a coming-soon page |
| Mutations | Server Actions | App Router idiom; no fetch/JSON boilerplate |

## Architecture

```
app/
  page.tsx                    public landing
  (private)/
    layout.tsx                calls verifySession(); shared chrome
    budget/page.tsx           this month's envelopes
    budget/goals/page.tsx     savings goals
  api/auth/[...nextauth]/     Auth.js route handler

proxy.ts                      optimistic cookie check -> redirect
lib/auth/dal.ts               verifySession(), getUser()
lib/budget/calc.ts            PURE math. no db, no react.
lib/budget/actions.ts         Server Actions (verify -> validate -> persist)
lib/db/schema.ts              Drizzle schema
lib/db/queries.ts             user-scoped queries
components/florals/           shared SVG flowers
```

### Security model

Two layers, deliberately:

- **`proxy.ts`** does a cheap session-cookie check and redirects strangers away
  from `/budget/*` immediately. Per the Next.js 16 docs this is an
  *optimistic* check only and is never the sole defense.
- **`lib/auth/dal.ts`** is the real gate. `verifySession()` is memoized with
  React's `cache()` and is called by every server component, Server Action, and
  query that touches budget data. Every query is scoped by `user_id` taken from
  the verified session — never from a client-supplied parameter.

Note: `middleware.ts` is deprecated in Next.js 16 and renamed `proxy.ts`. The
exported function is `proxy`, not `middleware`.

### Access control

Auth.js Google provider with a `signIn` callback that allowlists a single
email address, read from `ALLOWED_EMAIL`. Any other Google account is rejected
at sign-in and no user row is created. The address lives in an environment
variable rather than in source so it can change without a deploy, and so the
repo stays free of a personal address — it is set in the Vercel dashboard and
in local `.env.local`, both of which are gitignored.

## Data model

Postgres via Drizzle. **All money is stored as integer cents** — never floats.
Dates that represent calendar days (`occurred_on`, `month`) are `date`, not
`timestamp`, to avoid timezone drift.

| Table | Columns (beyond id) |
|---|---|
| `users`, `accounts`, `sessions` | Auth.js standard schema |
| `categories` | `user_id`, `name`, `color`, `sort_order`, `archived_at` |
| `budget_months` | `user_id`, `month` (date, 1st of month), `income_cents`; unique on (`user_id`, `month`) |
| `allocations` | `budget_month_id`, `category_id`, `amount_cents`; unique on (`budget_month_id`, `category_id`) |
| `transactions` | `user_id`, `category_id` (nullable), `occurred_on`, `amount_cents`, `note` |
| `goals` | `user_id`, `name`, `target_cents`, `target_date` (nullable), `archived_at` |
| `goal_contributions` | `goal_id`, `occurred_on`, `amount_cents`, `note` |

Allocations are stored per-month rather than as a property of the category, so
editing October's grocery envelope does not rewrite September's history.

A transaction with a null `category_id` is uncategorized; it counts toward
total spend but not toward any envelope.

**Income has exactly one source of truth: `budget_months.income_cents`.**
Transactions are always expenses — there is no `kind` column. Extra money
arriving mid-month is handled by editing that month's income, not by logging an
income transaction. This removes any chance of the same dollar being counted
twice in `leftoverCents`.

Moving unallocated income to a goal writes a `goal_contributions` row; it does
not create a transaction and does not reduce `income_cents`.

## Pure logic — `lib/budget/calc.ts`

Plain data in, plain data out. No database access, no React, and no reading the
clock internally — "today" is always passed in, so tests are deterministic.

```ts
summarizeMonth({ incomeCents, allocations, transactions }) => {
  categories: Array<{
    categoryId, allocatedCents, spentCents, remainingCents, pctUsed, overspent
  }>,
  totalAllocatedCents,
  totalSpentCents,
  unallocatedCents,   // income - allocated
  leftoverCents,      // income - spent
  uncategorizedCents,
}

goalProgress({ goal, contributions, today }) => {
  savedCents, remainingCents, pctComplete, isComplete,
  monthsRemaining,          // null when no target_date
  requiredPerMonthCents,    // null when no target_date or already complete
  onPace,                   // null when it cannot be determined
  isOverdue,
}
```

Edge cases these must handle explicitly: overspent envelopes (negative
remaining), an envelope allocated zero (so `pctUsed` never divides by zero),
zero-income months, income allocated beyond income, goals already met, goals
past their target date, goals with no target date, and contributions dated in
the future.

## UI

### Landing page (`/`)

Keeps the existing palette and typography. The Three.js scene is replaced by a
still, layered arrangement of SVG florals over a baby-blue gradient. Content
stays as-is: name, rule, "Coming Soon".

### Budget (`/budget`)

- Month switcher (prev / next), defaulting to the current month.
- Income for the month, editable inline.
- Envelope cards per category: allocated, spent, remaining, and a fill bar
  that turns to a warning tint when overspent.
- A persistent quick-add expense form (amount, category, date, optional note).
- A banner showing unallocated income, with an action to send it to a goal.

### Goals (`/budget/goals`)

- One card per goal with a `<Bloom>` whose petals fill as the goal approaches
  its target, plus saved / remaining / required-per-month.
- Add-contribution form per goal.

### Florals — `components/florals/`

A small hand-drawn SVG set in the existing baby-blue tints: `Sprig`, `Stem`,
and `Bloom`. `Bloom` takes a `progress` prop (0 to 1) driving petal fill, so the
same component decorates the landing page and doubles as the goal indicator.
Purely decorative instances are `aria-hidden`; `Bloom` used as a progress
indicator carries an accessible label with the real numbers.

## Testing

Vitest, added fresh. `lib/budget/calc.ts` is written test-first — it is pure
functions with genuinely tricky edge cases, listed above. Schema and queries
are not unit tested; they are exercised manually against a Neon branch.

## What gets removed

`components/scene/*`, `lib/scene/*`, `app/scene.module.css` (folded into the
new landing styles), and the `three`, `@react-three/fiber`, `@react-three/drei`,
`@react-three/postprocessing`, `@types/three` dependencies. Recoverable from
git history at commit `b6489f4`.

`components/Hero.tsx` and `components/Corners.tsx` are kept and restyled
against the new landing styles rather than deleted.

## Out of scope for v1

Bank account sync, CSV/statement import, recurring transactions, charting
libraries, trend dashboards, multi-user support, a Python service, and data
export. Month navigation is a prev/next switcher, not an analytics view.

## Environment variables

| Name | Source |
|---|---|
| `DATABASE_URL` | Injected by the Vercel Neon integration |
| `AUTH_SECRET` | Generated once (`npx auth secret`) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google Cloud OAuth client |
| `ALLOWED_EMAIL` | Nadya's Google address |
