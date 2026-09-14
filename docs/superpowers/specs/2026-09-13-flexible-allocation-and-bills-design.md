# Flexible Allocation, Recurring Bills & the Bill Calendar — Design

Extends `2026-09-13-nadya-budget-design.md`. Read that first; this document
changes parts of it and says so explicitly where it does.

## Summary

Three additions, driven by the shape of Nadya's expenses. Every dollar figure in
this document is an example chosen to exercise the arithmetic — none of them are
her numbers, and the app is not seeded with any.

1. **Recurring bills at any cadence.** She enters a bill as it really is —
   weekly, monthly, every six months — and the app derives the per-paycheck
   set-aside. Replaces the monthly-only `monthly_target_cents`.
2. **A live allocation screen.** Bills come off the top automatically. What
   remains is hers to assign across flexible envelopes, with *left to assign*
   and the daily number recalculating as she types. Nothing auto-edits.
3. **A bill calendar.** A month grid marking due dates, paydays, period
   boundaries and daily spend, with tap-a-day-to-log.

Plus a **50/30/20 lens** over the whole thing — reference lines, not a verdict.

## The app ships empty

**No amount is seeded, anywhere.** Every envelope starts at zero and stays there
until Nadya enters her own figures through onboarding. The app never invents a
number and never shows her a number she did not provide.

This is a decision, not an omission. A budget pre-filled with someone's guess at
her rent is worse than an empty one: she has to audit every line to find out
which are real, and any she misses become a lie the daily number is computed
from. An empty envelope is honest and takes one entry to fix.

The category *names* below are offered during onboarding as a starting list she
can accept, rename, or delete. They carry no amounts.

| Category | Kind | Bucket | Cadence |
|---|---|---|---|
| Rent | bill | needs | she chooses |
| Daycare | bill | needs | she chooses |
| Car note | bill | needs | she chooses |
| Car insurance | bill | needs | she chooses |
| Groceries | spending | needs | — |
| Gas | spending | needs | — |
| Starbucks | spending | wants | — |
| Eating out | spending | wants | — |

Cadence is hers to set per bill rather than assumed — daycare is commonly weekly
and car insurance commonly semiannual, but assuming either would be the same
mistake as assuming an amount.

### Consequences

- The in-memory demo fixture currently backing the UI is **deleted**, not
  updated. It exists only because there was no database; once onboarding writes
  real categories there is nothing for it to stand in for.
- `/budget`, `/budget/calendar` and `/` all need a genuine **empty state** —
  what she sees before onboarding and what she sees if she deletes everything.
- Onboarding stops being a late task and becomes the **entry point to the whole
  app**. It moves ahead of the budget UI in the build order.

## Decisions

### Bills come off the top; flexible money is live

Decided over two alternatives: zero-sum auto-rebalance (raising one envelope
silently lowers the others) and a priority waterfall (ranked categories, the
bottom gets starved).

Both were rejected for the same reason: **they edit numbers she did not touch.**
A budget's job is to reflect her intent back at her. An app that quietly moves
her Starbucks figure because she raised groceries teaches her not to trust the
numbers on screen, and the failure is silent — she only finds out when an
envelope she thought was funded is empty.

So: bill set-asides are computed and not editable per period. Everything left
is hers to assign, and the only things that move as she types are *derived*
figures — left to assign, the daily number, the bucket percentages.

### Due dates are informational; set-asides stay smoothed

A bill's due date does **not** decide which paycheck pays it. Every paycheck
sets aside `annual ÷ 26` toward every bill, the envelope fills, the bill is paid
out of it.

The alternative — the paycheck before the due date absorbs the whole bill —
was rejected because it makes consecutive periods look nothing alike. With rent
lumped onto one check, one period shows $2.50/day and the next $54/day on
identical income. The smoothed model keeps the daily number stable, which is the
number she actually steers by.

This preserves the existing tested behaviour: `perCheckSetAside` of
`monthly × 12 ÷ 26` is now the `cadence: "monthly"` case of `annual ÷ 26`.

Consequence to accept: mid-cycle, an envelope can hold less than the bill it is
saving for. The UI already surfaces this — `EnvelopeBalance.fullyFunded` exists
and the budget page renders *"funding toward $1,200.00"* versus *"fully
funded"*. No additional alerting is specified; the information is already on
screen where she looks.

### Any cadence, normalised to a year

Monthly-only would force her to convert weekly daycare (`× 52 ÷ 12`) and a
six-month insurance premium (`÷ 6`) by hand. Two chances to fat-finger it, and
the stored number stops matching the bill she actually receives — so when the
premium changes she has to redo arithmetic instead of typing the new figure.

Normalising through an annual total costs one enum and one lookup table.

### One anchor date, not a day-of-month field

A bill's schedule is `(cadence, dueAnchor)`. Occurrences are generated from the
anchor rather than stored. This avoids a `day_of_month` column that means
nothing for weekly bills and a `day_of_week` column that means nothing for
monthly ones.

Month-end clamping is the edge case: an anchor of the 31st yields the 28th/29th
in February and the 30th in April. It gets explicit tests.

## The 50/30/20 lens

### The rule will probably not fit her, and the design must survive that

Her real percentages are unknown until she completes onboarding, and this
document deliberately asserts none.

What can be said without her figures is structural. Her needs bucket carries
rent, childcare, a car payment and car insurance — four costs fixed by contract
that no in-period decision can move. Her wants bucket carries coffee and the
occasional lunch out. On that shape, needs landing well above 50% and wants well
below 30% is the likely outcome, and it would not indicate overspending. It
would indicate a household with a child and a car.

The design therefore must not treat a needs bucket over 50% as a failure,
because for her it is probably the arithmetic of her life rather than a
behaviour. If her numbers do fit the rule, the same neutral presentation shows
that too.

### Therefore: a lens, not a scorecard

The rule is rendered as three bars showing actual against a reference line.
Specifically **not** specified:

- **No red/fail state on the needs bar.** A tool that shows her failing at
  something she cannot change is a tool she stops opening.
- **No suggestions to cut.** The app does not have the standing to tell her to
  drop daycare, and cutting is not what the number is evidence of.
- **No congratulation either.** The bars report; they do not praise. Scoring in
  one direction invites scoring in the other.

The savings bar is the one bucket she can genuinely move period to period, and
it is the one the screen should lead with.

The targets are **editable**, defaulting to 50/30/20. If she sets 75/10/15 she
gets a line she can actually steer by, and moving it is her decision. They are
stored as three integers that must sum to 100, validated on save — a reference
line that does not add up is worse than no reference line.

The savings bar is the one worth her attention, and it is the one that is nearly
on target. That is the honest story the lens should tell.

### Bucket is independent of kind

`bucket` is orthogonal to `kind`. Groceries is `spending` + `needs`; rent is
`bill` + `needs`; Starbucks is `spending` + `wants`. Defaults on creation are
bills → needs, spending → wants, and she can override any of them.

### What the buckets are measured on

The lens measures **allocation, not spend**. It answers "how is she dividing
this paycheck", which is a decision she can act on, rather than "what did she
buy", which lags and jitters with grocery timing.

For a given period:

| Bucket | Sum of |
|---|---|
| Needs | allocations to categories with `bucket = 'needs'`, bill set-asides included |
| Wants | allocations to categories with `bucket = 'wants'` |
| Savings | allocations to `bucket = 'savings'` categories, **plus** goal contributions dated in the period, **plus** `unallocatedCents` when positive |

Counting unallocated income as savings is deliberate: money she has not assigned
is money she has not spent. It also makes the three buckets sum to exactly her
income, so the percentages always total 100% and the bars never leave an
unexplained gap.

When `unallocatedCents` is negative she has assigned more than she was paid. In
that case savings contributes zero rather than a negative number, the
percentages are computed against total allocation rather than income, and the
lens is labelled as over-allocated. A negative bar is not a thing.

## Data model changes

### `categories`

Removed:

| Column | Why |
|---|---|
| `monthly_target_cents` | Superseded — monthly is now one cadence among six |

Added:

| Column | Type | Notes |
|---|---|---|
| `cadence` | enum, null | `weekly` `biweekly` `monthly` `quarterly` `semiannual` `annual`. Null for spending. |
| `recurring_amount_cents` | integer, null | The bill as she receives it. Null for spending. |
| `due_anchor` | date, null | One reference occurrence; the rest are generated. Null for spending. |
| `bucket` | enum, not null | `needs` `wants` `savings` |

Constraint: `kind = 'bill'` requires all three of `cadence`,
`recurring_amount_cents`, `due_anchor` non-null; `kind = 'spending'` requires
all three null. Enforced as a check constraint, not only in application code.

### `allocation_targets` (new)

| Column | Notes |
|---|---|
| `user_id` | |
| `needs_pct`, `wants_pct`, `savings_pct` | integers, default 50/30/20 |

A single row per user. Kept separate from `categories` because it is a property
of her budget, not of any category, and because a single-row table is cheaper to
reason about than three more columns on `users`.

## Pure logic — `lib/budget/recurrence.ts`

New module, same idiom as `dates.ts`: ISO strings in, ISO strings out, no clock
reads, no imports beyond `dates.ts`.

```ts
type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly"
             | "semiannual" | "annual";

const PER_YEAR: Record<Cadence, number>;
  // weekly 52, biweekly 26, monthly 12, quarterly 4, semiannual 2, annual 1

annualCents(amountCents, cadence): number
perCheckSetAside(amountCents, cadence): number    // round(annual / 26)
nextOccurrence(anchor, cadence, onOrAfter): ISODate
occurrencesBetween(anchor, cadence, from, to): ISODate[]
```

### Edge cases requiring explicit tests

- Monthly anchored on the 31st across February, April, and a leap February
- `occurrencesBetween` where the window starts before the anchor (returns none
  before it — a bill does not exist retroactively)
- `occurrencesBetween` over a window containing zero occurrences
- Weekly across a year boundary
- `perCheckSetAside` rounding: `$852 semiannual` → `$65.54`, never `$65.53`
- Cadence round-trip: every cadence annualises and divides without drift beyond
  one cent

## Changes to existing pure logic

`envelopeBalance` changes in two places:

- `perCheckSetAsideCents` derives from `(recurringAmountCents, cadence)` rather
  than `monthlyTargetCents`
- `fullyFunded` becomes `remaining >= recurringAmountCents` — can she pay the
  bill as it will actually arrive — rather than `remaining >= monthlyTarget`.
  For a $852 semiannual premium the old rule declared the envelope funded at
  $142; the new one waits for $852. This is the difference between "has she
  saved a sixth of it" and "can she pay it", and only the second is worth
  showing.

`EnvelopeBalance` gains `bucket`, `cadence`, `nextDueOn`.

`summarizePeriod` gains:

```ts
buckets: {
  needsCents, wantsCents, savingsCents,
  needsPct, wantsPct, savingsPct,        // 0..1, always summing to 1
  targets: { needsPct, wantsPct, savingsPct },
  overAllocated: boolean,                // true when unallocatedCents < 0
}
```

Its existing shape is otherwise unchanged, so the budget page keeps working
through this change.

## New pure logic — `lib/budget/calendar.ts`

```ts
buildMonthGrid({
  year, month, categories, paychecks, periods, transactions, today,
}): DayCell[]
```

`DayCell` carries `date`, `inMonth`, `isToday`, `bills[]`, `isPayday`,
`isPeriodBoundary`, `spentCents`. Six weeks of cells always, so the grid does
not reflow between months.

Separating this from the component means the calendar's logic is tested without
a DOM — consistent with how `calc.ts` is tested.

## UI

### Assign screen — `/budget/assign`

- **Bills**, computed and read-only per period, each showing its real amount and
  cadence ("$160 weekly") alongside the per-check set-aside
- **Flexible envelopes**, number inputs
- **Left to assign** and the **daily number**, recalculating live as she types
- **50/30/20 bars** beneath, actual against reference lines

A client component holding local state; commits via Server Action on save. It
must not write on every keystroke.

### Calendar — `/budget/calendar`

Month grid per `buildMonthGrid`. Bill due dates, paydays, period boundaries,
daily spend totals. Tapping a day opens quick-add pre-dated to that day.
Previous/next month navigation. Mobile-first: at narrow widths the grid stays a
grid — a seven-column month is legible at 375px if day cells carry a marker and
the amount, not the category name.

### Budget page

Gains a link to both new screens. Otherwise unchanged.

## Onboarding — `/onboarding`

Since nothing is seeded, this is how the app acquires everything it knows. It
replaces Task 10's three-question sketch and moves ahead of the budget UI in the
build order.

Three steps. She can leave and come back; each step commits as she completes it,
so a half-finished setup is not lost.

### Step 1 — her last paycheck

Date received, amount, and whether it was base or commission. This seeds the
first pay period, fixes the biweekly cadence, and is the only step that cannot
be skipped: without a period there is nothing to allocate against.

### Step 2 — her bills

A repeating row: **name, amount, cadence, next due date.** She adds as many as
she has and removes any she does not. The suggested names (rent, daycare, car
note, car insurance) pre-fill the list as empty rows she can accept or delete;
nothing about them is committed until she types an amount.

Each completed row shows its derived per-paycheck set-aside immediately — she
types "$160 weekly" and sees "$320.00 per paycheck" appear. This is the moment
the app's central idea becomes legible, and it should not be deferred to a later
screen.

### Step 3 — her flexible spending

Names only: groceries, gas, Starbucks, eating out, plus anything she adds. No
amounts here. Amounts belong on the assign screen, where she can see what is
left after bills — asking her to invent a grocery budget before she knows what
is available would be asking her to guess.

This step is skippable. Envelopes can be created later from the budget page.

### Then

She lands on `/budget/assign` with bills already deducted and the full remainder
to assign. That is the first screen where the tool does something for her.

### What is not asked

**Bucket.** Defaults are bills → needs and spending → wants. Those are right for
most of her list; groceries and gas are the likely corrections, made later on
the category itself. Asking a needs/wants question on every row to prevent two
edits is the wrong trade, and the distinction is not obvious enough to explain
mid-wizard.

**Her 50/30/20 targets.** They default to 50/30/20 and are editable from the
assign screen once she has numbers to look at. A target set before she has seen
a single real percentage is a guess.

## Empty states

With no seeded data these are load-bearing, not decoration.

| Screen | Before onboarding | After, but empty |
|---|---|---|
| `/` | Name, and a single call to action into onboarding. No zeroed dashboard — `$0.00 a day` is alarming rather than neutral. | — |
| `/budget` | Redirect to `/onboarding` | "No envelopes yet" with an add action |
| `/budget/assign` | Redirect to `/onboarding` | Bills section only, with everything to assign |
| `/budget/calendar` | Redirect to `/onboarding` | The grid, with paydays and no bills |
| `/budget/goals` | Reachable; goals are independent of periods | Existing empty case |

The redirect to `/onboarding` when `getPeriodData` returns null already exists in
the budget page and is the correct behaviour; it simply has no destination yet.

## Supersedes in the original spec

- **"Bills & due dates" is no longer a roadmap item.** It moves into the build.
- **The blanket exclusion of calendars is narrowed.** The original text lists
  calendars among things "commodity apps already do better". That reasoning
  holds for a general-purpose calendar and does not hold for a bill calendar
  built from budget data the app already owns — which is the same thing roadmap
  item #1 described. A general-purpose calendar remains out of scope.
- **`monthly_target_cents` is replaced**, and the data model table in the
  original spec is out of date accordingly.
- **Onboarding is rewritten and promoted.** The original spec's three questions
  become the three steps above, and it stops being Task 10 — with nothing
  seeded, it is the only way data enters the app, so it precedes the budget UI.
- **The default spending envelopes change.** The original spec seeds "groceries,
  gas, eating out, personal, misc" with sensible defaults; this design seeds
  names only, with no amounts, and uses her list.

## Out of scope

- Bank sync. Teller and SimpleFIN were both evaluated; Teller has closed public
  signup, and nothing here depends on either.
- Variable bills (a power bill that differs monthly). She would edit the amount;
  no forecasting.
- Reminders or notifications. The calendar shows what is due; nothing is pushed.
- Historical bucket trends. The lens covers the current period only.

## Testing

Same standard as the existing logic: every pure function unit-tested against the
edge cases listed above, arithmetic verified by hand at least once per module.
`recurrence.ts` and `calendar.ts` must be pure and clock-free so their tests
cannot rot with the date.

## Sequencing

`recurrence.ts` and `calendar.ts` are pure — no database, no auth — and can be
built and tested immediately, the same way Tasks 3–6 were.

Everything else now depends on persistence in a way the earlier UI did not.
Deleting the fixture means onboarding has nowhere to write until the database
exists, and an onboarding flow that forgets her bills when the dev server
restarts is not worth demonstrating. So:

| Work | Needs |
|---|---|
| `recurrence.ts`, `calendar.ts` | nothing — buildable now |
| Schema change (`cadence`, `bucket`, `allocation_targets`) | Task 7, Neon |
| Onboarding, assign screen, calendar page | Task 7 |
| Shipping any of it | Task 8, auth |

This is a real change in the critical path. The previous round of UI work was
deliberately built on a fixture to sidestep the blocked database tasks; that
option is gone the moment the app has to remember what she typed. **Neon is now
the blocker for everything except the two pure modules.**
