"use client";

import { moveEntry } from "@/lib/notes-actions";
import styles from "./notes.module.css";

/**
 * The up/down pair on an entry, shared by the two entry shapes.
 *
 * `label` is what a screen reader hears moving — the item's own words, so
 * "Move Call the dentist up" rather than "Move item up" three times over.
 * The end of the list disables its arrow instead of offering a no-op.
 */
export function MoveEntry({
  entryId,
  label,
  isFirst,
  isLast,
}: {
  entryId: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <>
      <form action={moveEntry} className={styles.toolForm}>
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={isFirst}
          className={styles.tool}
          aria-label={`Move ${label} up`}
        >
          <span aria-hidden="true">&uarr;</span>
        </button>
      </form>

      <form action={moveEntry} className={styles.toolForm}>
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={isLast}
          className={styles.tool}
          aria-label={`Move ${label} down`}
        >
          <span aria-hidden="true">&darr;</span>
        </button>
      </form>
    </>
  );
}
