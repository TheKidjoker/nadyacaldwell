import { describe, it, expect } from "vitest";
import {
  DEFAULT_KDF,
  LockedError,
  decryptText,
  encryptText,
  generateDek,
  generateRecoveryCode,
  normalizeRecoveryCode,
  openUnlockToken,
  sealUnlockToken,
  serializeKdfParams,
  unwrapDek,
  wrapDek,
} from "./notes-crypto";
import type { WrappedDek } from "./notes-crypto";

/**
 * These tests are the argument that the scheme in `notes-crypto.ts` keeps the
 * promise the UI makes. The failure paths matter more than the happy one: a
 * wrong password that returns plausible-looking garbage, or a flipped bit that
 * comes back as corrupt text instead of an error, would be worse than no
 * encryption at all, because she would trust it.
 *
 * scrypt at the real parameters costs a few hundred ms a call, and these tests
 * use the real ones rather than a cheap stand-in — testing a weaker KDF would
 * not be testing what ships. The generous timeouts below are for that, not for
 * flakiness.
 */
const KDF_TIMEOUT = 30_000;

const PASSWORD = "a quiet evening in";
const WRONG = "a quiet evening ln";

/** Pull the three regions back out of a sealed blob so a test can poke one. */
function unpack(blob: string) {
  const packed = Buffer.from(blob, "base64");
  return {
    version: packed.subarray(0, 1),
    iv: packed.subarray(1, 13),
    tag: packed.subarray(13, 29),
    ciphertext: packed.subarray(29),
    packed,
  };
}

/** Flip one bit at `index` and re-encode. */
function flipBit(blob: string, index: number): string {
  const packed = Buffer.from(blob, "base64");
  packed[index] ^= 0x01;
  return packed.toString("base64");
}

describe("encryptText / decryptText", () => {
  it("round-trips text through the data key", () => {
    const dek = generateDek();
    const written = "Went to the beach. It rained the whole way home.";

    expect(decryptText(dek, encryptText(dek, written, "body"), "body")).toBe(written);
  });

  it("round-trips an empty string, unicode and newlines", () => {
    const dek = generateDek();

    for (const text of ["", "\n\n  ", "café — naïve 🌙", "line one\nline two\n"]) {
      expect(decryptText(dek, encryptText(dek, text, "body"), "body")).toBe(text);
    }
  });

  it("round-trips the longest entry the actions will accept", () => {
    const dek = generateDek();
    const long = "x".repeat(20_000);

    expect(decryptText(dek, encryptText(dek, long, "body"), "body")).toBe(long);
  });

  it("gives two different ciphertexts for the same plaintext (fresh IV)", () => {
    const dek = generateDek();
    const text = "the same sentence twice";

    const a = encryptText(dek, text, "body");
    const b = encryptText(dek, text, "body");

    expect(a).not.toBe(b);
    // The point is the IV specifically, not just that the blobs differ.
    expect(unpack(a).iv.equals(unpack(b).iv)).toBe(false);
    expect(unpack(a).ciphertext.equals(unpack(b).ciphertext)).toBe(false);
    expect(decryptText(dek, a, "body")).toBe(text);
    expect(decryptText(dek, b, "body")).toBe(text);
  });

  it("never repeats an IV across many encryptions", () => {
    const dek = generateDek();
    const seen = new Set<string>();

    for (let i = 0; i < 500; i++) {
      seen.add(unpack(encryptText(dek, "same", "body")).iv.toString("hex"));
    }

    expect(seen.size).toBe(500);
  });

  it("does not leave the plaintext visible in the blob", () => {
    const dek = generateDek();
    const secret = "the thing she does not want anyone to read";

    const packed = Buffer.from(encryptText(dek, secret, "body"), "base64");

    expect(packed.includes(Buffer.from(secret, "utf8"))).toBe(false);
  });

  it("refuses a different data key rather than returning garbage", () => {
    const blob = encryptText(generateDek(), "hers", "body");

    expect(() => decryptText(generateDek(), blob, "body")).toThrow(LockedError);
  });

  it("will not read a title blob as a body, or a body as a title", () => {
    const dek = generateDek();

    expect(() => decryptText(dek, encryptText(dek, "heading", "title"), "body")).toThrow(
      LockedError,
    );
    expect(() => decryptText(dek, encryptText(dek, "writing", "body"), "title")).toThrow(
      LockedError,
    );
  });
});

describe("tampering is detected", () => {
  it("throws on a flipped bit in the ciphertext", () => {
    const dek = generateDek();
    const blob = encryptText(dek, "a sentence long enough to have a middle", "body");
    const { packed } = unpack(blob);

    // Somewhere inside the ciphertext region, past version + IV + tag.
    const tampered = flipBit(blob, 29 + Math.floor((packed.length - 29) / 2));

    expect(tampered).not.toBe(blob);
    expect(() => decryptText(dek, tampered, "body")).toThrow(LockedError);
  });

  it("throws on a flipped bit in the IV", () => {
    const dek = generateDek();
    const blob = encryptText(dek, "a sentence", "body");

    // Byte 1 is the first byte of the IV.
    expect(() => decryptText(dek, flipBit(blob, 1), "body")).toThrow(LockedError);
  });

  it("throws on a flipped bit in the auth tag", () => {
    const dek = generateDek();
    const blob = encryptText(dek, "a sentence", "body");

    // Byte 13 is the first byte of the tag.
    expect(() => decryptText(dek, flipBit(blob, 13), "body")).toThrow(LockedError);
  });

  it("throws when a tag from another row is pasted in", () => {
    const dek = generateDek();
    const mine = unpack(encryptText(dek, "mine", "body"));
    const other = unpack(encryptText(dek, "other", "body"));

    const swapped = Buffer.concat([
      mine.version,
      mine.iv,
      other.tag,
      mine.ciphertext,
    ]).toString("base64");

    expect(() => decryptText(dek, swapped, "body")).toThrow(LockedError);
  });

  it("throws when an IV from another row is pasted in", () => {
    const dek = generateDek();
    const mine = unpack(encryptText(dek, "mine", "body"));
    const other = unpack(encryptText(dek, "mine", "body"));

    const swapped = Buffer.concat([
      mine.version,
      other.iv,
      mine.tag,
      mine.ciphertext,
    ]).toString("base64");

    expect(() => decryptText(dek, swapped, "body")).toThrow(LockedError);
  });

  it("throws on truncation, junk and an unknown version byte", () => {
    const dek = generateDek();
    const blob = encryptText(dek, "a sentence", "body");
    const { packed } = unpack(blob);

    const truncated = packed.subarray(0, packed.length - 3).toString("base64");
    const tooShort = Buffer.alloc(10).toString("base64");
    const bumped = Buffer.from(packed);
    bumped[0] = 9;

    expect(() => decryptText(dek, truncated, "body")).toThrow(LockedError);
    expect(() => decryptText(dek, tooShort, "body")).toThrow(LockedError);
    expect(() => decryptText(dek, bumped.toString("base64"), "body")).toThrow(LockedError);
    expect(() => decryptText(dek, "not base64 at all !!!", "body")).toThrow(LockedError);
    expect(() => decryptText(dek, "", "body")).toThrow(LockedError);
  });

  it("appending bytes to the ciphertext does not extend the plaintext", () => {
    const dek = generateDek();
    const { version, iv, tag, ciphertext } = unpack(encryptText(dek, "short", "body"));

    const extended = Buffer.concat([
      version,
      iv,
      tag,
      ciphertext,
      Buffer.from("extra"),
    ]).toString("base64");

    expect(() => decryptText(dek, extended, "body")).toThrow(LockedError);
  });
});

describe("wrapping the data key", () => {
  it(
    "unwraps to exactly the same key with the right password",
    async () => {
      const dek = generateDek();
      const wrapped = await wrapDek(dek, PASSWORD, "password");

      const opened = await unwrapDek(PASSWORD, wrapped, "password");

      expect(opened.equals(dek)).toBe(true);
      expect(opened).toHaveLength(32);
    },
    KDF_TIMEOUT,
  );

  it(
    "FAILS on the wrong password and returns nothing at all",
    async () => {
      const dek = generateDek();
      const wrapped = await wrapDek(dek, PASSWORD, "password");

      // Not "returns a different key" — throws, so there is no value a caller
      // could mistake for the real DEK and go on to decrypt entries with.
      await expect(unwrapDek(WRONG, wrapped, "password")).rejects.toThrow(LockedError);
      await expect(unwrapDek("", wrapped, "password")).rejects.toThrow(LockedError);
      await expect(unwrapDek(PASSWORD + " ", wrapped, "password")).rejects.toThrow(LockedError);
      await expect(unwrapDek(PASSWORD.toUpperCase(), wrapped, "password")).rejects.toThrow(
        LockedError,
      );
    },
    KDF_TIMEOUT,
  );

  it(
    "an entry stays unreadable after a wrong-password attempt",
    async () => {
      const dek = generateDek();
      const wrapped = await wrapDek(dek, PASSWORD, "password");
      const blob = encryptText(dek, "the entry", "body");

      await expect(unwrapDek(WRONG, wrapped, "password")).rejects.toThrow(LockedError);

      // And the real key still works afterwards: a failed attempt changes
      // nothing about the stored wrap.
      const again = await unwrapDek(PASSWORD, wrapped, "password");
      expect(decryptText(again, blob, "body")).toBe("the entry");
    },
    KDF_TIMEOUT,
  );

  it(
    "does not store the password or the key anywhere in the wrap",
    async () => {
      const dek = generateDek();
      const wrapped = await wrapDek(dek, PASSWORD, "password");

      const all = wrapped.salt + wrapped.blob + wrapped.params;
      expect(all).not.toContain(PASSWORD);
      expect(all).not.toContain(dek.toString("base64"));
      expect(all).not.toContain(dek.toString("hex"));
      expect(Buffer.from(wrapped.blob, "base64").includes(dek)).toBe(false);
    },
    KDF_TIMEOUT,
  );

  it(
    "uses a fresh salt every time, so the same password wraps differently",
    async () => {
      const dek = generateDek();

      const a = await wrapDek(dek, PASSWORD, "password");
      const b = await wrapDek(dek, PASSWORD, "password");

      expect(a.salt).not.toBe(b.salt);
      expect(a.blob).not.toBe(b.blob);
      expect((await unwrapDek(PASSWORD, a, "password")).equals(dek)).toBe(true);
      expect((await unwrapDek(PASSWORD, b, "password")).equals(dek)).toBe(true);
    },
    KDF_TIMEOUT,
  );

  it(
    "detects tampering with the wrapped key blob and with the salt",
    async () => {
      const dek = generateDek();
      const wrapped = await wrapDek(dek, PASSWORD, "password");

      const bentBlob: WrappedDek = { ...wrapped, blob: flipBit(wrapped.blob, 30) };
      const bentSalt: WrappedDek = { ...wrapped, salt: flipBit(wrapped.salt, 0) };

      await expect(unwrapDek(PASSWORD, bentBlob, "password")).rejects.toThrow(LockedError);
      await expect(unwrapDek(PASSWORD, bentSalt, "password")).rejects.toThrow(LockedError);
    },
    KDF_TIMEOUT,
  );

  it(
    "refuses parameters that would make the KDF cheap",
    async () => {
      const dek = generateDek();
      const wrapped = await wrapDek(dek, PASSWORD, "password");

      for (const params of [
        '{"kdf":"scrypt","N":2,"r":8,"p":1,"keyLen":32}',
        '{"kdf":"scrypt","N":1024,"r":1,"p":1,"keyLen":32}',
        '{"kdf":"pbkdf2","N":32768,"r":8,"p":1,"keyLen":32}',
        '{"kdf":"scrypt","N":32768,"r":8,"p":1,"keyLen":16}',
        "not json",
      ]) {
        await expect(unwrapDek(PASSWORD, { ...wrapped, params }, "password")).rejects.toThrow(
          LockedError,
        );
      }
    },
    KDF_TIMEOUT,
  );

  it("ships parameters that are actually expensive", () => {
    expect(DEFAULT_KDF.kdf).toBe("scrypt");
    expect(DEFAULT_KDF.N).toBeGreaterThanOrEqual(1 << 15);
    expect(DEFAULT_KDF.r).toBe(8);
    expect(DEFAULT_KDF.keyLen).toBe(32);
    // ~32 MiB of memory per guess for anyone brute-forcing the database.
    expect(128 * DEFAULT_KDF.N * DEFAULT_KDF.r).toBeGreaterThanOrEqual(32 * 1024 * 1024);
    expect(JSON.parse(serializeKdfParams(DEFAULT_KDF))).toEqual(DEFAULT_KDF);
  });
});

describe("the recovery code", () => {
  it("opens the same data key the password does", async () => {
    const dek = generateDek();
    const code = generateRecoveryCode();

    const byPassword = await wrapDek(dek, PASSWORD, "password");
    const byCode = await wrapDek(dek, normalizeRecoveryCode(code), "recovery");

    const fromPassword = await unwrapDek(PASSWORD, byPassword, "password");
    const fromCode = await unwrapDek(normalizeRecoveryCode(code), byCode, "recovery");

    expect(fromCode.equals(dek)).toBe(true);
    expect(fromCode.equals(fromPassword)).toBe(true);

    // And so the same entry reads back through either door.
    const blob = encryptText(dek, "what she wrote", "body");
    expect(decryptText(fromCode, blob, "body")).toBe("what she wrote");
    expect(decryptText(fromPassword, blob, "body")).toBe("what she wrote");
  }, KDF_TIMEOUT);

  it("fails on the wrong code", async () => {
    const dek = generateDek();
    const wrapped = await wrapDek(dek, normalizeRecoveryCode(generateRecoveryCode()), "recovery");

    await expect(
      unwrapDek(normalizeRecoveryCode(generateRecoveryCode()), wrapped, "recovery"),
    ).rejects.toThrow(LockedError);
  }, KDF_TIMEOUT);

  it("will not open the password wrap with the recovery wrap's purpose", async () => {
    const dek = generateDek();
    const wrapped = await wrapDek(dek, PASSWORD, "password");

    // The two blobs hold the same key but are bound to different AAD, so a row
    // with its columns swapped fails rather than quietly working.
    await expect(unwrapDek(PASSWORD, wrapped, "recovery")).rejects.toThrow(LockedError);
  }, KDF_TIMEOUT);

  it("is 125 bits from an unambiguous alphabet", () => {
    const code = generateRecoveryCode();

    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
    expect(normalizeRecoveryCode(code)).toHaveLength(25);
    expect(code).not.toMatch(/[ILOU]/);
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateRecoveryCode());
    expect(seen.size).toBe(200);
  });

  it("forgives case, spacing and the letters that look like digits", () => {
    const code = generateRecoveryCode();
    const canonical = normalizeRecoveryCode(code);

    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(canonical);
    expect(normalizeRecoveryCode(` ${code.replace(/-/g, " ")} `)).toBe(canonical);
    expect(normalizeRecoveryCode(code.replace(/-/g, ""))).toBe(canonical);
    // Somebody copying off paper reads 0 as O and 1 as I or l.
    expect(normalizeRecoveryCode("O1I-lO0")).toBe("011100");
  });
});

describe("changing the password", () => {
  it(
    "re-wraps the same data key, so entries written before it still open",
    async () => {
      const dek = generateDek();
      const before = encryptText(dek, "written under the old password", "body");
      const heading = encryptText(dek, "a heading", "title");

      const oldWrap = await wrapDek(dek, PASSWORD, "password");

      // The change: open with the old password, re-wrap that exact key.
      const opened = await unwrapDek(PASSWORD, oldWrap, "password");
      const newWrap = await wrapDek(opened, "something else entirely", "password");

      const after = await unwrapDek("something else entirely", newWrap, "password");

      expect(after.equals(dek)).toBe(true);
      expect(decryptText(after, before, "body")).toBe("written under the old password");
      expect(decryptText(after, heading, "title")).toBe("a heading");
      // The old password is now no good.
      await expect(unwrapDek(PASSWORD, newWrap, "password")).rejects.toThrow(LockedError);
    },
    KDF_TIMEOUT,
  );

  it(
    "leaves the recovery code working after a password change",
    async () => {
      const dek = generateDek();
      const code = normalizeRecoveryCode(generateRecoveryCode());
      const recoveryWrap = await wrapDek(dek, code, "recovery");
      const entry = encryptText(dek, "still readable", "body");

      const newWrap = await wrapDek(dek, "a brand new password", "password");

      expect((await unwrapDek("a brand new password", newWrap, "password")).equals(dek)).toBe(
        true,
      );
      const viaCode = await unwrapDek(code, recoveryWrap, "recovery");
      expect(decryptText(viaCode, entry, "body")).toBe("still readable");
    },
    KDF_TIMEOUT,
  );
});

describe("the unlock cookie", () => {
  const SECRET = "a-server-secret-long-enough-to-be-one";
  const USER = "user_abc123";
  const SECTION = "11111111-2222-3333-4444-555555555555";
  const NOW = 1_700_000_000_000;

  function token(overrides: Partial<{ iat: number; exp: number }> = {}) {
    return {
      dek: generateDek().toString("base64"),
      iat: NOW,
      exp: NOW + 15 * 60_000,
      ...overrides,
    };
  }

  it("round-trips the data key for the right user and section", () => {
    const t = token();
    const sealed = sealUnlockToken(t, USER, SECTION, SECRET);

    expect(openUnlockToken(sealed, USER, SECTION, SECRET, NOW)).toEqual(t);
  });

  it("does not put the data key in the cookie in the clear", () => {
    const t = token();
    const sealed = sealUnlockToken(t, USER, SECTION, SECRET);

    expect(sealed).not.toContain(t.dek);
    expect(Buffer.from(sealed, "base64").includes(Buffer.from(t.dek, "base64"))).toBe(false);
  });

  it("cannot be replayed at another section or by another user", () => {
    const sealed = sealUnlockToken(token(), USER, SECTION, SECRET);

    expect(() =>
      openUnlockToken(sealed, USER, "99999999-2222-3333-4444-555555555555", SECRET, NOW),
    ).toThrow(LockedError);
    expect(() => openUnlockToken(sealed, "someone_else", SECTION, SECRET, NOW)).toThrow(
      LockedError,
    );
  });

  it("cannot be forged or read without the server secret", () => {
    const sealed = sealUnlockToken(token(), USER, SECTION, SECRET);

    expect(() => openUnlockToken(sealed, USER, SECTION, "a-different-server-secret", NOW)).toThrow(
      LockedError,
    );
    expect(() => openUnlockToken(flipBit(sealed, 30), USER, SECTION, SECRET, NOW)).toThrow(
      LockedError,
    );
    expect(() => openUnlockToken("garbage", USER, SECTION, SECRET, NOW)).toThrow(LockedError);
  });

  it("expires on its own sealed clock, not on the browser's", () => {
    const sealed = sealUnlockToken(token({ exp: NOW + 1000 }), USER, SECTION, SECRET);

    expect(() => openUnlockToken(sealed, USER, SECTION, SECRET, NOW + 999)).not.toThrow();
    expect(() => openUnlockToken(sealed, USER, SECTION, SECRET, NOW + 1000)).toThrow(LockedError);
    expect(() => openUnlockToken(sealed, USER, SECTION, SECRET, NOW + 60_000)).toThrow(
      LockedError,
    );
  });

  it("refuses a token stamped in the future", () => {
    const sealed = sealUnlockToken(
      token({ iat: NOW + 10 * 60_000, exp: NOW + 30 * 60_000 }),
      USER,
      SECTION,
      SECRET,
    );

    expect(() => openUnlockToken(sealed, USER, SECTION, SECRET, NOW)).toThrow(LockedError);
  });

  it("refuses a short or missing server secret", () => {
    expect(() => sealUnlockToken(token(), USER, SECTION, "")).toThrow(LockedError);
    expect(() => sealUnlockToken(token(), USER, SECTION, "tooshort")).toThrow(LockedError);
  });
});
