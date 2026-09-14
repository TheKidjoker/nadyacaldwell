"use client";

import { useId, useState } from "react";
import {
  changeSectionPassword,
  lockSection,
  protectSection,
  recoverSection,
  removeSectionProtection,
  unlockSection,
} from "@/lib/notes-actions";
import type { LockResult } from "@/lib/notes-actions";
import styles from "./notes.module.css";

/**
 * The lock on one section: turning it on, opening it, changing the password,
 * getting back in with the recovery code, and taking it off again.
 *
 * The thing this component exists to get right is the sentence before she
 * commits. A password here is real encryption, and a real chance of losing
 * what she wrote — so that is said in full-size words inside a bordered box,
 * with a box she has to tick, rather than in a line of grey print under the
 * button. Nothing here softens it.
 *
 * Every form is a POST through a Server Action. Nothing she types goes into a
 * URL, a query string, or a GET, and every password field is a real
 * `type="password"` with the autocomplete hint that belongs to it.
 */

/**
 * `locked` is one reason covering several causes on purpose — the server will
 * not say whether it was the password, the code, or the section, so neither
 * does this.
 */
const MESSAGES: Record<string, string> = {
  locked: "That didn't open it. Check what you typed and try again.",
  weak: "Make it at least 8 characters.",
  mismatch: "Those two don't match.",
  acknowledge: "Tick the box first — it matters.",
  already: "This section already has a password.",
  corrupt:
    "Something in here wouldn't unscramble, so nothing was changed. Leave it as it is for now.",
};

export function SectionLock({
  sectionId,
  encrypted,
  locked,
  entryCount,
}: {
  sectionId: string;
  encrypted: boolean;
  locked: boolean;
  entryCount: number;
}) {
  const [panel, setPanel] = useState<null | "setup" | "recover" | "change" | "remove">(
    null,
  );
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwId = useId();
  const confirmId = useId();
  const currentId = useId();
  const codeId = useId();

  function reset() {
    setPanel(null);
    setError(null);
    setCopied(false);
  }

  /**
   * Run one lock action and turn its answer into a sentence.
   *
   * The actions return their failures rather than throwing them, because a
   * thrown message is replaced by a generic digest in a production build and
   * "those two don't match" would come out as "something went wrong".
   */
  function run(
    action: (formData: FormData) => Promise<LockResult>,
    onOk: (result: LockResult & { ok: true }) => void,
  ) {
    return async (formData: FormData) => {
      setBusy(true);
      setError(null);
      try {
        const result = await action(formData);
        if (result.ok) onOk(result);
        else setError(MESSAGES[result.reason] ?? "That didn't work.");
      } catch {
        setError("That didn't work. Try again in a moment.");
      } finally {
        setBusy(false);
      }
    };
  }

  function keepCode(result: LockResult & { ok: true }) {
    reset();
    if (result.recoveryCode) setIssuedCode(result.recoveryCode);
  }

  // --- the recovery code, shown once and then never again ---

  if (issuedCode) {
    return (
      <section className={`${styles.lock} ${styles.lockShut}`}>
        <h2 className={styles.lockTitle}>Write this down now</h2>
        <p className={styles.lockState}>
          This is the only way back in if you forget the password. You will not
          see it again &mdash; not in this app, not in the database, nowhere. Put
          it somewhere that isn&rsquo;t this phone.
        </p>

        <div className={styles.code}>
          <p className={styles.warnText}>Your recovery code</p>
          <code className={styles.codeText}>{issuedCode}</code>
          <div className={styles.lockTools}>
            <button
              type="button"
              className={styles.lockLink}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issuedCode);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              Copy it
            </button>
            {copied && (
              <span className={`${styles.lockState} ${styles.codeCopied}`} role="status">
                Copied.
              </span>
            )}
          </div>
        </div>

        <div className={styles.lockTools}>
          <button
            type="button"
            className={styles.submit}
            onClick={() => {
              setIssuedCode(null);
              setCopied(false);
            }}
          >
            I&rsquo;ve saved it
          </button>
        </div>
      </section>
    );
  }

  // --- no password on this section yet ---

  if (!encrypted) {
    if (panel !== "setup") {
      return (
        <div className={styles.lockOfferRow}>
          <button
            type="button"
            className={styles.lockOffer}
            onClick={() => setPanel("setup")}
          >
            <span aria-hidden="true">&#128274;</span>
            Put a password on this section
          </button>
        </div>
      );
    }

    return (
      <section className={styles.lock}>
        <h2 className={styles.lockTitle}>Put a password on this section</h2>

        <div className={styles.warn}>
          <p className={styles.warnTitle}>Read this bit properly first.</p>
          <p className={styles.warnText}>
            This isn&rsquo;t a lock screen. Everything in this section gets
            scrambled with a key that only your password opens. Anyone who got
            hold of the database would find nothing here but noise.
          </p>
          <p className={styles.warnText}>
            <span className={styles.warnStrong}>
              That also means: if you forget the password and lose the recovery
              code, these entries are gone.
            </span>{" "}
            Not hidden, not locked away somewhere &mdash; gone. Nobody can get
            them back. Not you, not Chance, not anyone with the database. There
            is no reset email and no way round it.
          </p>
          <p className={styles.warnText}>
            You&rsquo;ll get a recovery code as soon as you&rsquo;ve set this
            up. It is shown once. Write it down on paper.
          </p>
        </div>

        <form action={run(protectSection, keepCode)}>
          <input type="hidden" name="sectionId" value={sectionId} />

          <div className={styles.pwFields}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={pwId}>
                Password
              </label>
              <input
                id={pwId}
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={confirmId}>
                Type it again
              </label>
              <input
                id={confirmId}
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                className={styles.input}
              />
            </div>
          </div>

          <p className={styles.lockNote}>
            At least 8 characters. Anything you type counts, spaces included.
          </p>

          <label className={styles.ack}>
            <input
              type="checkbox"
              name="understood"
              value="yes"
              required
              className={styles.ackBox}
            />
            I understand that if I lose both the password and the recovery code,
            everything in this section is gone for good.
          </label>

          <div className={styles.actions}>
            <button type="submit" disabled={busy} className={styles.submit}>
              {busy ? "Locking it…" : "Lock this section"}
            </button>
            <button type="button" className={styles.cancel} onClick={reset}>
              Cancel
            </button>
          </div>
        </form>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  // --- protected, and shut ---

  if (locked) {
    return (
      <section className={`${styles.lock} ${styles.lockShut}`}>
        <h2 className={styles.lockTitle}>
          <span aria-hidden="true">&#128274;</span> This section is locked
        </h2>
        <p className={styles.lockState}>
          {entryCount === 0
            ? "Nothing in it yet. Your password opens it."
            : entryCount === 1
              ? "1 entry in here. Your password opens it."
              : `${entryCount} entries in here. Your password opens it.`}
        </p>

        {panel !== "recover" ? (
          <>
            <form action={run(unlockSection, reset)}>
              <input type="hidden" name="sectionId" value={sectionId} />
              <div className={styles.pwFields}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={pwId}>
                    Password
                  </label>
                  <input
                    id={pwId}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    maxLength={200}
                    required
                    autoFocus
                    className={styles.input}
                  />
                </div>
              </div>
              <div className={styles.actions}>
                <button type="submit" disabled={busy} className={styles.submit}>
                  {busy ? "Opening…" : "Open it"}
                </button>
              </div>
            </form>

            <div className={styles.lockTools}>
              <button
                type="button"
                className={styles.lockLink}
                onClick={() => {
                  setPanel("recover");
                  setError(null);
                }}
              >
                I&rsquo;ve forgotten it &mdash; use my recovery code
              </button>
            </div>
          </>
        ) : (
          <div className={styles.lockSub}>
            <p className={styles.lockState}>
              Type the recovery code you wrote down, and pick a new password
              while you&rsquo;re here. You&rsquo;ll get a fresh code afterwards,
              because this one has now been used.
            </p>

            <form action={run(recoverSection, keepCode)}>
              <input type="hidden" name="sectionId" value={sectionId} />

              <div className={styles.pwFields}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={codeId}>
                    Recovery code
                  </label>
                  <input
                    id={codeId}
                    name="code"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={64}
                    required
                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={pwId}>
                    New password
                  </label>
                  <input
                    id={pwId}
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={200}
                    required
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={confirmId}>
                    Type it again
                  </label>
                  <input
                    id={confirmId}
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={200}
                    required
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.actions}>
                <button type="submit" disabled={busy} className={styles.submit}>
                  {busy ? "Checking…" : "Get back in"}
                </button>
                <button type="button" className={styles.cancel} onClick={reset}>
                  Back
                </button>
              </div>
            </form>
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  // --- protected, and open ---

  return (
    <section className={styles.lock}>
      <div className={styles.lockHead}>
        <p className={`${styles.lockState} ${styles.lockStateOpen}`}>
          <span aria-hidden="true">&#128275;</span> Open. It locks itself again
          after about fifteen minutes.
        </p>

        <form action={run(lockSection, reset)}>
          <input type="hidden" name="sectionId" value={sectionId} />
          <button type="submit" disabled={busy} className={styles.submit}>
            Lock it now
          </button>
        </form>
      </div>

      {panel === null && (
        <div className={styles.lockTools}>
          <button
            type="button"
            className={styles.lockLink}
            onClick={() => setPanel("change")}
          >
            Change the password
          </button>
          <button
            type="button"
            className={styles.lockLink}
            onClick={() => setPanel("remove")}
          >
            Take the password off
          </button>
        </div>
      )}

      {panel === "change" && (
        <div className={styles.lockSub}>
          <p className={styles.lockState}>
            Everything already in here stays readable &mdash; the new password
            goes over the same key. Your recovery code doesn&rsquo;t change.
          </p>

          <form action={run(changeSectionPassword, reset)}>
            <input type="hidden" name="sectionId" value={sectionId} />

            <div className={styles.pwFields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={currentId}>
                  Current password
                </label>
                <input
                  id={currentId}
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  maxLength={200}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={pwId}>
                  New password
                </label>
                <input
                  id={pwId}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={200}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={confirmId}>
                  Type it again
                </label>
                <input
                  id={confirmId}
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={200}
                  required
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button type="submit" disabled={busy} className={styles.submit}>
                {busy ? "Changing…" : "Change it"}
              </button>
              <button type="button" className={styles.cancel} onClick={reset}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {panel === "remove" && (
        <div className={styles.lockSub}>
          <p className={styles.lockState}>
            This unscrambles everything in the section and puts it back the way
            the rest of your notes are stored. Nothing is deleted, but it stops
            being protected, and the recovery code stops meaning anything.
          </p>

          <form action={run(removeSectionProtection, reset)}>
            <input type="hidden" name="sectionId" value={sectionId} />

            <div className={styles.pwFields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={currentId}>
                  Password
                </label>
                <input
                  id={currentId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={200}
                  required
                  className={styles.input}
                />
              </div>
            </div>

            <label className={styles.ack}>
              <input
                type="checkbox"
                name="understood"
                value="yes"
                required
                className={styles.ackBox}
              />
              I want these entries stored unprotected again.
            </label>

            <div className={styles.actions}>
              <button type="submit" disabled={busy} className={styles.submit}>
                {busy ? "Working…" : "Take it off"}
              </button>
              <button type="button" className={styles.cancel} onClick={reset}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
