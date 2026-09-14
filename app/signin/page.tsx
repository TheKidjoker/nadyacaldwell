"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import styles from "./signin.module.css";

export default function SignInPage() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function continueWithGoogle() {
    setPending(true);
    setFailed(false);

    const { error } = await signIn.social({
      provider: "google",
      callbackURL: "/budget",
    });

    if (error) {
      setFailed(true);
      setPending(false);
    }
    // On success the browser is already on its way to Google; leave `pending`
    // set so the button cannot be pressed twice during the handoff.
  }

  return (
    <main className={styles.stage}>
      <div className={styles.inner}>
        <h1 className={styles.name}>Nadya</h1>
        <div className={styles.hairline} aria-hidden="true" />
        <p className={styles.note}>This one is hers alone.</p>
        <button
          type="button"
          className={styles.button}
          onClick={continueWithGoogle}
          disabled={pending}
        >
          {pending ? "One moment…" : "Continue with Google"}
        </button>
        {failed && (
          <p className={styles.error} role="alert">
            That account can&rsquo;t sign in here.
          </p>
        )}
      </div>
    </main>
  );
}
