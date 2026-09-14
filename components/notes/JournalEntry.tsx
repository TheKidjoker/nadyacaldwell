"use client";

import { useId, useState } from "react";
import { deleteEntry, updateEntry } from "@/lib/notes-actions";
import { formatEntryDay } from "@/lib/notes-core";
import type { NoteEntry } from "@/lib/db/notes";
import { MoveEntry } from "./MoveEntry";
import styles from "./notes.module.css";

/**
 * One dated piece of writing.
 *
 * At rest it is a day, an optional heading and her paragraphs exactly as she
 * typed them — no card chrome competing with the words. Editing swaps the same
 * text into a textarea in place rather than sending her to another screen,
 * which is what keeps a one-word fix a one-word fix.
 */
export function JournalEntry({
  entry,
  today,
  isFirst,
  isLast,
}: {
  entry: NoteEntry;
  today: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const dayId = useId();

  const day = entry.entryOn ? formatEntryDay(entry.entryOn, today) : "";
  const label = entry.title ?? (day || "this entry");

  return (
    <li className={styles.entry}>
      <div className={styles.entryBody}>
        {day && <p className={styles.entryDay}>{day}</p>}
        {entry.title && <h2 className={styles.entryTitle}>{entry.title}</h2>}
        {entry.body !== "" && <p className={styles.entryText}>{entry.body}</p>}
      </div>

      <div className={styles.entryTools}>
        <MoveEntry
          entryId={entry.id}
          label={label}
          isFirst={isFirst}
          isLast={isLast}
        />
        <button
          type="button"
          onClick={() => {
            setEditing(!editing);
            setArmed(false);
            setError(null);
          }}
          aria-expanded={editing}
          className={`${styles.tool} ${editing ? styles.toolOpen : ""}`}
          aria-label={`Edit ${label}`}
        >
          <span aria-hidden="true">&#9998;</span>
        </button>
      </div>

      {editing && (
        <div className={styles.editPanel}>
          <form
            action={async (formData) => {
              setError(null);
              try {
                await updateEntry(formData);
                setEditing(false);
              } catch {
                setError("That didn't save. There has to be something in it.");
              }
            }}
          >
            <input type="hidden" name="entryId" value={entry.id} />

            <div className={styles.editRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={titleId}>
                  Heading (optional)
                </label>
                <input
                  id={titleId}
                  name="title"
                  type="text"
                  defaultValue={entry.title ?? ""}
                  maxLength={200}
                  autoComplete="off"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={dayId}>
                  Day
                </label>
                <input
                  id={dayId}
                  name="entryOn"
                  type="date"
                  defaultValue={entry.entryOn ?? today}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor={bodyId}>
                Writing
              </label>
              <textarea
                id={bodyId}
                name="body"
                rows={7}
                maxLength={20000}
                defaultValue={entry.body}
                className={styles.editWriting}
              />
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.submit}>
                Save
              </button>
              <button
                type="button"
                className={styles.cancel}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>

          <form
            action={async (formData) => {
              setError(null);
              try {
                await deleteEntry(formData);
              } catch {
                setError("That didn't delete.");
                setArmed(false);
              }
            }}
            className={styles.actions}
          >
            <input type="hidden" name="entryId" value={entry.id} />
            {armed ? (
              <>
                <button
                  type="submit"
                  className={`${styles.danger} ${styles.dangerArmed}`}
                >
                  Delete this entry
                </button>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => setArmed(false)}
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.danger}
                onClick={() => setArmed(true)}
              >
                Delete
              </button>
            )}
          </form>

          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </li>
  );
}
