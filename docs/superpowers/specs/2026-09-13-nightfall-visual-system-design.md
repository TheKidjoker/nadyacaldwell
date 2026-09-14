# Nightfall — Visual System & Home Notes

Supersedes the visual direction in `2026-09-13-nadya-budget-design.md`. The data
model, budget logic and onboarding flow specified elsewhere are unchanged; this
document governs only how all of it looks, plus one new feature.

## Summary

1. **A dark visual system, "Nightfall."** Deep navy ground with Nadya's existing
   baby blue promoted from background to accent. Her cursive wordmark survives;
   everything around it gets quieter so it can be the one expressive thing.
2. **Three notes from Chance on the home page**, one shown at a time, rotating by
   date. He writes the words; this spec builds the frame.

Chosen from four rendered variations of the same idea. The others: keep the pale
blue ground and sharpen it, warm the ground to ivory paper, or go asymmetric and
editorial.

## Decisions

### Why the blue moves from ground to light

The current site is pale blue behind slate-blue text. Both are tints, so every
pairing on the page is low-contrast, and the result reads washed rather than
rich — the specific complaint that started this work.

Inverting fixes it at the root. On a deep navy ground the same `#9ac5e7` becomes
luminous instead of flat, and the palette gains the contrast it never had.
Nothing about her colour is discarded; it changes job.

### Why the app commits to one theme

Nightfall is a dark design on purpose, not a dark mode. There is no light
variant, and the spec does not pretend otherwise: `color-scheme` and
`themeColor` are set to match, and no `prefers-color-scheme` branch exists.

Supporting both would mean two palettes to keep honest for an app with exactly
one user, whose preference is known.

### Why the cursive survives

Parisienne is the most traditional element on the page and the reason the site
reads romantic. It stays because Chance asked for it, and the design makes it
work rather than fighting it:

- **It is the only expressive face.** One flourish in a quiet room reads
  considered; small cursive among other ornament reads sweet.
- **It is never small.** A 2.5rem floor on her name and a 1.6rem floor on the
  corner accent. A script face at caption size is where this goes wrong.
- **It gets one warm hairline beneath it** and no other decoration.

**Amended 2026-09-13.** This rule originally read "her name and nothing else",
and enforcing it literally set the corner line "More Beautiful Things Ahead" in
the sans stack — where a rotated sans phrase reads as broken CSS rather than as
an accent. Chance asked for the cursive back. The script is therefore permitted
in exactly two places, her name and that one corner line, and nowhere else. The
constraint that actually matters was never the count; it is the size floor and
the absence of competing ornament.

## Tokens

Replaces the palette block in `app/globals.css` entirely.

| Token | Value | Role |
|---|---|---|
| `--night-deep` | `#071320` | Page ground |
| `--night` | `#0f2438` | Raised surface — cards, the quick-add bar |
| `--night-line` | `#1b3550` | Hairlines, bar tracks, borders |
| `--blue-light` | `#9ac5e7` | Her blue. Accent, fills, the wordmark |
| `--blue-mid` | `#6ba1cd` | Secondary fills, the second series in any chart |
| `--ink` | `#eaf4fc` | Primary text |
| `--ink-soft` | `#7d9cb8` | Secondary text, metadata |
| `--ink-faint` | `#54708c` | Disabled, placeholder |
| `--warm` | `#b08d57` | The single hairline under the wordmark. Nothing else. |
| `--over` | `#e08a72` | Overspent / overdue |
| `--ease-soft` | `cubic-bezier(0.33, 0.1, 0.2, 1)` | Unchanged |

**`--over` is new and load-bearing.** The current `#b4553f` is hardcoded in
`app/(private)/budget/budget.module.css` and
`app/(private)/budget/goals/goals.module.css`. It is a red chosen for a white
ground; on navy it goes muddy and loses its warning value. It becomes a token,
lightened for dark, and the literals are removed.

The quick-add shadow `rgb(62 90 121 / 0.12)` is likewise a light-theme shadow and
is replaced with a dark-appropriate value.

### Migrating the old names

Every old token disappears, and an undefined CSS custom property fails silently
to nothing rather than erroring — so a missed usage is an invisible bug, not a
build failure. Each one is renamed at every call site:

| Old | New | Notes |
|---|---|---|
| `--pearl` | `--night` | Card and input surfaces |
| `--ink-body` | `--ink` | The old palette had two body inks; one is enough |
| `--sea-near` | `--blue-light` | Button fills, progress fills |
| `--sea-mid` | `--blue-mid` | Secondary fills, Bloom petals |
| `--sea-far` | `--night-line` | Bar tracks — a track is a rule, not a colour |
| `--sun-warm` | `--warm` | Bloom centre |
| `--sky-zenith` `--sky-upper` `--sky-mid` `--sky-low` `--horizon` | *removed* | The gradient they built is gone |
| `--sun-core` `--horizon-line` | *removed* | Unused once the scene and gradient go |

Verification is mechanical: after the swap, `grep -rn "var(--sky\|var(--sea\|var(--pearl\|var(--ink-body\|var(--sun" app components` must return nothing.

### Contrast

Computed against `--night` `#0f2438`:

| Pair | Ratio | Requirement |
|---|---|---|
| `--ink` on `--night` | ~14:1 | AA text (4.5:1) ✓ |
| `--ink-soft` on `--night` | ~5.4:1 | AA text ✓ |
| `--blue-light` on `--night` | ~8.5:1 | AA text ✓ |
| `--warm` on `--night` | ~5.0:1 | non-text 3:1 ✓ |

`--ink-faint` is for disabled and placeholder states only and is not held to AA,
consistent with how those states are exempted. Every pair is re-checked during
implementation rather than taken from this table on faith.

## Typography

| Role | Face | Rules |
|---|---|---|
| Wordmark | Parisienne | Her name. Minimum 2.5rem. |
| Accent | Parisienne | The corner line "More Beautiful Things Ahead", minimum 1.6rem, hidden below 1180px. Nowhere else. |
| Everything | Manrope | Weights 200–600. Weight 200 for the headline figure. |
| Figures | Manrope | `font-variant-numeric: tabular-nums` wherever digits align in a column |

Cormorant Garamond is **removed**. It was the serif for the old uppercase
wordmark, which no longer exists, and a third face earns nothing.

## The florals

They are not one thing and are not treated as one:

- **`Sprig`** is decoration with no data behind it. **Retired**, and its file
  deleted along with the corner positioning in `florals.module.css`.
- **`Bloom`** is the savings-goal progress indicator. Its petals encode
  `pctComplete` and it carries an accessible label with real figures. **Kept**,
  restyled: petals fill in `--blue-light` against the dark ground, centre in
  `--warm` rather than the old `--sun-warm`.

Deleting Bloom would remove a working progress indicator and replace it with
nothing. Keeping Sprig would contradict the direction's premise.

## The notes

### Shape

```ts
// lib/notes.ts
export const NOTES: string[] = ["", "", ""];
export function noteForDay(today: ISODate, notes: string[]): string | null;
```

`noteForDay` filters blanks, returns `null` when nothing remains, and otherwise
picks deterministically by day-of-year modulo the number of non-empty notes.

### Rules this encodes

- **One at a time.** Three stacked affirmations read like a greetings card. One
  reads like it was left there.
- **Rotates by date, not at random.** The same day shows the same note, so it is
  stable within a day and testable without mocking a clock. `today` is a
  parameter, matching every other function in `lib/budget`.
- **Degrades to nothing.** Empty strings are filtered before the modulo, so
  writing one note works as well as writing three, and writing none renders no
  section at all. The page is correct before a single word is written.

### Placement

Beneath the wordmark and its hairline, above the daily figure. Set in
`--ink-soft` at 0.78rem with `0.04em` tracking — deliberately quieter than the
money, so it reads as an aside rather than a banner.

### Voice

Chance writes all three. They affirm her **as a person**, not her handling of
money — the distinction matters most on a screen that may be showing a number
she is unhappy about. The file ships with three empty strings and a comment
explaining the constraint; nothing else in the build waits on it.

## What changes, by file

| File | Change |
|---|---|
| `app/globals.css` | Palette replaced; `color-scheme: dark`; body ground |
| `app/layout.tsx` | Cormorant removed; `themeColor` → `#0f2438`; `colorScheme: "dark"` |
| `app/landing.module.css` | Sky gradient → night ground; wordmark rules; sprig positioning removed |
| `app/page.tsx` | Sprigs removed; note slot added |
| `components/Hero.tsx` | Warm hairline under the wordmark |
| `components/florals/Sprig.tsx` | **Deleted** |
| `components/florals/Bloom.tsx` | Petal and centre colours |
| `app/(private)/budget/budget.module.css` | `#b4553f` → `--over`; shadow; surfaces |
| `app/(private)/budget/goals/goals.module.css` | `#b4553f` → `--over`; surfaces |
| `components/budget/EnvelopeCard.tsx` | No change — styles through tokens |
| `lib/notes.ts` | **New** |
| `lib/notes.test.ts` | **New** |

`EnvelopeCard` needing no change is the point: the existing screens style through
tokens, so most of this rework is the token swap. The exceptions are the two
hardcoded reds, the shadow, and the florals.

## Onboarding

Unchanged in flow — `2026-09-13-flexible-allocation-and-bills-design.md` still
governs its three steps. It simply gets built in Nightfall rather than in the
coastal palette, which is why the token work precedes it.

## Out of scope

- A light theme. Deliberate, per the decision above.
- Animating the note in or between days. It is present on load, like everything
  else on the page.
- Notes anywhere but the home page. Onboarding is a one-time flow; a note placed
  there is read once and never again.
- Letting Nadya edit or dismiss the notes. They are from him.

## Testing

`noteForDay` is a pure function and gets the same treatment as `lib/budget`:
empty input, all-blank input, one note, three notes, rotation across a year
boundary, and stability within a single day. Contrast pairs are verified against
the rendered page, not asserted from this document.

## Sequencing

Schema → tokens → onboarding. Building onboarding before the tokens would mean
building those screens twice.
