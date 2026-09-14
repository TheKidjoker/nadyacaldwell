"use client";

import { useId, useRef, useState } from "react";
import { createSection } from "@/lib/notes-actions";
import styles from "./notes.module.css";

/**
 * The only way a section comes into existence.
 *
 * Nothing is preset and nothing is suggested: the names are hers, and a list
 * of starter names would be the app deciding what she keeps. The one thing she
 * has to choose besides the name is which of the two shapes it is, because
 * that is what decides whether entries get a day or a tick-box.
 */
export function AddSectionSlot({ quiet }: { quiet: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${styles.addButton} ${quiet ? styles.addButtonQuiet : ""}`}
      >
        <span className={styles.addPlus} aria-hidden="true">
          +
        </span>
        new section
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      className={styles.slot}
      action={async (formData) => {
        setSaving(true);
        setError(null);
        try {
          await createSection(formData);
          formRef.current?.reset();
          setOpen(false);
        } catch {
          setError("That didn't save. A section needs a name.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor={nameId}>
          Call it
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          maxLength={60}
          required
          autoFocus
          autoComplete="off"
          className={styles.input}
        />
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>What goes in it</legend>
        <div className={styles.choice}>
          <label className={styles.choiceOption}>
            <span className={styles.choiceTop}>
              <input
                type="radio"
                name="kind"
                value="journal"
                defaultChecked
              />
              Writing
            </span>
            <span className={styles.choiceWhy}>Dated entries, as long as you like</span>
          </label>
          <label className={styles.choiceOption}>
            <span className={styles.choiceTop}>
              <input type="radio" name="kind" value="todo" />
              A list
            </span>
            <span className={styles.choiceWhy}>Things to tick off</span>
          </label>
        </div>
      </fieldset>

      <p className={styles.slotNote}>
        This can&rsquo;t be changed later, but you can have as many sections as
        you want.
      </p>

      <div className={styles.actions}>
        <button type="submit" disabled={saving} className={styles.submit}>
          {saving ? "Saving…" : "Make it"}
        </button>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
