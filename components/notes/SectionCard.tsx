"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  deleteSection,
  moveSection,
  renameSection,
} from "@/lib/notes-actions";
import { summarizeSection } from "@/lib/notes-core";
import type { NoteSectionSummary } from "@/lib/db/notes";
import styles from "./notes.module.css";

/**
 * One of her sections on the index.
 *
 * Moving is two arrows rather than a drag: a drag on a phone fights the
 * scroller, and it is unreachable from a keyboard. The arrows are real submit
 * buttons in their own little forms, and the one that cannot go anywhere is
 * disabled rather than silently doing nothing.
 *
 * Renaming and deleting live behind the ⋯ toggle so the resting row stays a
 * name and a count.
 */
export function SectionCard({
  section,
  isFirst,
  isLast,
}: {
  section: NoteSectionSummary;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const panelId = useId();

  function close() {
    setOpen(false);
    setArmed(false);
    setError(null);
  }

  return (
    <li className={styles.sectionCard}>
      <div className={styles.sectionMain}>
        <Link href={`/notes/${section.id}`} className={styles.sectionLink}>
          <span className={styles.sectionName}>{section.name}</span>
          <span className={styles.sectionMeta}>
            {summarizeSection(
              section.kind,
              section.entryCount,
              section.openCount,
            )}
          </span>
        </Link>

        <div className={styles.tools}>
          <form action={moveSection} className={styles.toolForm}>
            <input type="hidden" name="sectionId" value={section.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={isFirst}
              className={styles.tool}
              aria-label={`Move ${section.name} up`}
            >
              <span aria-hidden="true">&uarr;</span>
            </button>
          </form>

          <form action={moveSection} className={styles.toolForm}>
            <input type="hidden" name="sectionId" value={section.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={isLast}
              className={styles.tool}
              aria-label={`Move ${section.name} down`}
            >
              <span aria-hidden="true">&darr;</span>
            </button>
          </form>

          <button
            type="button"
            onClick={() => (open ? close() : setOpen(true))}
            aria-expanded={open}
            aria-controls={panelId}
            className={`${styles.tool} ${open ? styles.toolOpen : ""}`}
            aria-label={`Rename or delete ${section.name}`}
          >
            <span aria-hidden="true">&hellip;</span>
          </button>
        </div>
      </div>

      {open && (
        <div id={panelId} className={styles.panel}>
          <form
            action={async (formData) => {
              setError(null);
              try {
                await renameSection(formData);
                close();
              } catch {
                setError("That didn't save. A section needs a name.");
              }
            }}
          >
            <input type="hidden" name="sectionId" value={section.id} />
            <div className={styles.field}>
              <label className={styles.label} htmlFor={nameId}>
                Name
              </label>
              <input
                id={nameId}
                name="name"
                type="text"
                defaultValue={section.name}
                maxLength={60}
                required
                autoComplete="off"
                className={styles.input}
              />
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.submit}>
                Save
              </button>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel
              </button>
            </div>
          </form>

          {/* Two taps, never one. The first arms it and says what is about to
              go; the second is the one that actually deletes. */}
          <form
            action={async (formData) => {
              setError(null);
              try {
                await deleteSection(formData);
              } catch {
                setError("That didn't delete.");
                setArmed(false);
              }
            }}
            className={styles.actions}
          >
            <input type="hidden" name="sectionId" value={section.id} />
            {armed ? (
              <>
                <button
                  type="submit"
                  className={`${styles.danger} ${styles.dangerArmed}`}
                >
                  Delete it and everything in it
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
                Delete section
              </button>
            )}
          </form>

          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </li>
  );
}
