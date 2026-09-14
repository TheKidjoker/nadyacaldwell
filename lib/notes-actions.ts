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
import { cookies } from "next/headers";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { noteEntries, noteSections } from "@/lib/db/schema";
import {
  UNLOCK_MAX_MS,
  UNLOCK_TTL_MS,
  readUnlockToken,
  unlockCookieName,
} from "@/lib/db/notes";
import {
  DEFAULT_KDF,
  decryptText,
  encryptText,
  equalizeUnlockCost,
  generateDek,
  generateRecoveryCode,
  normalizeRecoveryCode,
  sealUnlockToken,
  unwrapDek,
  wrapDek,
} from "@/lib/notes-crypto";
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
      encSetAt: noteSections.encSetAt,
      encSalt: noteSections.encSalt,
      encWrappedDek: noteSections.encWrappedDek,
      encRecoverySalt: noteSections.encRecoverySalt,
      encRecoveryWrappedDek: noteSections.encRecoveryWrappedDek,
      encKdfParams: noteSections.encKdfParams,
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

  // Throws "locked" when the section is protected and not open right now, so
  // there is no way to write into it without the data key in hand.
  const dek = await dekForWriting(userId, section);

  if (section.kind === "journal") {
    const raw = formData.get("entryOn");
    // Her chosen day if she picked one, otherwise the day it is being written.
    const entryOn = raw && String(raw) !== "" ? isoDate(raw) : today();

    await db.insert(noteEntries).values({
      userId,
      sectionId,
      entryOn,
      ...contentColumns(dek, title, body),
      sortOrder: await nextEntryOrder(userId, sectionId),
    });
  } else {
    await db.insert(noteEntries).values({
      userId,
      sectionId,
      entryOn: null,
      // A to-do item is its one line of text; the body stays empty.
      ...contentColumns(dek, title ?? body, title ? body : ""),
      sortOrder: await nextEntryOrder(userId, sectionId),
    });
  }

  await slideUnlock(userId, sectionId);
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

  const dek = await dekForWriting(userId, section);

  await db
    .update(noteEntries)
    .set({
      ...(section.kind === "todo"
        ? contentColumns(dek, title ?? body, title ? body : "")
        : contentColumns(dek, title, body)),
      ...(entryOn ? { entryOn } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(noteEntries.id, entryId), eq(noteEntries.userId, userId)));

  await slideUnlock(userId, entry.sectionId);
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

// ------------------------------------------------------------------ //
// Optional per-section encryption.
//
// `lib/notes-crypto.ts` holds the scheme and the reasoning; this half is the
// plumbing: which columns get written, and when the unlock cookie is issued,
// slid forward, or thrown away.
//
// These actions RETURN their failures rather than throwing them. A thrown
// message is replaced with a generic digest in a production build, and this is
// the one surface in the app where the difference between "that password was
// wrong" and "those two boxes do not match" has to survive to the browser.
//
// The set of reasons is chosen so that nothing distinguishable leaks. In
// particular a wrong password and a section that does not exist are BOTH
// `locked`, and both cost one scrypt run, so neither the answer nor the time
// it took says which happened. A password, a recovery code, a data key and a
// decrypted entry never appear in a reason, a log line, or a return value —
// the only secret that ever comes back out is the recovery code, once, at the
// moment it is generated, because she has to be able to write it down.
// ------------------------------------------------------------------ //

/**
 * Why a lock action did not do what she asked. Deliberately coarse.
 *
 * `locked` is the union of "wrong password", "wrong recovery code", "no such
 * section" and "that section is not protected" — every case where telling her
 * more would also tell somebody else more.
 */
export type LockFailure =
  | "locked"
  | "weak"
  | "mismatch"
  | "acknowledge"
  | "already"
  | "corrupt";

export type LockResult =
  | { ok: true; recoveryCode?: string }
  | { ok: false; reason: LockFailure };

const FAILURES = new Set<string>([
  "locked",
  "weak",
  "mismatch",
  "acknowledge",
  "already",
  "corrupt",
]);

/**
 * Turn the expected failures into a returned reason and let everything else
 * stay an exception.
 *
 * A bug should be a 500 in the log, not a calm sentence in her face that says
 * the password was wrong when it was not. `redirect()` from `verifySession`
 * also throws, and re-throwing here is what keeps it working.
 */
async function lockGuard(
  run: () => Promise<{ recoveryCode: string } | void>,
): Promise<LockResult> {
  try {
    const out = await run();
    return out ? { ok: true, recoveryCode: out.recoveryCode } : { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (FAILURES.has(reason)) return { ok: false, reason: reason as LockFailure };
    throw error;
  }
}

/** Shortest password accepted. Said out loud in the UI, not just enforced. */
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

type SectionRow = Awaited<ReturnType<typeof ownedSection>>;

/**
 * A password exactly as she typed it.
 *
 * Never trimmed: a trailing space she meant is part of the password, and
 * quietly removing it would accept a different one at unlock than was used at
 * setup. Length is measured on the NFKC form, the same form the KDF sees.
 */
function password(value: FormDataEntryValue | null): string {
  const s = String(value ?? "");
  const normalized = s.normalize("NFKC");
  if (normalized.length < MIN_PASSWORD || normalized.length > MAX_PASSWORD) {
    throw new Error("weak");
  }
  return s;
}

function confirmed(pw: string, value: FormDataEntryValue | null): string {
  if (String(value ?? "") !== pw) throw new Error("mismatch");
  return pw;
}

/** The checkbox that says she understands nobody can get the entries back. */
function acknowledged(value: FormDataEntryValue | null): void {
  if (String(value ?? "") !== "yes") throw new Error("acknowledge");
}

/** The stored wrap for one of the two doors into a section. */
function wrappedFor(section: SectionRow, purpose: "password" | "recovery") {
  const salt = purpose === "password" ? section.encSalt : section.encRecoverySalt;
  const blob =
    purpose === "password" ? section.encWrappedDek : section.encRecoveryWrappedDek;

  if (!salt || !blob || !section.encKdfParams) throw new Error("locked");
  return { salt, blob, params: section.encKdfParams };
}

/** The section if it is hers and protected, otherwise a flat `locked`. */
async function protectedSection(
  userId: string,
  sectionId: string,
): Promise<SectionRow> {
  let section: SectionRow | null = null;
  try {
    section = await ownedSection(userId, sectionId);
  } catch {
    section = null;
  }

  if (!section || section.encSetAt === null) {
    // The same scrypt run a real attempt would have cost, so the clock does
    // not answer a question the message refuses to.
    await equalizeUnlockCost();
    throw new Error("locked");
  }

  return section;
}

/**
 * Which columns an entry's words go into.
 *
 * With a data key the plaintext columns are written NULL and '' in the same
 * statement that writes the ciphertext — the words move, they are not copied.
 * `note_entries_no_plaintext_when_encrypted` rejects the row if that ever
 * stops being true.
 */
function contentColumns(dek: Buffer | null, title: string | null, body: string) {
  if (!dek) return { title, body, encTitle: null, encBody: null };

  return {
    title: null,
    body: "",
    encTitle: title === null ? null : encryptText(dek, title, "title"),
    // Sealed even when empty, so `enc_body is not null` is the one unambiguous
    // answer to "is this row encrypted".
    encBody: encryptText(dek, body, "body"),
  };
}

/**
 * The key to write with, or null for a section that is not protected.
 *
 * Throws when the section is protected and the unlock has expired, so a stale
 * tab cannot write plaintext into a section that is meant to be sealed.
 */
async function dekForWriting(
  userId: string,
  section: SectionRow,
): Promise<Buffer | null> {
  if (section.encSetAt === null) return null;

  const token = await readUnlockToken(userId, section.id);
  if (!token) throw new Error("This section is locked");
  return Buffer.from(token.dek, "base64");
}

function unlockCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Localhost counts as a secure context, so this holds in development too.
    secure: true,
    // The cookie has no business travelling on a cross-site request; the only
    // thing that legitimately reads it is her own navigation within the app.
    sameSite: "strict" as const,
    path: "/notes",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Put the unlocked key in a sealed cookie.
 *
 * `issuedAt` is carried forward across refreshes so the absolute ceiling in
 * `UNLOCK_MAX_MS` is measured from when she actually typed the password.
 */
async function issueUnlock(
  userId: string,
  sectionId: string,
  dek: Buffer,
  issuedAt: number,
): Promise<void> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("locked");

  const value = sealUnlockToken(
    { dek: dek.toString("base64"), iat: issuedAt, exp: Date.now() + UNLOCK_TTL_MS },
    userId,
    sectionId,
    secret,
  );

  (await cookies()).set(
    unlockCookieName(sectionId),
    value,
    unlockCookieOptions(Math.floor(UNLOCK_TTL_MS / 1000)),
  );
}

async function clearUnlock(sectionId: string): Promise<void> {
  // Same options, zero lifetime: a delete that names the path the cookie was
  // set on, rather than one that quietly misses it.
  (await cookies()).set(unlockCookieName(sectionId), "", unlockCookieOptions(0));
}

/**
 * Push the expiry out while she is working, but never past the ceiling.
 *
 * Without this she would be shut out mid-entry every fifteen minutes; with an
 * uncapped slide, a tab left open would stay unlocked for days. The `iat`
 * inside the sealed token is what makes the ceiling unmoveable from outside.
 */
async function slideUnlock(userId: string, sectionId: string): Promise<void> {
  const token = await readUnlockToken(userId, sectionId);
  if (!token) return;

  if (Date.now() - token.iat > UNLOCK_MAX_MS) {
    await clearUnlock(sectionId);
    return;
  }

  await issueUnlock(userId, sectionId, Buffer.from(token.dek, "base64"), token.iat);
}

/**
 * Turn protection ON for a section, and seal everything already in it.
 *
 * Returns the recovery code. This is the ONE time it exists anywhere outside
 * her head or her paper: only its wrapped copy of the data key is stored, and
 * that cannot be turned back into the code. It is not logged and never reaches
 * the database.
 */
export async function protectSection(formData: FormData): Promise<LockResult> {
  return lockGuard(async () => {
    const { userId } = await verifySession();

    const sectionId = uuid(formData.get("sectionId"));
    const section = await ownedSection(userId, sectionId);
    if (section.encSetAt !== null) throw new Error("already");

    const pw = confirmed(password(formData.get("password")), formData.get("confirm"));
    acknowledged(formData.get("understood"));

    const dek = generateDek();
    const recoveryCode = generateRecoveryCode();

    // The same key, wrapped twice under two independent salts. Either opens
    // the section; losing both closes it for good.
    const byPassword = await wrapDek(dek, pw, "password", DEFAULT_KDF);
    const byRecovery = await wrapDek(
      dek,
      normalizeRecoveryCode(recoveryCode),
      "recovery",
      DEFAULT_KDF,
    );

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: noteEntries.id,
          title: noteEntries.title,
          body: noteEntries.body,
          encBody: noteEntries.encBody,
        })
        .from(noteEntries)
        .where(
          and(eq(noteEntries.userId, userId), eq(noteEntries.sectionId, sectionId)),
        );

      for (const row of rows) {
        if (row.encBody !== null) continue;

        await tx
          .update(noteEntries)
          .set(contentColumns(dek, row.title, row.body))
          .where(and(eq(noteEntries.id, row.id), eq(noteEntries.userId, userId)));
      }

      await tx
        .update(noteSections)
        .set({
          encSetAt: new Date(),
          encSalt: byPassword.salt,
          encWrappedDek: byPassword.blob,
          encRecoverySalt: byRecovery.salt,
          encRecoveryWrappedDek: byRecovery.blob,
          encKdfParams: byPassword.params,
        })
        .where(
          and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)),
        );
    });

    // She stays where she is, with it open, rather than being asked for the
    // password she typed ten seconds ago.
    await issueUnlock(userId, sectionId, dek, Date.now());
    refreshSection(sectionId);

    return { recoveryCode };
  });
}

/**
 * Open a section for a while.
 *
 * The GCM tag on the wrap is the whole check: a wrong password derives a wrong
 * key, the unwrap fails to authenticate, and there is nothing to issue. There
 * is no stored password hash to compare against and no "decrypt something and
 * see whether it looks like words" — a wrong password cannot produce a key
 * that opens anything.
 */
export async function unlockSection(formData: FormData): Promise<LockResult> {
  return lockGuard(async () => {
    const { userId } = await verifySession();

    const sectionId = uuid(formData.get("sectionId"));
    const secret = String(formData.get("password") ?? "");
    const section = await protectedSection(userId, sectionId);

    let dek: Buffer;
    try {
      dek = await unwrapDek(secret, wrappedFor(section, "password"), "password");
    } catch {
      throw new Error("locked");
    }

    await issueUnlock(userId, sectionId, dek, Date.now());
    refreshSection(sectionId);
  });
}

/**
 * The way back in when the password is gone.
 *
 * The recovery code opens the same data key, and she sets a new password on
 * the spot — an unlock that left the old, forgotten password in place would
 * shut her out again the moment the cookie expired. The code is rotated at the
 * same time, because the one she just used has been typed into a device and
 * read off whatever it was written on.
 */
export async function recoverSection(formData: FormData): Promise<LockResult> {
  return lockGuard(async () => {
    const { userId } = await verifySession();

    const sectionId = uuid(formData.get("sectionId"));
    const code = normalizeRecoveryCode(String(formData.get("code") ?? ""));
    const pw = confirmed(password(formData.get("password")), formData.get("confirm"));
    const section = await protectedSection(userId, sectionId);

    let dek: Buffer;
    try {
      dek = await unwrapDek(code, wrappedFor(section, "recovery"), "recovery");
    } catch {
      throw new Error("locked");
    }

    // The SAME key, wrapped under the new password and a new code. Nothing
    // already written is re-encrypted, so nothing can be lost here.
    const recoveryCode = generateRecoveryCode();
    const byPassword = await wrapDek(dek, pw, "password", DEFAULT_KDF);
    const byRecovery = await wrapDek(
      dek,
      normalizeRecoveryCode(recoveryCode),
      "recovery",
      DEFAULT_KDF,
    );

    await db
      .update(noteSections)
      .set({
        encSalt: byPassword.salt,
        encWrappedDek: byPassword.blob,
        encRecoverySalt: byRecovery.salt,
        encRecoveryWrappedDek: byRecovery.blob,
        encKdfParams: byPassword.params,
      })
      .where(and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)));

    await issueUnlock(userId, sectionId, dek, Date.now());
    refreshSection(sectionId);

    return { recoveryCode };
  });
}

/**
 * A new password over the same data key.
 *
 * Re-wrapping, not re-encrypting: every entry already written stays exactly as
 * it is and still opens, because the key underneath never changed. The
 * recovery code is left alone — she has not lost it, she is changing her
 * password.
 */
export async function changeSectionPassword(
  formData: FormData,
): Promise<LockResult> {
  return lockGuard(async () => {
    const { userId } = await verifySession();

    const sectionId = uuid(formData.get("sectionId"));
    const current = String(formData.get("current") ?? "");
    const pw = confirmed(password(formData.get("password")), formData.get("confirm"));
    const section = await protectedSection(userId, sectionId);

    let dek: Buffer;
    try {
      dek = await unwrapDek(current, wrappedFor(section, "password"), "password");
    } catch {
      throw new Error("locked");
    }

    const byPassword = await wrapDek(dek, pw, "password", DEFAULT_KDF);

    await db
      .update(noteSections)
      .set({
        encSalt: byPassword.salt,
        encWrappedDek: byPassword.blob,
        encKdfParams: byPassword.params,
      })
      .where(and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)));

    await issueUnlock(userId, sectionId, dek, Date.now());
    refreshSection(sectionId);
  });
}

/**
 * Turn protection off and put the words back in the clear.
 *
 * Her password is required even when the section is already open, because this
 * undoes the protection rather than uses it. If any single row fails to
 * decrypt the whole thing rolls back: the alternative is clearing the key
 * columns and leaving that row sealed forever with nothing left to open it.
 */
export async function removeSectionProtection(
  formData: FormData,
): Promise<LockResult> {
  return lockGuard(async () => {
    const { userId } = await verifySession();

    const sectionId = uuid(formData.get("sectionId"));
    const secret = String(formData.get("password") ?? "");
    acknowledged(formData.get("understood"));
    const section = await protectedSection(userId, sectionId);

    let dek: Buffer;
    try {
      dek = await unwrapDek(secret, wrappedFor(section, "password"), "password");
    } catch {
      throw new Error("locked");
    }

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: noteEntries.id,
          encTitle: noteEntries.encTitle,
          encBody: noteEntries.encBody,
        })
        .from(noteEntries)
        .where(
          and(eq(noteEntries.userId, userId), eq(noteEntries.sectionId, sectionId)),
        );

      for (const row of rows) {
        if (row.encBody === null) continue;

        let title: string | null;
        let body: string;
        try {
          title =
            row.encTitle === null ? null : decryptText(dek, row.encTitle, "title");
          body = decryptText(dek, row.encBody, "body");
        } catch {
          // Rolls the transaction back, protection included.
          throw new Error("corrupt");
        }

        await tx
          .update(noteEntries)
          .set(contentColumns(null, title, body))
          .where(and(eq(noteEntries.id, row.id), eq(noteEntries.userId, userId)));
      }

      await tx
        .update(noteSections)
        .set({
          encSetAt: null,
          encSalt: null,
          encWrappedDek: null,
          encRecoverySalt: null,
          encRecoveryWrappedDek: null,
          encKdfParams: null,
        })
        .where(
          and(eq(noteSections.id, sectionId), eq(noteSections.userId, userId)),
        );
    });

    await clearUnlock(sectionId);
    refreshSection(sectionId);
  });
}

/** Close it now, without waiting for the cookie to run out. */
export async function lockSection(formData: FormData): Promise<LockResult> {
  return lockGuard(async () => {
    const { userId } = await verifySession();

    const sectionId = uuid(formData.get("sectionId"));
    await ownedSection(userId, sectionId);

    await clearUnlock(sectionId);
    refreshSection(sectionId);
  });
}
