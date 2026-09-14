"use server";

/**
 * Write side of the notes / diary / to-do module.
 *
 * A Server Action is a public POST endpoint. The form that renders it is not
 * the security boundary, so every action below re-verifies the session itself,
 * every insert carries her user id, and every id that arrives in `FormData` is
 * re-read under that user id before anything is written against it. An id in a
 * form says which row she means, never that the row is hers.
 */
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { noteEntries, noteSections } from "@/lib/db/schema";
import {
  isMoveDirection,
  isSectionKind,
  moveWithin,
  renumber,
} from "@/lib/notes-core";
import type { NoteSectionKind } from "@/lib/notes-core";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Long enough for an evening's writing; short enough to bound a POST. */
const MAX_BODY = 20_000;
const MAX_TITLE = 200;
const MAX_NAME = 60;

/**
 * An id is checked for shape before it reaches Postgres.
 *
 * Without this a junk value reaches a uuid comparison and comes back as a
 * driver-level error, which is both an unhelpful message and a needless
 * round-trip for something that was never going to match.
 */
function uuid(value: FormDataEntryValue | null): string {
  const id = String(value ?? "");
  if (!UUID.test(id)) throw new Error("Invalid id");
  return id;
}

function isoDate(value: FormDataEntryValue | null): string {
  const date = String(value ?? "");
  if (!ISO_DATE.test(date)) throw new Error("Expected YYYY-MM-DD");
  return date;
}

function text(value: FormDataEntryValue | null, max: number): string {
  const s = String(value ?? "").trim();
  if (s.length === 0 || s.length > max) throw new Error("Invalid text");
  return s;
}

/** Trimmed, or null when she left it blank. Empty is a legitimate answer. */
function optionalText(
  value: FormDataEntryValue | null,
  max: number,
): string | null {
  const s = String(value ?? "").trim();
  if (s.length > max) throw new Error("Too long");
  return s.length === 0 ? null : s;
}

/** The server's own day, never the client's. Matches the budget pages. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The section, re-read under her user id. Throws when it is not hers — which
 * is also the answer for an id that does not exist at all.
 */
async function ownedSection(userId: string, sectionId: string) {
  const [row] = await db
    .select({
      id: noteSections.id,
      kind: noteSections.kind,
    })
    .from(noteSections)
    .where(and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)))
    .limit(1);

  if (!row) throw new Error("Unknown section");
  return row;
}

async function ownedEntry(userId: string, entryId: string) {
  const [row] = await db
    .select({
      id: noteEntries.id,
      sectionId: noteEntries.sectionId,
    })
    .from(noteEntries)
    .where(and(eq(noteEntries.id, entryId), eq(noteEntries.userId, userId)))
    .limit(1);

  if (!row) throw new Error("Unknown entry");
  return row;
}

/** New rows land at the end of the list they join, the way categories do. */
async function nextSectionOrder(userId: string): Promise<number> {
  const [last] = await db
    .select({ sortOrder: noteSections.sortOrder })
    .from(noteSections)
    .where(eq(noteSections.userId, userId))
    .orderBy(desc(noteSections.sortOrder))
    .limit(1);

  return last ? last.sortOrder + 1 : 0;
}

async function nextEntryOrder(
  userId: string,
  sectionId: string,
): Promise<number> {
  const [last] = await db
    .select({ sortOrder: noteEntries.sortOrder })
    .from(noteEntries)
    .where(
      and(eq(noteEntries.userId, userId), eq(noteEntries.sectionId, sectionId)),
    )
    .orderBy(desc(noteEntries.sortOrder))
    .limit(1);

  return last ? last.sortOrder + 1 : 0;
}

function refreshSection(sectionId: string): void {
  revalidatePath("/notes");
  revalidatePath(`/notes/${sectionId}`);
}

// --- sections ---

export async function createSection(formData: FormData) {
  const { userId } = await verifySession();

  const kind = String(formData.get("kind"));
  if (!isSectionKind(kind)) throw new Error("Unknown section kind");

  await db.insert(noteSections).values({
    userId,
    name: text(formData.get("name"), MAX_NAME),
    kind: kind as NoteSectionKind,
    sortOrder: await nextSectionOrder(userId),
  });

  revalidatePath("/notes");
}

export async function renameSection(formData: FormData) {
  const { userId } = await verifySession();

  const sectionId = uuid(formData.get("sectionId"));
  await ownedSection(userId, sectionId);

  await db
    .update(noteSections)
    .set({ name: text(formData.get("name"), MAX_NAME) })
    // The user id is repeated on the write, not merely checked before it: the
    // ownership read and the update are separate statements, and only the
    // predicate here is what the database actually enforces.
    .where(and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)));

  refreshSection(sectionId);
}

export async function deleteSection(formData: FormData) {
  const { userId } = await verifySession();

  const sectionId = uuid(formData.get("sectionId"));
  await ownedSection(userId, sectionId);

  // Entries go with it: note_entries.section_id cascades.
  await db
    .delete(noteSections)
    .where(and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)));

  revalidatePath("/notes");
}

export async function moveSection(formData: FormData) {
  const { userId } = await verifySession();

  const sectionId = uuid(formData.get("sectionId"));
  const direction = String(formData.get("direction"));
  if (!isMoveDirection(direction)) throw new Error("Unknown direction");

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: noteSections.id })
      .from(noteSections)
      .where(eq(noteSections.userId, userId))
      // Byte-for-byte the order `getSections()` renders in, tiebreaker
      // included. If these two ever disagree, "move up" moves the wrong row.
      .orderBy(asc(noteSections.sortOrder), asc(noteSections.createdAt));

    const ids = rows.map((r) => r.id);

    // The list is already user-scoped, so membership IS the ownership check.
    if (!ids.includes(sectionId)) throw new Error("Unknown section");

    for (const { id, sortOrder } of renumber(
      moveWithin(ids, sectionId, direction),
    )) {
      await tx
        .update(noteSections)
        .set({ sortOrder })
        .where(and(eq(noteSections.id, id), eq(noteSections.userId, userId)));
    }
  });

  revalidatePath("/notes");
}

// --- entries ---

/**
 * One diary entry or one to-do item.
 *
 * Which of the two it is comes from the section she is writing into, not from
 * the form: a journal entry is stamped with a day, a to-do item is not and
 * starts un-ticked.
 */
export async function createEntry(formData: FormData) {
  const { userId } = await verifySession();

  const sectionId = uuid(formData.get("sectionId"));
  const section = await ownedSection(userId, sectionId);

  const title = optionalText(formData.get("title"), MAX_TITLE);
  const rawBody = String(formData.get("body") ?? "");
  if (rawBody.length > MAX_BODY) throw new Error("Too long");
  const body = rawBody.trim();

  // The note_entries_not_empty constraint would reject this anyway; catching
  // it here means she gets a sentence instead of a database error.
  if (!title && body === "") throw new Error("Nothing to save");

  if (section.kind === "journal") {
    const raw = formData.get("entryOn");
    // Her chosen day if she picked one, otherwise the day it is being written.
    const entryOn = raw && String(raw) !== "" ? isoDate(raw) : today();

    await db.insert(noteEntries).values({
      userId,
      sectionId,
      entryOn,
      title,
      body,
      sortOrder: await nextEntryOrder(userId, sectionId),
    });
  } else {
    await db.insert(noteEntries).values({
      userId,
      sectionId,
      entryOn: null,
      // A to-do item is its one line of text; the body stays empty.
      title: title ?? body,
      body: title ? body : "",
      sortOrder: await nextEntryOrder(userId, sectionId),
    });
  }

  refreshSection(sectionId);
}

export async function updateEntry(formData: FormData) {
  const { userId } = await verifySession();

  const entryId = uuid(formData.get("entryId"));
  const entry = await ownedEntry(userId, entryId);
  const section = await ownedSection(userId, entry.sectionId);

  const title = optionalText(formData.get("title"), MAX_TITLE);
  const rawBody = String(formData.get("body") ?? "");
  if (rawBody.length > MAX_BODY) throw new Error("Too long");
  const body = rawBody.trim();

  if (!title && body === "") throw new Error("Nothing to save");

  const raw = formData.get("entryOn");
  const entryOn =
    section.kind === "journal" && raw && String(raw) !== ""
      ? isoDate(raw)
      : undefined;

  await db
    .update(noteEntries)
    .set({
      title: section.kind === "todo" ? (title ?? body) : title,
      body: section.kind === "todo" ? (title ? body : "") : body,
      ...(entryOn ? { entryOn } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(noteEntries.id, entryId), eq(noteEntries.userId, userId)));

  refreshSection(entry.sectionId);
}

/**
 * Ticks or un-ticks one item.
 *
 * The target state travels in the form rather than being flipped from what is
 * in the database, so a double tap or a replayed POST settles on what she
 * asked for instead of oscillating.
 */
export async function setEntryDone(formData: FormData) {
  const { userId } = await verifySession();

  const entryId = uuid(formData.get("entryId"));
  const entry = await ownedEntry(userId, entryId);

  const raw = String(formData.get("done"));
  if (raw !== "true" && raw !== "false") throw new Error("Invalid state");
  const done = raw === "true";

  await db
    .update(noteEntries)
    .set({
      done,
      // note_entries_done_on_with_done forbids a completion date on an
      // un-ticked row, so this is cleared in the same statement.
      doneOn: done ? today() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(noteEntries.id, entryId), eq(noteEntries.userId, userId)));

  refreshSection(entry.sectionId);
}

export async function deleteEntry(formData: FormData) {
  const { userId } = await verifySession();

  const entryId = uuid(formData.get("entryId"));
  const entry = await ownedEntry(userId, entryId);

  await db
    .delete(noteEntries)
    .where(and(eq(noteEntries.id, entryId), eq(noteEntries.userId, userId)));

  refreshSection(entry.sectionId);
}

export async function moveEntry(formData: FormData) {
  const { userId } = await verifySession();

  const entryId = uuid(formData.get("entryId"));
  const direction = String(formData.get("direction"));
  if (!isMoveDirection(direction)) throw new Error("Unknown direction");

  const entry = await ownedEntry(userId, entryId);

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: noteEntries.id })
      .from(noteEntries)
      .where(
        and(
          eq(noteEntries.userId, userId),
          eq(noteEntries.sectionId, entry.sectionId),
        ),
      )
      // The same order `getSectionWithEntries()` renders in.
      .orderBy(asc(noteEntries.sortOrder), asc(noteEntries.createdAt));

    const ids = rows.map((r) => r.id);
    if (!ids.includes(entryId)) throw new Error("Unknown entry");

    for (const { id, sortOrder } of renumber(
      moveWithin(ids, entryId, direction),
    )) {
      await tx
        .update(noteEntries)
        .set({ sortOrder })
        .where(and(eq(noteEntries.id, id), eq(noteEntries.userId, userId)));
    }
  });

  refreshSection(entry.sectionId);
}
