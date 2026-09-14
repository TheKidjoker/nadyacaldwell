"use client";

import { useId, useOptimistic, useRef, useState } from "react";
import { deleteEntry, setEntryDone, updateEntry } from "@/lib/notes-actions";
import type { NoteEntry } from "@/lib/db/notes";
import { MoveEntry } from "./MoveEntry";
import styles from "./notes.module.css";

/**
 * One thing to do.
 *
 * The tick is optimistic: `useOptimistic` flips the box the instant she taps
 * it and the server's answer replaces that when it lands, so the control never
 * sits there looking broken on a slow connection. The target state travels in
 * the form rather than being derived server-side from what is stored, so two
 * quick taps settle on what she asked for instead of racing.
 */
export function TodoItem({
  entry,
  isFirst,
  isLast,
}: {
  entry: NoteEntry;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [done, setDone] = useOptimistic(entry.done);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLFormElement>(null);
  const textId = useId();
  const noteId = useId();

  const label = entry.title ?? "this item";

  return (
    <li className={styles.entry}>
      <div className={styles.todo}>
        <form
          ref={toggleRef}
          className={styles.toolForm}
          action={async (formData) => {
            setDone(!entry.done);
            setError(null);
            try {
              await setEntryDone(formData);
            } catch {
              setError("That didn't save.");
            }
          }}
        >
          <input type="hidden" name="entryId" value={entry.id} />
          <input
            type="hidden"
            name="done"
            value={entry.done ? "false" : "true"}
          />
          <span className={styles.todoCheck}>
            <input
              type="checkbox"
              checked={done}
              onChange={() => toggleRef.current?.requestSubmit()}
              aria-label={`Done: ${label}`}
              className={styles.checkbox}
            />
          </span>
        </form>

        <p className={styles.todoText}>
          <span className={done ? styles.todoTextDone : undefined}>
            {entry.title}
          </span>
          {entry.body !== "" && (
            <span className={styles.todoNote}>{entry.body}</span>
          )}
        </p>

        <div className={styles.todoTools}>
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
                setError("That didn't save. The item needs some words.");
              }
            }}
          >
            <input type="hidden" name="entryId" value={entry.id} />

            <div className={styles.field}>
              <label className={styles.label} htmlFor={textId}>
                Item
              </label>
              <input
                id={textId}
                name="title"
                type="text"
                defaultValue={entry.title ?? ""}
                maxLength={200}
                required
                autoComplete="off"
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor={noteId}>
                Note (optional)
              </label>
              <textarea
                id={noteId}
                name="body"
                rows={3}
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
                  Delete this item
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
