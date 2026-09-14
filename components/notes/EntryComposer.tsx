"use client";

import { useId, useRef, useState } from "react";
import { createEntry } from "@/lib/notes-actions";
import type { NoteSectionKind } from "@/lib/notes-core";
import styles from "./notes.module.css";

/**
 * Where she writes.
 *
 * For a journal this is open from the moment the page loads — no "add entry"
 * button to press first — and the field has no border of its own, so what she
 * sees is a sheet of paper on a card rather than a form control. The date sits
 * under it, already filled in with today, because the common case is that she
 * is writing about now and should not have to say so.
 *
 * For a list it collapses to a single line and a button, because that is all
 * an item is.
 */
export function EntryComposer({
  sectionId,
  kind,
  today,
  encrypted,
}: {
  sectionId: string;
  kind: NoteSectionKind;
  today: string;
  /** A protected section can lock itself between her opening the page and
      pressing save, which is the other thing a failure here can mean. */
  encrypted: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dayId = useId();

  async function save(formData: FormData) {
    setSaving(true);
    setError(null);
    try {
      await createEntry(formData);
      formRef.current?.reset();
    } catch {
      setError(
        encrypted
          ? "That didn't save. Either there's nothing in it, or the section locked itself while you were away — reload the page to check."
          : kind === "todo"
            ? "That didn't save. Give the item some words."
            : "That didn't save. Write something first.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (kind === "todo") {
    return (
      <>
        <form ref={formRef} action={save} className={styles.addLine}>
          <input type="hidden" name="sectionId" value={sectionId} />
          <input
            name="title"
            type="text"
            maxLength={200}
            required
            autoComplete="off"
            placeholder="Add something"
            aria-label="New item"
            className={styles.addLineInput}
          />
          <button type="submit" disabled={saving} className={styles.submit}>
            Add
          </button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
      </>
    );
  }

  return (
    <>
      <form ref={formRef} action={save} className={styles.composer}>
        <input type="hidden" name="sectionId" value={sectionId} />
        <textarea
          name="body"
          rows={5}
          maxLength={20000}
          placeholder="Anything you like."
          aria-label="What you want to write"
          className={styles.writing}
        />
        <div className={styles.composerFoot}>
          <span className={styles.dayField}>
            <label className={styles.label} htmlFor={dayId}>
              Day
            </label>
            <input
              id={dayId}
              name="entryOn"
              type="date"
              defaultValue={today}
              className={styles.dayInput}
            />
          </span>
          <button
            type="submit"
            disabled={saving}
            className={`${styles.submit} ${styles.composerSubmit}`}
          >
            {saving ? "Saving…" : "Keep it"}
          </button>
        </div>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  );
}
