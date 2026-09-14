# Flexible Allocation, Recurring Bills & the Bill Calendar — Design

Extends `2026-09-13-nadya-budget-design.md`. Read that first; this document
changes parts of it and says so explicitly where it does.

## Summary

Three additions, driven by Nadya's actual expenses:

1. **Recurring bills at any cadence.** She enters a bill as it really is —
   $160 weekly, $852 every six months — and the app derives the per-paycheck
   set-aside. Replaces the monthly-only `monthly_target_cents`.
2. **A live allocation screen.** Bills come off the top automatically. What
   remains is hers to assign across flexible envelopes, with *left to assign*
   and the daily number recalculating as she types. Nothing auto-edits.
3. **A bill calendar.** A month grid marking due dates, paydays, period
   boundaries and daily spend, with tap-a-day-to-log.

Plus a **50/30/20 lens** over the whole thing — reference lines, not a verdict.

## Her actual expenses

This design exists because the original spec's placeholder categories did not
match her life. The real set:

| Category | Kind | Bucket | Cadence |
|---|---|---|---|
| Rent | bill | needs | monthly |
| Daycare | bill | needs | weekly |
| Car note | bill | needs | monthly |
| Car insurance | bill | needs | semiannual |
| Groceries | spending | needs | — |
| Gas | spending | needs | — |
| Starbucks | spending | wants | — |
| Eating out | spending | wants | — |

**Amounts are still needed from Chance.** Every figure in this document is
illustrative. Daycare in particular is likely her largest single line — at
$160/week it annualises above rent — and the design's conclusions are sensitive
to it.

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

### The arithmetic does not work for her, and that is the point

Against the illustrative figures:

| Bucket | Actual | Rule |
|---|---|---|
| Needs | ~76% | 50% |
| Wants | ~7% | 30% |
| Savings | ~17% | 20% |

Her needs run 26 points over target because childcare, housing and a car
payment are structural costs she cannot move this month. Her discretionary
spending — the Starbucks the tool was half-built to watch — is **7%**, and her
savings rate is already **17%**, within striking distance of the 20% target.

### Therefore: a lens, not a scorecard

The rule is rendered as three bars showing actual against a reference line.
Specifically **not** specified:

- No red/fail state on the needs bar. It will exceed 50% every period for years.
  A tool that shows her failing at something she cannot change is a tool she
  stops opening, and it would be wrong besides — she is not overspending.
- No suggestions to cut. The app does not have the standing to tell her to drop
  daycare.

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

## Onboarding changes

Task 10's onboarding gains cadence and due-anchor entry per bill, and seeds her
real categories as defaults rather than the generic set in the original spec.

Bucket assignment is not asked about during onboarding — the defaults (bills →
needs, spending → wants) are right for seven of her eight categories, and
groceries is a single correction she can make later. Asking eight questions to
prevent one edit is the wrong trade.

## Supersedes in the original spec

- **"Bills & due dates" is no longer a roadmap item.** It moves into the build.
- **The blanket exclusion of calendars is narrowed.** The original text lists
  calendars among things "commodity apps already do better". That reasoning
  holds for a general-purpose calendar and does not hold for a bill calendar
  built from budget data the app already owns — which is the same thing roadmap
  item #1 described. A general-purpose calendar remains out of scope.
- **`monthly_target_cents` is replaced**, and the data model table in the
  original spec is out of date accordingly.

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

`recurrence.ts` and `calendar.ts` are pure and can be built and tested
immediately. Both screens can run against the existing in-memory fixture. The
schema change lands with Task 7, and nothing here ships before Task 8 supplies
auth.
