"use client";

import { useState } from "react";

/**
 * The things people actually put money aside for, in the words they would
 * use out loud. Short enough to scan in one pass on a phone.
 *
 * Names, never amounts. A suggested figure would be a number she did not
 * choose sitting in a field she is about to submit, and nothing in this app
 * is seeded with a guess -- so no target and no date come with these.
 */
const GOAL_SUGGESTIONS = [
  "A trip",
  "Emergency fund",
  "Christmas",
  "A car",
  "House things",
  "Birthdays",
  "Back to school",
];

/**
 * The goal name, typed or picked.
 *
 * The text field is the real one -- it carries `name="name"` and it is what
 * submits. The dropdown beside it only writes into it, so a name of her own
 * is the first thing on the row rather than something behind an "other".
 *
 * Class names come from the page so the pair matches the form it sits in.
 */
export function GoalNameField({
  className,
  inputClassName,
  selectClassName,
}: {
  className?: string;
  inputClassName?: string;
  selectClassName?: string;
}) {
  const [name, setName] = useState("");

  // Once she edits the text the dropdown falls back to its prompt, because
  // it no longer describes what is in the field.
  const picked = GOAL_SUGGESTIONS.includes(name) ? name : "";

  return (
    <div className={className}>
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What for?"
        required
        maxLength={60}
        autoComplete="off"
        aria-label="Goal name"
        className={inputClassName}
      />
      <select
        value={picked}
        // The prompt itself is not a name; choosing it must not wipe hers.
        onChange={(e) => {
          if (e.target.value !== "") setName(e.target.value);
        }}
        aria-label="Pick a common goal"
        className={selectClassName}
      >
        <option value="">Or pick one…</option>
        {GOAL_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion}>
            {suggestion}
          </option>
        ))}
      </select>
    </div>
  );
}
