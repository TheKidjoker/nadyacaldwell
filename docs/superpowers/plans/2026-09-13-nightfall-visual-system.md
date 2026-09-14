# Nightfall Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pale coastal palette with "Nightfall" — a deep navy ground where Nadya's baby blue becomes the light — and put three rotating notes from Chance on the home page.

**Architecture:** The existing screens already style through CSS custom properties, so redefining the token block does most of the rework. The work that is not free: every old token name is renamed at its call sites, four hardcoded colours become tokens, `Sprig` is deleted while `Bloom` is restyled, and one new pure module picks the note of the day.

**Tech Stack:** Next.js 16.3.4 (App Router), React 19.2.8, TypeScript 5, Vitest 5, CSS Modules, Google Fonts (Parisienne, Manrope).

## Global Constraints

- **Source spec:** `docs/superpowers/specs/2026-09-13-nightfall-visual-system-design.md`. Where it disagrees with the older design docs on anything visual, it wins.
- **Read the bundled Next.js docs before changing any component.** `node_modules/next/dist/docs/` — this is not the Next.js in your training data.
- **One theme only.** Nightfall is a dark design, not a dark mode. Do not add a `prefers-color-scheme` branch or a light variant.
- **An undefined CSS custom property fails silently to nothing.** A missed rename is an invisible bug, not a build error. Task 6 greps for leftovers; do not skip it.
- **Parisienne is for her name and nothing else**, never below 2.5rem. Manrope carries everything else.
- **Pure modules are clock-free.** `lib/notes.ts` takes `today` as a parameter and must never call `new Date()` with no argument.
- **Existing style:** double-quoted strings, semicolons, named exports. Match `lib/budget/calc.ts`.

## Token reference

Every task below uses these. They are defined once in Task 2.

| Token | Value | Role |
|---|---|---|
| `--night-deep` | `#071320` | Page ground |
| `--night` | `#0f2438` | Raised surface |
| `--night-line` | `#1b3550` | Hairlines, bar tracks |
| `--blue-light` | `#9ac5e7` | Accent, fills, wordmark |
| `--blue-mid` | `#6ba1cd` | Secondary fills |
| `--ink` | `#eaf4fc` | Primary text |
| `--ink-soft` | `#7d9cb8` | Secondary text |
| `--ink-faint` | `#54708c` | Disabled, placeholder |
| `--warm` | `#b08d57` | The single hairline under the wordmark |
| `--over` | `#e08a72` | Overspent / overdue |

| Old name | Becomes |
|---|---|
| `--pearl` | `--night` |
| `--ink-body` | `--ink` |
| `--sea-near` | `--blue-light` |
| `--sea-mid` | `--blue-mid` |
| `--sea-far` | `--night-line` |
| `--sun-warm` | `--warm` |
| `--sky-*`, `--horizon`, `--horizon-line`, `--sun-core` | removed |

## File structure

| File | Responsibility |
|---|---|
| `lib/notes.ts` | **New.** The three notes and the day-picker. Pure. |
| `lib/notes.test.ts` | **New.** |
| `app/globals.css` | **Modify.** The token block and the body ground. |
| `app/layout.tsx` | **Modify.** Drop Cormorant; dark theme meta. |
| `app/landing.module.css` | **Modify.** Night ground, wordmark, note. |
| `app/page.tsx` | **Modify.** Sprigs out, note in. |
| `components/Hero.tsx` | **Modify.** Warm hairline. |
| `components/florals/Sprig.tsx` | **Delete.** |
| `components/florals/florals.module.css` | **Delete.** Only positioned Sprig. |
| `components/florals/Bloom.tsx` | **Modify.** Petal colours. |
| `app/(private)/budget/budget.module.css` | **Modify.** Token renames, `--over`, shadow. |
| `app/(private)/budget/goals/goals.module.css` | **Modify.** Token renames, `--over`. |

---

## Task 1: The note of the day

Pure logic, no styling. Built first so the home page has something real to render.

**Files:**
- Create: `lib/notes.ts`
- Test: `lib/notes.test.ts`

**Interfaces:**
- Consumes: `ISODate` from `lib/budget/dates.ts`
- Produces:
  - `NOTES: string[]` — the three notes, shipped empty for Chance to fill
  - `noteForDay(today: ISODate, notes?: string[]): string | null`

- [ ] **Step 1: Write the failing tests**

Create `lib/notes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { noteForDay } from "./notes";

const THREE = ["first", "second", "third"];

describe("noteForDay — nothing written yet", () => {
  it("returns null for an empty list", () => {
    expect(noteForDay("2026-09-14", [])).toBeNull();
  });

  it("returns null when every note is blank", () => {
    expect(noteForDay("2026-09-14", ["", "", ""])).toBeNull();
  });

  it("returns null when every note is only whitespace", () => {
    expect(noteForDay("2026-09-14", ["   ", "\n", "  \t "])).toBeNull();
  });
});

describe("noteForDay — partially written", () => {
  it("always returns the only note there is", () => {
    for (const d of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(noteForDay(d, ["", "only one", ""])).toBe("only one");
    }
  });

  it("rotates over just the non-blank notes", () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 28; i++) {
      const day = `2026-02-${String(i).padStart(2, "0")}`;
      seen.add(noteForDay(day, ["a", "", "b"])!);
    }
    expect([...seen].sort()).toEqual(["a", "b"]);
  });
});

describe("noteForDay — rotation", () => {
  it("returns the same note twice on the same day", () => {
    expect(noteForDay("2026-09-14", THREE)).toBe(noteForDay("2026-09-14", THREE));
  });

  it("changes from one day to the next", () => {
    expect(noteForDay("2026-09-14", THREE)).not.toBe(noteForDay("2026-09-15", THREE));
  });

  it("shows all three across three consecutive days", () => {
    const run = ["2026-03-01", "2026-03-02", "2026-03-03"].map((d) => noteForDay(d, THREE));
    expect([...run].sort()).toEqual(["first", "second", "third"]);
  });

  it("keeps rotating across a year boundary", () => {
    const a = noteForDay("2026-12-31", THREE);
    const b = noteForDay("2027-01-01", THREE);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it("handles a leap year without repeating a day", () => {
    expect(noteForDay("2028-02-29", THREE)).not.toBe(noteForDay("2028-03-01", THREE));
  });

  it("trims surrounding whitespace off what it returns", () => {
    expect(noteForDay("2026-09-14", ["  padded  "])).toBe("padded");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./notes"`.

- [ ] **Step 3: Implement `lib/notes.ts`**

```ts
/**
 * Notes from Chance to Nadya, shown one at a time on the home page.
 *
 * These affirm her as a person, not her handling of money -- the distinction
 * matters most on a screen that may be showing a number she is unhappy about.
 *
 * Chance writes all three. Leave any of them empty and the page simply shows
 * one of the others; leave all three empty and the section does not render.
 */
import type { ISODate } from "@/lib/budget/dates";

export const NOTES: string[] = ["", "", ""];

const MS_PER_DAY = 86_400_000;

/** Days since the start of the given year, 0-based. */
function dayOfYear(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  return Math.round((Date.UTC(y, m - 1, d) - start) / MS_PER_DAY);
}

/**
 * The note for a given day, or null when nothing has been written.
 *
 * Rotation is by date rather than random so the same day always shows the same
 * note -- stable while she is using the app, and testable without a clock.
 */
export function noteForDay(
  today: ISODate,
  notes: string[] = NOTES,
): string | null {
  const written = notes.map((n) => n.trim()).filter((n) => n.length > 0);
  if (written.length === 0) return null;
  return written[dayOfYear(today) % written.length];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all note tests green.

- [ ] **Step 5: Confirm it reads no clock**

Run: `grep -n "new Date()" lib/notes.ts`
Expected: **no matches.**

- [ ] **Step 6: Commit**

```bash
git add lib/notes.ts lib/notes.test.ts
git commit -m "Add the note of the day

Rotation is by date rather than random, so the same day always shows the
same note -- stable while she is using the app, and testable without
mocking a clock.

Blank notes are filtered before the rotation, so writing one works as
well as writing three and writing none renders no section at all."
```

---

## Task 2: The token block

The single change that does most of the rework, because the existing screens already style through these names.

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: the ten tokens in the reference table above, plus `--ease-soft`

- [ ] **Step 1: Replace the palette in `app/globals.css`**

Replace everything from `:root {` through the closing brace of that block with:

```css
:root {
  /* Ground. Nightfall is a dark design, not a dark mode -- there is no
     light variant, and no prefers-color-scheme branch anywhere. */
  --night-deep: #071320;
  --night: #0f2438;
  --night-line: #1b3550;

  /* Her blue, promoted from background to light. On a pale ground it was a
     tint behind tinted text, which is what made the old site read washed. */
  --blue-light: #9ac5e7;
  --blue-mid: #6ba1cd;

  /* Ink */
  --ink: #eaf4fc;
  --ink-soft: #7d9cb8;
  --ink-faint: #54708c;

  /* The one warm thing on the page: a hairline under her name. */
  --warm: #b08d57;

  /* Overspent and overdue. The old #b4553f was picked for a white ground
     and goes muddy on navy, losing the warning it exists to carry. */
  --over: #e08a72;

  --ease-soft: cubic-bezier(0.33, 0.1, 0.2, 1);

  color-scheme: dark;
}
```

- [ ] **Step 2: Repoint the body in `app/globals.css`**

Find the `html, body` rule and change its background, then the `body` rule's colour:

```css
html,
body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  background: var(--night-deep);
}
```

```css
body {
  min-height: 100vh;
  min-height: 100dvh;
  color: var(--ink);
  font-family: var(--font-sans), "Segoe UI", system-ui, sans-serif;
  font-synthesis-weight: none;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

Also update the focus ring so it is visible on navy:

```css
:focus-visible {
  outline: 2px solid var(--blue-light);
  outline-offset: 4px;
  border-radius: 2px;
}
```

- [ ] **Step 3: Drop Cormorant and go dark in `app/layout.tsx`**

Remove the `Cormorant_Garamond` import and its `serif` constant entirely — nothing uses `--font-serif` any more, and an unused font is a download for nothing. Remove `${serif.variable}` from the `<html>` className.

Then change the viewport block:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page paint into the notch area so env(safe-area-inset-*) is live.
  viewportFit: "cover",
  themeColor: "#0f2438",
  colorScheme: "dark",
};
```

- [ ] **Step 4: Confirm nothing still wants Cormorant**

Run: `grep -rn "font-serif\|Cormorant" app components`
Expected: **no matches.**

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. The pages will look broken at this point — old token names no longer resolve — and Task 3 fixes that.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "Replace the coastal palette with Nightfall tokens

The old palette was a pale tint behind slate-blue text, so every pairing
on the page was low-contrast. On a deep navy ground the same blue becomes
luminous rather than flat.

Cormorant goes with it: nothing has used --font-serif since the wordmark
became script, and an unused webfont is a download for nothing."
```

---

## Task 3: Rename every old token at its call sites

**Files:**
- Modify: `app/(private)/budget/budget.module.css`
- Modify: `app/(private)/budget/goals/goals.module.css`

**Interfaces:**
- Consumes: the tokens from Task 2
- Produces: nothing new

- [ ] **Step 1: Swap the names in both stylesheets**

Run these from the repo root. Order matters: `--ink-body` is replaced before `--ink` would match it.

```bash
for f in "app/(private)/budget/budget.module.css" "app/(private)/budget/goals/goals.module.css"; do
  sed -i \
    -e 's/var(--ink-body)/var(--ink)/g' \
    -e 's/var(--pearl)/var(--night)/g' \
    -e 's/var(--sea-near)/var(--blue-light)/g' \
    -e 's/var(--sea-mid)/var(--blue-mid)/g' \
    -e 's/var(--sea-far)/var(--night-line)/g' \
    -e 's/var(--sun-warm)/var(--warm)/g' \
    "$f"
done
```

- [ ] **Step 2: Replace the hardcoded overspend red**

There are three instances, all `#b4553f`:

```bash
sed -i 's/#b4553f/var(--over)/g' \
  "app/(private)/budget/budget.module.css" \
  "app/(private)/budget/goals/goals.module.css"
```

- [ ] **Step 3: Replace the light-theme shadow**

In `app/(private)/budget/budget.module.css`, the `.quickAdd` rule has `box-shadow: 0 2px 12px rgb(62 90 121 / 0.12);`. A shadow tinted with light-ground blue does nothing on navy. Replace it with:

```css
  box-shadow: 0 6px 20px rgb(2 8 16 / 0.55);
```

- [ ] **Step 4: Fix the surfaces that assumed a light ground**

In `app/(private)/budget/budget.module.css`, the envelope border uses `color-mix` against `--ink-faint`, which was tuned for white. Replace the `.envelope` border and the `.bar` background:

```css
.envelope {
  border: 1px solid var(--night-line);
  border-radius: 0.75rem;
  padding: 0.9rem 1rem;
  background: var(--night);
}
```

```css
.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--night-line);
  overflow: hidden;
  margin: 0.6rem 0 0.5rem;
}
```

Make the same two substitutions in `app/(private)/budget/goals/goals.module.css`, where `.goal` carries the identical `color-mix` border:

```css
.goal {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  align-items: start;
  border: 1px solid var(--night-line);
  border-radius: 0.75rem;
  padding: 1rem;
  background: var(--night);
}
```

- [ ] **Step 5: Verify no old token survives in these files**

Run:

```bash
grep -rn "var(--sky\|var(--sea\|var(--pearl\|var(--ink-body\|var(--sun\|#b4553f\|color-mix" "app/(private)"
```

Expected: **no matches.**

- [ ] **Step 6: Commit**

```bash
git add "app/(private)"
git commit -m "Repoint the budget screens at the Nightfall tokens

The overspend red was hardcoded in three places and chosen for a white
ground; on navy it goes muddy and stops carrying the warning it exists
for. It is now a token, lightened for dark.

The quick-add shadow was tinted with light-ground blue, which is
invisible against navy."
```

---

## Task 4: The landing page

**Files:**
- Modify: `app/landing.module.css`
- Modify: `app/page.tsx`
- Modify: `components/Hero.tsx`

**Interfaces:**
- Consumes: `noteForDay` from `lib/notes.ts`, tokens from Task 2
- Produces: nothing later tasks rely on

- [ ] **Step 1: Replace the stage gradient**

In `app/landing.module.css`, replace the whole `.stage` rule with:

```css
.stage {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  /* No overflow rule here: globals.css already clips horizontally on html and
   * body, and any overflow-x on this element would compute overflow-y to auto,
   * nesting a second scrollbar once the dashboard outgrows the viewport. */
  background:
    radial-gradient(120% 80% at 50% 0%, #122c45 0%, transparent 60%),
    var(--night-deep);
}
```

- [ ] **Step 2: Give the wordmark its hairline**

In `app/landing.module.css`, replace the `.name` rule and the `.rule` block that follows it. The old `.rule` was a diamond flanked by two gradient strokes — ornament the direction retires. Delete the `.rule`, `.rule span`, `.rule span + span`, `.rule::before`, `.rule span:first-child` and `.rule span:last-child` rules entirely and put this in their place:

```css
.name {
  font-family: var(--font-script), "Segoe Script", cursive;
  font-weight: 400;
  /* The script is the only expressive thing on the page, so it earns real
   * size. Small cursive among ornament reads sweet; one large signature in a
   * quiet room reads considered. Never below 2.5rem. */
  font-size: clamp(3.4rem, 13vw, 7rem);
  line-height: 1.08;
  letter-spacing: 0.01em;
  color: var(--ink);
  animation: rise 1.3s var(--ease-soft) both 0.15s;
}

.hairline {
  width: 2.6rem;
  height: 1px;
  margin: 1rem auto 0;
  background: var(--warm);
  opacity: 0.8;
  animation: rise 1.1s var(--ease-soft) both 0.5s;
}

.note {
  margin: 1.4rem auto 0;
  max-width: 24rem;
  font-size: 0.82rem;
  line-height: 1.6;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  animation: rise 1.15s var(--ease-soft) both 0.7s;
}
```

- [ ] **Step 3: Delete the light-ground glow**

Still in `app/landing.module.css`, the `.contentInner::before` radial gradient paints white behind the type to lift it off a pale sky. On navy it is a grey smear. Delete the whole `.contentInner::before` rule, and delete the `@media (max-width: 640px)` override of it as well.

- [ ] **Step 4: Rewrite `components/Hero.tsx`**

```tsx
import styles from "@/app/landing.module.css";

export function Hero({ note }: { note: string | null }) {
  return (
    <div className={styles.heading}>
      <h1 className={styles.name}>Nadya</h1>
      <div className={styles.hairline} aria-hidden="true" />
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Wire it up in `app/page.tsx`**

Remove both `<Sprig …>` elements and the `Sprig` and `florals` imports. Add the note import and pass it in:

```tsx
import { noteForDay } from "@/lib/notes";
```

Inside the component, after `const today = …`:

```tsx
  const note = noteForDay(today);
```

and change the `<Hero />` call in **both** the empty-state branch and the main return to:

```tsx
          <Hero note={note} />
```

- [ ] **Step 6: Check it renders**

Run: `npm run dev`, then open `http://localhost:3000`.

Expected: a deep navy page, her name in script at roughly 7rem on desktop, a short warm hairline beneath it, and **no note** — because `NOTES` is still three empty strings, and that is correct. No horizontal scrollbar.

- [ ] **Step 7: Confirm the empty note renders nothing rather than a gap**

Temporarily set the first entry of `NOTES` in `lib/notes.ts` to `"test note"`, reload, confirm it appears under the hairline, then set it back to `""` and confirm the space closes up.

- [ ] **Step 8: Commit**

```bash
git add app/landing.module.css app/page.tsx components/Hero.tsx
git commit -m "Rebuild the landing page in Nightfall

The script wordmark gets real size and a single warm hairline; the
diamond rule and the white glow behind the type both go, the first as
ornament the direction retires and the second because it was there to
lift type off a pale sky.

The note renders only when there is one, so the page is correct before a
word has been written."
```

---

## Task 5: Retire Sprig, restyle Bloom

They are not the same kind of thing and are not treated as one.

**Files:**
- Delete: `components/florals/Sprig.tsx`
- Delete: `components/florals/florals.module.css`
- Modify: `components/florals/Bloom.tsx`

**Interfaces:**
- Consumes: tokens from Task 2
- Produces: `Bloom` keeps its exact existing props — `progress`, `label`, `size`

- [ ] **Step 1: Confirm nothing imports Sprig any more**

Run: `grep -rn "Sprig\|florals.module" app components`
Expected: **no matches.** Task 4 removed the only two usages. If anything is left, fix that first.

- [ ] **Step 2: Delete both files**

```bash
git rm components/florals/Sprig.tsx components/florals/florals.module.css
```

- [ ] **Step 3: Restyle Bloom's petals**

In `components/florals/Bloom.tsx`, change the `<ellipse>` fill and stroke and the centre `<circle>` fill. Everything else — the petal maths, the clamping, the `role`/`aria-label` handling — stays exactly as it is:

```tsx
            fill="var(--blue-light)"
            fillOpacity={0.14 + fill * 0.76}
            stroke="var(--blue-mid)"
            strokeOpacity={0.4}
            strokeWidth="1"
```

and:

```tsx
      <circle cx="50" cy="50" r="9" fill="var(--warm)" />
```

The opacity floor drops from `0.18` to `0.14` because an unfilled petal has to read as *empty* against a dark ground, where a faint fill shows up more than it did on white.

- [ ] **Step 4: Check the goals page**

Run: `npm run dev`, open `http://localhost:3000/budget/goals`.

Expected: the page renders on navy. With no goals there is nothing to see, which is correct — the store is empty. Confirm no console errors and no broken layout.

- [ ] **Step 5: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Retire Sprig, restyle Bloom for the dark ground

Sprig is decoration with no data behind it. Bloom is the savings-goal
progress indicator -- its petals encode pctComplete and it carries an
accessible label with real figures -- so it stays and changes colour.

The unfilled-petal opacity drops because a faint fill reads as present
against navy in a way it did not against white."
```

---

## Task 6: Verification pass

Nothing new is built here. This is the task that catches what silently failed.

**Files:** none

- [ ] **Step 1: Prove no old token survives anywhere**

```bash
grep -rn "var(--sky\|var(--sea\|var(--pearl\|var(--ink-body\|var(--sun\|var(--horizon\|var(--font-serif)" app components lib
```

Expected: **no matches.** Each hit is a property that resolves to nothing and paints a default — invisible in review, obvious to Nadya.

- [ ] **Step 2: Prove no hardcoded colour survives outside globals**

```bash
grep -rnE "#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}\b|rgb\(" app components --include=*.css --include=*.tsx | grep -v "globals.css"
```

Expected: only the two gradient stops inside `.stage` in `app/landing.module.css` and the shadow in `.quickAdd`. Anything else is a colour that will not follow the theme.

- [ ] **Step 3: Full suite, types, production build**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 4: Look at every route**

Run `npm run dev` and open each of `/`, `/budget`, `/budget/goals`.

For each, confirm: text is legible against its ground, no element has vanished into the background, no horizontal scrollbar, and focus rings are visible when tabbing.

- [ ] **Step 5: Check contrast on the real page**

In Chrome DevTools, inspect the secondary text (`--ink-soft` on `--night`) and the hairline. The spec computes these as ~5.4:1 and ~5.0:1; confirm DevTools agrees they pass AA for text and 3:1 for non-text. If either falls short, lighten the token in `globals.css` rather than patching the call site.

- [ ] **Step 6: Check it at 375px**

Resize to 375px wide. Confirm the wordmark does not overflow, the note wraps rather than clipping, and nothing scrolls sideways.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "Fix what the Nightfall verification pass turned up"
```

If nothing needed fixing, skip this step rather than making an empty commit.

---

## Self-review notes

**Spec coverage.** Tokens (Task 2), the migration table (Tasks 2–3), contrast (Task 6), typography and dropping Cormorant (Task 2), Sprig and Bloom (Task 5), the notes module and its rules (Task 1), placement and styling of the note (Task 4), single-theme commitment (Task 2), and the testing requirements (Tasks 1 and 6). No spec section is unimplemented.

**One addition the spec did not name.** `.contentInner::before` paints a white radial glow behind the landing type — it exists to lift text off a pale sky and becomes a grey smear on navy. Task 4 Step 3 deletes it. The spec's file table said "sprig positioning removed" for `landing.module.css` but did not mention the glow or the diamond rule; both are the same class of change and are handled there.

**Type consistency.** `noteForDay(today, notes?)` is defined once in Task 1 and called with a single argument in Task 4, relying on the `NOTES` default. `Hero` gains exactly one prop, `note: string | null`, defined in Task 4 Step 4 and passed at both call sites in Step 5. `Bloom`'s props are explicitly unchanged.
