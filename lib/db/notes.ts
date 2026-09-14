/**
 * Read side of the notes / diary / to-do data layer.
 *
 * Every query is scoped to the verified session's user, the same as
 * `lib/db/queries.ts`: `verifySession` redirects to /signin when there is no
 * session, so `userId` below is always hers. The entry queries filter on
 * `note_entries.user_id` as well as on the section, so a section id that
 * somehow escaped its owner still cannot drag rows out with it.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { noteEntries, noteSections } from "@/lib/db/schema";
import type { ISODate } from "@/lib/budget/dates";
import type { NoteSectionKind } from "@/lib/notes-core";

export interface NoteSection {
  id: string;
  name: string;
  kind: NoteSectionKind;
  sortOrder: number;
}

/** A section as the index lists it: itself, plus how full it is. */
export interface NoteSectionSummary extends NoteSection {
  entryCount: number;
  /** To-do items not yet ticked. Always 0 for a journal. */
  openCount: number;
}

export interface NoteEntry {
  id: string;
  sectionId: string;
  /** The day a diary entry is about. Null on a to-do item. */
  entryOn: ISODate | null;
  /** A to-do item's text; a diary entry's optional heading. */
  title: string | null;
  /** The writing. Empty on a to-do item, never null. */
  body: string;
  done: boolean;
  doneOn: ISODate | null;
  sortOrder: number;
}

/**
 * Her sections, in her order.
 *
 * `createdAt` is the tiebreaker rather than a second sort key of substance:
 * rows created before the first reorder all carry sort_order 0, and without it
 * the list would shuffle between renders.
 */
export async function getSections(): Promise<NoteSectionSummary[]> {
  const { userId } = await verifySession();

  const rows = await db
    .select({
      id: noteSections.id,
      name: noteSections.name,
      kind: noteSections.kind,
      sortOrder: noteSections.sortOrder,
      entryCount: sql<number>`count(${noteEntries.id})::int`,
      openCount: sql<number>`count(*) filter (where ${noteEntries.id} is not null and ${noteEntries.done} = false)::int`,
    })
    .from(noteSections)
    // The join carries the user id as well as the section id: the count must
    // not be able to see a row that is not hers even by accident.
    .leftJoin(
      noteEntries,
      and(
        eq(noteEntries.sectionId, noteSections.id),
        eq(noteEntries.userId, userId),
      ),
    )
    .where(eq(noteSections.userId, userId))
    .groupBy(noteSections.id)
    .orderBy(asc(noteSections.sortOrder), asc(noteSections.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    sortOrder: r.sortOrder,
    entryCount: r.entryCount,
    openCount: r.openCount,
  }));
}

/**
 * One section and everything in it, or null when the id is not hers.
 *
 * Null rather than a throw: the page turns it into a 404, which is also the
 * right answer for a section id belonging to somebody else.
 */
export async function getSectionWithEntries(
  sectionId: string,
): Promise<{ section: NoteSection; entries: NoteEntry[] } | null> {
  const { userId } = await verifySession();

  const [row] = await db
    .select()
    .from(noteSections)
    .where(and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)))
    .limit(1);

  if (!row) return null;

  const entryRows = await db
    .select()
    .from(noteEntries)
    .where(
      and(eq(noteEntries.sectionId, row.id), eq(noteEntries.userId, userId)),
    )
    .orderBy(asc(noteEntries.sortOrder), asc(noteEntries.createdAt));

  return {
    section: {
      id: row.id,
      name: row.name,
      kind: row.kind,
      sortOrder: row.sortOrder,
    },
    entries: entryRows.map((e) => ({
      id: e.id,
      sectionId: e.sectionId,
      entryOn: e.entryOn,
      title: e.title,
      body: e.body,
      done: e.done,
      doneOn: e.doneOn,
      sortOrder: e.sortOrder,
    })),
  };
}
