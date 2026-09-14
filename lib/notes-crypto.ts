/**
 * Envelope encryption for a notes section she has chosen to protect.
 *
 * Nothing in this file touches the database, the request, or the clock in a
 * way a test cannot control, and nothing in it is Next-specific — it is pure
 * `node:crypto` so it can be exercised directly in `notes-crypto.test.ts`.
 * The glue lives in `lib/db/notes.ts` (read the unlock cookie) and
 * `lib/notes-actions.ts` (set it, and write ciphertext).
 *
 * THE SCHEME
 *
 *   data key (DEK)   32 random bytes, per section, generated once and never
 *                    stored in the clear.
 *   key wrapping     scrypt(secret, salt, N=2^15 r=8 p=1) -> 32-byte key,
 *                    then AES-256-GCM over the DEK. Stored: salt, the sealed
 *                    blob, and the scrypt parameters used.
 *   two wraps        The SAME DEK is wrapped twice — once under her password,
 *                    once under a random 125-bit recovery code. Either opens
 *                    the section; neither can be derived from the other.
 *   entry contents   AES-256-GCM under the DEK, a fresh 12-byte IV for every
 *                    single encryption, tag and IV packed with the ciphertext.
 *
 * WRONG PASSWORD IS DETECTED BY THE GCM TAG ON THE WRAP.
 * There is no password hash stored anywhere, and no "decrypt and see if it
 * looks like text" guess. An unwrap with the wrong key fails OpenSSL's
 * authentication check and throws; it cannot return a plausible-looking wrong
 * DEK. That is the whole verification mechanism.
 *
 * WHAT IS NOT RECOVERABLE
 * The password, the recovery code and the DEK are never written anywhere in a
 * form they can be read back from. If both the password and the recovery code
 * are lost, the entries in that section are gone — permanently, for everyone,
 * including whoever runs the server. That is the design.
 *
 * NEVER log, throw, or otherwise emit a password, a recovery code, a DEK, or
 * decrypted entry text from this module. Every failure below is the same
 * opaque `LockedError`, deliberately carrying no detail.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scrypt } from "node:crypto";

/** What an AES-256-GCM key weighs, and what a DEK is. */
const KEY_BYTES = 32;
/** 96 bits: the IV length GCM is specified and fastest for. */
const IV_BYTES = 12;
/** Full-length GCM tag. Anything shorter weakens the authentication. */
const TAG_BYTES = 16;
/** Leading byte on every sealed blob, so the format can change later. */
const BLOB_VERSION = 1;

/**
 * The single failure this module reports.
 *
 * Wrong password, wrong recovery code, a truncated blob, a flipped bit in the
 * ciphertext, a tampered IV, a swapped auth tag — all of them arrive here, and
 * all of them say the same nothing. Callers must not translate it into
 * anything more specific for the client.
 */
export class LockedError extends Error {
  constructor() {
    super("locked");
    this.name = "LockedError";
  }
}

/** Which column a sealed blob belongs in. Bound into the AAD. */
export type EntryField = "title" | "body";

/** Which wrap a sealed DEK is. Bound into the AAD. */
export type WrapPurpose = "password" | "recovery";

// --- scrypt parameters ---

export interface KdfParams {
  kdf: "scrypt";
  /** CPU/memory cost. 2^15 with r=8 is ~32 MiB and a few hundred ms. */
  N: number;
  r: number;
  p: number;
  keyLen: number;
}

/**
 * What a section set up today is wrapped with.
 *
 * Deliberately expensive: this key guards a diary, and the only attack that
 * matters is somebody with the database trying passwords offline. 2^15 * 8
 * costs an attacker ~32 MiB of memory per guess, which is what makes scrypt
 * worth using over a plain hash.
 *
 * The params are stored per section rather than assumed, so raising them later
 * does not strand sections wrapped under the old ones.
 */
export const DEFAULT_KDF: KdfParams = {
  kdf: "scrypt",
  N: 1 << 15,
  r: 8,
  p: 1,
  keyLen: KEY_BYTES,
};

/**
 * scrypt needs 128 * N * r bytes and refuses to run past `maxmem`. Node's
 * default is 32 MiB, which the defaults above sit exactly on top of, so the
 * ceiling is raised here rather than the parameters lowered.
 */
const MAXMEM = 96 * 1024 * 1024;

/**
 * Params read back out of the database, checked before they are used.
 *
 * The row is ours, so this is not defence against an attacker so much as
 * against a bad migration or a hand-edited row silently making the KDF cheap.
 */
function parseKdfParams(json: string): KdfParams {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new LockedError();
  }

  if (typeof raw !== "object" || raw === null) throw new LockedError();
  const p = raw as Record<string, unknown>;

  const N = p.N;
  const r = p.r;
  const pp = p.p;
  const keyLen = p.keyLen;

  if (
    p.kdf !== "scrypt" ||
    typeof N !== "number" ||
    typeof r !== "number" ||
    typeof pp !== "number" ||
    typeof keyLen !== "number" ||
    // A power of two, and never cheaper than 2^14.
    N < 1 << 14 ||
    N > 1 << 20 ||
    (N & (N - 1)) !== 0 ||
    r < 1 ||
    r > 16 ||
    pp < 1 ||
    pp > 4 ||
    keyLen !== KEY_BYTES ||
    128 * N * r > MAXMEM
  ) {
    throw new LockedError();
  }

  return { kdf: "scrypt", N, r, p: pp, keyLen };
}

export function serializeKdfParams(params: KdfParams): string {
  return JSON.stringify(params);
}

/**
 * scrypt over a secret she typed.
 *
 * NFKC only — never trimmed. Trimming a password silently accepts a different
 * one, and a space she typed on purpose is part of it.
 */
function deriveKey(secret: string, salt: Buffer, params: KdfParams): Promise<Buffer> {
  const material = Buffer.from(secret.normalize("NFKC"), "utf8");

  return new Promise((resolve, reject) => {
    scrypt(
      material,
      salt,
      params.keyLen,
      { N: params.N, r: params.r, p: params.p, maxmem: MAXMEM },
      (err, key) => {
        material.fill(0);
        if (err) reject(new LockedError());
        else resolve(key);
      },
    );
  });
}

/**
 * Spend the same time on a guess that was never going to work.
 *
 * The unlock action calls this when there is no such section, or the section
 * is not protected at all, so that "wrong password" and "no such section" take
 * the same few hundred milliseconds and return the same sentence. Without it
 * the response time is an oracle for which sections exist.
 */
export async function equalizeUnlockCost(): Promise<void> {
  await deriveKey(randomBytes(32).toString("hex"), randomBytes(16), DEFAULT_KDF);
}

// --- sealing ---

/**
 * AES-256-GCM, packed `version || iv || tag || ciphertext`, base64.
 *
 * One blob rather than three columns on purpose: an IV and a tag that travel
 * with their own ciphertext cannot be paired with somebody else's by a bug in
 * a query. The IV is fresh on every call — a reused IV under the same key is
 * the one mistake that breaks GCM completely, so there is no path through this
 * function that does not generate one.
 */
function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([BLOB_VERSION]), iv, tag, ciphertext]).toString("base64");
}

/** The inverse. Any tampering anywhere in the blob lands as a LockedError. */
function open(key: Buffer, blob: string, aad: string): Buffer {
  let packed: Buffer;
  try {
    packed = Buffer.from(blob, "base64");
  } catch {
    throw new LockedError();
  }

  if (packed.length < 1 + IV_BYTES + TAG_BYTES || packed[0] !== BLOB_VERSION) {
    throw new LockedError();
  }

  const iv = packed.subarray(1, 1 + IV_BYTES);
  const tag = packed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(1 + IV_BYTES + TAG_BYTES);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // `final()` throws here when the tag does not verify. This is the check
    // that makes a wrong key fail loudly instead of returning noise.
    throw new LockedError();
  }
}

// --- the data key ---

/** A fresh 256-bit data key. Held in memory, wrapped before it is stored. */
export function generateDek(): Buffer {
  return randomBytes(KEY_BYTES);
}

export interface WrappedDek {
  /** base64, 16 random bytes. Fresh per wrap, never shared between them. */
  salt: string;
  /** base64 sealed blob. */
  blob: string;
  /** JSON, the scrypt parameters this wrap used. */
  params: string;
}

/**
 * Wrap the DEK under something she knows.
 *
 * `purpose` is bound into the AAD, so the password blob and the recovery blob
 * are not interchangeable even though they hold the same key: a row that had
 * its two wrap columns swapped fails to open rather than quietly working.
 */
export async function wrapDek(
  dek: Buffer,
  secret: string,
  purpose: WrapPurpose,
  params: KdfParams = DEFAULT_KDF,
): Promise<WrappedDek> {
  if (dek.length !== KEY_BYTES) throw new LockedError();

  const salt = randomBytes(16);
  const key = await deriveKey(secret, salt, params);
  try {
    return {
      salt: salt.toString("base64"),
      blob: seal(key, dek, `notes-dek/v1|${purpose}`),
      params: serializeKdfParams(params),
    };
  } finally {
    key.fill(0);
  }
}

/**
 * Unwrap the DEK, or throw.
 *
 * This IS the password check. A wrong secret derives a wrong key, the GCM tag
 * does not verify, and `open()` throws — there is no branch here that can hand
 * back a DEK that is not the real one.
 */
export async function unwrapDek(
  secret: string,
  wrapped: WrappedDek,
  purpose: WrapPurpose,
): Promise<Buffer> {
  const params = parseKdfParams(wrapped.params);
  const salt = Buffer.from(wrapped.salt, "base64");
  if (salt.length < 8) throw new LockedError();

  const key = await deriveKey(secret, salt, params);
  try {
    const dek = open(key, wrapped.blob, `notes-dek/v1|${purpose}`);
    if (dek.length !== KEY_BYTES) throw new LockedError();
    return dek;
  } finally {
    key.fill(0);
  }
}

// --- entry contents ---

/**
 * One field of one entry.
 *
 * The field name is in the AAD so a title blob cannot be moved into the body
 * column, or the other way round, without the read failing.
 */
export function encryptText(dek: Buffer, plaintext: string, field: EntryField): string {
  if (dek.length !== KEY_BYTES) throw new LockedError();
  return seal(dek, Buffer.from(plaintext, "utf8"), `notes-entry/v1|${field}`);
}

export function decryptText(dek: Buffer, blob: string, field: EntryField): string {
  return open(dek, blob, `notes-entry/v1|${field}`).toString("utf8");
}

// --- the recovery code ---

/**
 * Crockford's base32 alphabet: no I, L, O or U, so nothing in a written-down
 * code can be mistaken for a 1, a 0, or read as a word she would rather not
 * have on a piece of paper in a drawer.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_CHARS = 25;

/**
 * 125 bits, in five groups of five.
 *
 * Shown to her exactly once, at setup, and never stored in a form it can be
 * read back from — only its scrypt-wrapped DEK is. 32 is a power of two, so
 * masking a random byte picks a character with no modulo bias.
 */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(CODE_CHARS);
  let out = "";
  for (let i = 0; i < CODE_CHARS; i++) {
    if (i > 0 && i % 5 === 0) out += "-";
    out += ALPHABET[bytes[i] & 31];
  }
  bytes.fill(0);
  return out;
}

/**
 * What she types, turned back into what was generated.
 *
 * Case, spaces and dashes are forgiven, and the three letters the alphabet
 * leaves out are folded onto the digits they look like, because that is the
 * mistake somebody copying off paper actually makes. Everything else is
 * dropped; a code that does not match simply fails the unwrap.
 */
export function normalizeRecoveryCode(input: string): string {
  let out = "";
  for (const raw of input.toUpperCase()) {
    const ch = raw === "O" ? "0" : raw === "I" || raw === "L" ? "1" : raw;
    if (ALPHABET.includes(ch)) out += ch;
  }
  return out;
}

// --- the unlock cookie ---

/**
 * What a sealed unlock cookie carries.
 *
 * `iat` is the moment she typed the password and never moves; `exp` slides
 * forward as she works. The gap between them is capped by the caller, so a
 * section cannot stay unlocked indefinitely just because she kept typing.
 */
export interface UnlockToken {
  /** base64 DEK. */
  dek: string;
  /** ms since epoch. */
  iat: number;
  /** ms since epoch. */
  exp: number;
}

/**
 * The cookie key, derived from the app's server secret rather than being it.
 *
 * HKDF so this key is unrelated to whatever else `BETTER_AUTH_SECRET` is used
 * for: a leak of one does not hand over the other.
 */
function cookieKey(serverSecret: string): Buffer {
  if (!serverSecret || serverSecret.length < 16) throw new LockedError();
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(serverSecret, "utf8"),
      Buffer.from("notes-unlock/v1", "utf8"),
      Buffer.from("section-unlock-cookie", "utf8"),
      KEY_BYTES,
    ),
  );
}

/**
 * Seal an unlocked DEK into a cookie value.
 *
 * ACCEPTED LIMITATION, stated plainly: while a section is unlocked the server
 * can read that section's entries. The DEK is in this cookie, sealed to a
 * secret the server holds, so anyone who holds both the server secret and the
 * cookie can decrypt. This is not end-to-end encryption and must not be
 * described as such. What it does buy: the database on its own — a dump, a
 * backup, a support engineer at the hosting provider — is useless without her
 * password, and the window in which the server can read anything is the few
 * minutes she is actually working in that section.
 *
 * The user and section ids are the AAD, so a cookie lifted from one section
 * cannot be replayed at another, or by another account.
 */
export function sealUnlockToken(
  token: UnlockToken,
  userId: string,
  sectionId: string,
  serverSecret: string,
): string {
  const key = cookieKey(serverSecret);
  try {
    return seal(
      key,
      Buffer.from(JSON.stringify(token), "utf8"),
      `notes-unlock/v1|${userId}|${sectionId}`,
    );
  } finally {
    key.fill(0);
  }
}

/**
 * Open a cookie, or throw. `now` is a parameter so expiry is testable.
 *
 * Expiry is checked against the sealed `exp` and not against the cookie's own
 * Max-Age: the browser's copy of that is a request, not a guarantee.
 */
export function openUnlockToken(
  value: string,
  userId: string,
  sectionId: string,
  serverSecret: string,
  now: number,
): UnlockToken {
  const key = cookieKey(serverSecret);
  let plain: Buffer;
  try {
    plain = open(key, value, `notes-unlock/v1|${userId}|${sectionId}`);
  } finally {
    key.fill(0);
  }

  let token: unknown;
  try {
    token = JSON.parse(plain.toString("utf8"));
  } catch {
    throw new LockedError();
  } finally {
    plain.fill(0);
  }

  if (typeof token !== "object" || token === null) throw new LockedError();
  const t = token as Record<string, unknown>;

  if (typeof t.dek !== "string" || typeof t.iat !== "number" || typeof t.exp !== "number") {
    throw new LockedError();
  }
  if (!(now < t.exp) || !(t.iat <= now + 60_000)) throw new LockedError();
  if (Buffer.from(t.dek, "base64").length !== KEY_BYTES) throw new LockedError();

  return { dek: t.dek, iat: t.iat, exp: t.exp };
}
