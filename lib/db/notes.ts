/**
 * Read side of the notes / diary / to-do data layer.
 *
 * Every query is scoped to the verified session's user, the same as
 * `lib/db/queries.ts`: `verifySession` redirects to /signin when there is no
 * session, so `userId` below is always hers. The entry queries filter on
 * `note_entries.user_id` as well as on the section, so a section id that
 * somehow escaped its owner still cannot drag rows out with it.
 *
 * A section she has protected comes back one of two ways. Unlocked, the data
 * key is taken out of the unlock cookie and the entries are decrypted here,
 * once, on the way to the page. Locked, the ciphertext NEVER LEAVES THIS
 * FILE — `entries` is empty and `locked` is true, so there is no path by which
 * a sealed blob reaches a component, the RSC payload, or the browser.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { noteEntries, noteSections } from "@/lib/db/schema";
import { LockedError, decryptText, openUnlockToken } from "@/lib/notes-crypto";
import type { UnlockToken } from "@/lib/notes-crypto";
import type { ISODate } from "@/lib/budget/dates";
import type { NoteSectionKind } from "@/lib/notes-core";

export interface NoteSection {
  id: string;
  name: string;
  kind: NoteSectionKind;
  sortOrder: number;
  /** She has set a password on this one. Its entries are stored sealed. */
  encrypted: boolean;
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
  /**
   * The row is sealed and could not be opened — a blob that failed its
   * authentication check. `title` and `body` are empty; the UI says so rather
   * than showing nothing and letting her think the entry vanished.
   */
  unreadable: boolean;
}

/** A section page's worth of data, with the lock already resolved. */
export interface SectionView {
  section: NoteSection;
  /** Protected, and not unlocked in this browser right now. */
  locked: boolean;
  /** Empty when locked. Never contains ciphertext. */
  entries: NoteEntry[];
  /** How many entries there are, which stays true whether or not it is open. */
  entryCount: number;
}

// --- the unlock cookie ---

/**
 * How long one unlock lasts without her touching the section.
 *
 * Short, because the DEK is inside the cookie: this is the window in which the
 * server can read what she writes. Long enough that she is not retyping a
 * password between paragraphs.
 */
export const UNLOCK_TTL_MS = 15 * 60_000;

/**
 * And the wall it cannot slide past.
 *
 * Writing refreshes the cookie so she is not cut off mid-entry, but the
 * refreshed token keeps its original `iat`. Eight hours after she typed the
 * password the section locks whatever she is doing, so "unlocked" can never
 * quietly become "unlocked forever".
 */
export const UNLOCK_MAX_MS = 8 * 60 * 60_000;

/** One cookie per section: unlocking one says nothing about any other. */
export function unlockCookieName(sectionId: string): string {
  return `notes_unlock_${sectionId}`;
}

function serverSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  // Without it nothing can be sealed, so everything is simply locked. This is
  // already fatal for sign-in, so it is not a state she can reach in practice.
  if (!secret) throw new LockedError();
  return secret;
}

/**
 * The unlocked data key for one section, or null.
 *
 * Null covers every way it can be missing — no cookie, an expired one, one
 * sealed for a different section or a different account, one that has been
 * edited. None of those are distinguished, here or to her.
 */
export async function readUnlockToken(
  userId: string,
  sectionId: string,
): Promise<UnlockToken | null> {
  try {
    const raw = (await cookies()).get(unlockCookieName(sectionId))?.value;
    if (!raw) return null;

    return openUnlockToken(raw, userId, sectionId, serverSecret(), Date.now());
  } catch {
    return null;
  }
}

/** The same thing as raw key bytes, which is what the cipher wants. */
export async function readUnlockedDek(
  userId: string,
  sectionId: string,
): Promise<Buffer | null> {
  const token = await readUnlockToken(userId, sectionId);
  return token ? Buffer.from(token.dek, "base64") : null;
}

// --- queries ---

/**
 * Her sections, in her order.
 *
 * `createdAt` is the tiebreaker rather than a second sort key of substance:
 * rows created before the first reorder all carry sort_order 0, and without it
 * the list would shuffle between renders.
 *
 * The counts are honest for a protected section too. They are metadata, not
 * content — the schema comment says which parts of a section stay readable.
 */
export async function getSections(): Promise<NoteSectionSummary[]> {
  const { userId } = await verifySession();

  const rows = await db
    .select({
      id: noteSections.id,
      name: noteSections.name,
      kind: noteSections.kind,
      sortOrder: noteSections.sortOrder,
      encSetAt: noteSections.encSetAt,
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
    encrypted: r.encSetAt !== null,
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
): Promise<SectionView | null> {
  const { userId } = await verifySession();

  const [row] = await db
    .select()
    .from(noteSections)
    .where(and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)))
    .limit(1);

  if (!row) return null;

  const section: NoteSection = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    sortOrder: row.sortOrder,
    encrypted: row.encSetAt !== null,
  };

  const entryRows = await db
    .select()
    .from(noteEntries)
    .where(
      and(eq(noteEntries.sectionId, row.id), eq(noteEntries.userId, userId)),
    )
    .orderBy(asc(noteEntries.sortOrder), asc(noteEntries.createdAt));

  const dek = section.encrypted ? await readUnlockedDek(userId, section.id) : null;

  if (section.encrypted && !dek) {
    // Locked. The rows were read for their count and then dropped; nothing
    // sealed is returned, so nothing sealed can be rendered or shipped.
    return { section, locked: true, entries: [], entryCount: entryRows.length };
  }

  const entries = entryRows.map((e) => {
    const base = {
      id: e.id,
      sectionId: e.sectionId,
      entryOn: e.entryOn,
      done: e.done,
      doneOn: e.doneOn,
      sortOrder: e.sortOrder,
    };

    // A plaintext row in a section that was never protected, or one written
    // before she turned protection on and somehow missed the sweep.
    if (e.encBody === null) {
      return { ...base, title: e.title, body: e.body, unreadable: false };
    }

    try {
      return {
        ...base,
        title: e.encTitle === null ? null : decryptText(dek!, e.encTitle, "title"),
        body: decryptText(dek!, e.encBody, "body"),
        unreadable: false,
      };
    } catch {
      // One bad row must not take the page down with it, and must not be
      // dressed up as an empty entry either. No detail is kept: what failed
      // the authentication check is not something to describe.
      return { ...base, title: null, body: "", unreadable: true };
    }
  });

  return { section, locked: false, entries, entryCount: entries.length };
}
