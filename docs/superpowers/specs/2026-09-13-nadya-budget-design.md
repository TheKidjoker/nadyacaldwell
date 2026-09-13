# Nadya's Site + Private Budget Tool — Design

**Date:** 2026-09-13
**Status:** Approved

## Summary

Turn the current single-page "Coming Soon" site into two things:

1. A lightweight public landing page (baby blue, SVG florals, no WebGL).
2. A private budget tool at `/budget`, accessible only to Nadya via Google
   sign-in, built around **pay periods rather than calendar months**, plus
   long-term savings goals.

One Next.js 16 app, TypeScript throughout, deployed on Vercel, backed by Neon
Postgres.

## The core idea

Nadya is paid **every two weeks**, plus **a commission check once a month** that
varies in size. Budgeting her by calendar month would be fighting her actual
cash flow.

The question she actually has is not *"how much did I budget for October"* but
**"how much can I spend before Friday's check."** So the unit of planning is the
pay period: a check arrives, she plans that money across the next two weeks, and
the app tracks what is left and how many days it has to last.

This also dissolves the variable-commission problem. There is no "expected vs.
actual income" to reconcile — each check is simply whatever it is, and the
monthly commission check makes one period a month fatter than the rest. That
surplus is exactly what should be going to savings goals.

The number that matters most, and that a monthly budget cannot produce:

> **Safe to spend per day** = spendable remaining ÷ days until the next check
>
> *"You have $87 and 6 days left — about $14 a day."*

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
evidence than what we guess now. The candidates, in rough priority order, are
ones that are *better because the budget sits next to them*:

1. **Bills & due dates** — what is auto-pay vs. manual, and what is actually
   left after bills clear. Smallest build, reuses the budget data model.
2. **Documents & renewals** — insurance, registration, lease, warranties, with
   expiry reminders that pre-load the renewal cost into the next period.
3. **Meal plan → grocery list** — the list drives the shop, the receipt lands in
   the groceries envelope.
4. **Car & home maintenance** — service intervals that predict a cost and feed a
   savings goal before it becomes an emergency.
5. **Important dates** — birthdays and anniversaries wired to a gift envelope.

Explicitly *not* candidates: generic to-do lists, notes, habit trackers, reading
lists, and calendars. Commodity apps already do these better, and half-built
tabs nobody opens are how a hub like this dies. The bar for a module is that the
hub makes it better than a standalone app would be.

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
| Planning unit | Pay period, not month | Matches biweekly pay; yields safe-to-spend-per-day |
| Income | Logged per check, typed in | Two taps on payday; no PII stored, no parsing to get wrong |
| Bills | Set-aside envelopes | Rent must not wreck whichever period it lands in |
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
    budget/page.tsx           current pay period
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
Dates that represent calendar days are `date`, not `timestamp`, to avoid
timezone drift.

| Table | Columns (beyond id) |
|---|---|
| `users`, `accounts`, `sessions` | Auth.js standard schema |
| `pay_periods` | `user_id`, `starts_on`, `ends_on`; unique on (`user_id`, `starts_on`) |
| `paychecks` | `user_id`, `received_on`, `amount_cents`, `kind` (`'base'` or `'commission'`), `note` |
| `categories` | `user_id`, `name`, `kind` (`'spending'` or `'bill'`), `monthly_target_cents` (bill only), `color`, `sort_order`, `archived_at` |
| `allocations` | `pay_period_id`, `category_id`, `amount_cents`; unique on (`pay_period_id`, `category_id`) |
| `transactions` | `user_id`, `category_id` (nullable), `occurred_on`, `amount_cents`, `note` |
| `goals` | `user_id`, `name`, `target_cents`, `target_date` (nullable), `archived_at` |
| `goal_contributions` | `goal_id`, `occurred_on`, `amount_cents`, `note` |

### Paychecks are separate from periods

A period's income is **not** a column on `pay_periods`. It is the sum of
`paychecks` whose `received_on` falls inside the period. This is what lets the
biweekly check and the once-a-month commission check coexist: the period that
happens to contain both simply has two paycheck rows.

`kind` distinguishes them so the UI can say "base $1,400 + commission $620"
rather than one opaque number, and so commission can be steered toward goals.

### Two kinds of category

This is the heart of the model.

**Spending envelopes** (`kind = 'spending'`) — groceries, gas, eating out. They
are allocated fresh each pay period and **reset at the start of the next one**.
Money not spent is not lost; it surfaces as surplus that can be sent to a goal.
These are the only envelopes that count toward safe-to-spend-per-day.

**Bill envelopes** (`kind = 'bill'`) — rent, car payment, insurance. These
**accumulate across periods**. Each check sets aside a slice; the balance builds
until the bill is due and the payment draws it back down.

A bill envelope's balance is always **derived, never stored**:

```
balance = sum(allocations to that category, all periods)
        - sum(transactions in that category, all time)
```

Deriving it means it cannot drift out of sync with the rows it summarizes.

The suggested per-check set-aside for a bill, on a biweekly schedule:

```
perCheckSetAside = monthly_target_cents * 12 / 26
```

Twelve bills a year spread over twenty-six checks — roughly 46% of the monthly
amount per check, *not* half. Using half would quietly over-save by about 8%.

A transaction with a null `category_id` is uncategorized; it counts toward total
spend but not toward any envelope.

## Pure logic — `lib/budget/calc.ts`

Plain data in, plain data out. No database access, no React, and no reading the
clock internally — `today` is always passed in, so tests are deterministic.

```ts
summarizePeriod({ period, paychecks, categories, allocations, transactions, today }) => {
  incomeCents, baseCents, commissionCents,

  categories: Array<{
    categoryId, kind, allocatedCents, spentCents, remainingCents,
    pctUsed, overspent
  }>,

  totalAllocatedCents,
  totalSpentCents,
  unallocatedCents,          // income - allocated
  uncategorizedCents,

  // spending envelopes ONLY — bill set-asides are not hers to spend
  spendableRemainingCents,
  daysRemaining,             // today through ends_on, inclusive; 0 if past
  safeToSpendPerDayCents,    // null when daysRemaining is 0
}

billEnvelopeBalance({ category, allocations, transactions, asOf }) => {
  balanceCents,
  monthlyTargetCents,
  perCheckSetAsideCents,
  fullyFunded,               // balance >= monthly target
}

goalProgress({ goal, contributions, today }) => {
  savedCents, remainingCents, pctComplete, isComplete,
  monthsRemaining,           // null when no target_date
  requiredPerMonthCents,     // null when no target_date or already complete
  onPace,                    // null when it cannot be determined
  isOverdue,
}
```

### Edge cases these must handle explicitly

- Overspent envelopes (negative remaining)
- An envelope allocated zero, so `pctUsed` never divides by zero
- A period with no paycheck logged yet
- A period containing two paychecks (base + commission)
- Allocating more than the period's income
- `daysRemaining` of zero on the final day — `safeToSpendPerDay` returns null
  rather than dividing by zero
- A period already in the past
- Bill envelopes with a negative balance (bill paid before fully funded)
- Goals already met, past their target date, or with no target date
- Contributions dated in the future

## UI

### Landing page (`/`)

Keeps the existing palette and typography. The Three.js scene is replaced by a
still, layered arrangement of SVG florals over a baby-blue gradient. Content
stays as-is: name, rule, "Coming Soon".

### Budget (`/budget`)

Designed **mobile-first** — the quick-add expense form is used standing at a
register, so it is reachable with a thumb and never more than two taps deep.

- **Safe-to-spend-per-day, as the largest thing on the screen**, with days
  remaining and the next payday underneath. This is the headline.
- The period's paychecks: base and commission listed separately, with a button
  to log a new check.
- Spending envelopes: allocated, spent, remaining, and a fill bar that turns to
  a warning tint when overspent.
- Bill envelopes, visually separated from spending: accumulated balance against
  monthly target, and whether this period's set-aside has been made.
- A persistent quick-add expense form (amount, category, date, optional note).
- Unallocated income surfaced as surplus, with an action to send it to a goal.
- Prev / next navigation across periods.

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

## Onboarding

The first run cannot drop her into an empty screen. On first sign-in she is
asked for three things, and nothing more:

1. The date of her most recent paycheck and its amount — this seeds the first
   pay period and sets the biweekly cadence.
2. Her monthly bills and their amounts — these become bill envelopes with
   `monthly_target_cents` set, and the per-check set-aside is calculated for her.
3. Whatever is left becomes spending envelopes, seeded with sensible defaults
   (groceries, gas, eating out, personal, misc) that she can rename or delete.

Subsequent periods are created automatically, carrying the previous period's
allocations forward as the starting suggestion.

## Testing

Vitest, added fresh. `lib/budget/calc.ts` is written test-first — it is pure
functions with genuinely tricky edge cases, listed above. Schema and queries are
not unit tested; they are exercised manually against a Neon branch.

## What gets removed

`components/scene/*`, `lib/scene/*`, `app/scene.module.css` (folded into the
new landing styles), and the `three`, `@react-three/fiber`, `@react-three/drei`,
`@react-three/postprocessing`, `@types/three` dependencies. Recoverable from
git history at commit `b6489f4`.

`components/Hero.tsx` and `components/Corners.tsx` are kept and restyled against
the new landing styles rather than deleted.

## Out of scope for v1

Bank account sync, paystub photo upload or parsing, CSV/statement import,
recurring transaction automation, charting libraries, trend dashboards,
multi-user support, a Python service, and data export.

### Paystub upload — considered and rejected

Photographing a paystub to auto-extract net pay was considered. Rejected because
typing two numbers on payday takes about ten seconds, while paystubs carry
partial SSNs, home addresses, employer details and YTD earnings — storing or
even transiting them makes the app responsible for real PII for almost no time
saved.

### Bank sync — deferred deliberately

Automatic transaction import was evaluated and **consciously left out, including
its schema**. `transactions` gets no `source`, `external_id`, `pending`, or
`reviewed_at` columns in v1.

The reasoning: adding nullable columns to Postgres later is a non-breaking
migration, and the genuinely hard part of import — reconciling manually-entered
transactions against imported ones so a purchase is not counted twice — is a
data problem that exists regardless of when the columns are added.

When it is revisited, the provider is **SimpleFIN Bridge** ($15/year, read-only,
daily refresh). Teller's free developer tier returns real bank data and would
otherwise be the better API, but its coverage is concentrated in large national
banks and Nadya uses a credit union, which SimpleFIN covers more reliably.

Whoever picks this up should weigh one thing seriously: storing bank access
tokens changes the app's threat model. A breach stops being "someone learns her
grocery budget" and becomes "someone reads her full transaction history." Tokens
must be encrypted at rest with a key held outside the database.

## Environment variables

| Name | Source |
|---|---|
| `DATABASE_URL` | Injected by the Vercel Neon integration |
| `AUTH_SECRET` | Generated once (`npx auth secret`) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google Cloud OAuth client |
| `ALLOWED_EMAIL` | Nadya's Google address |
