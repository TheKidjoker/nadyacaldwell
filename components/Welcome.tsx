"use client";

import { useState } from "react";
import { markWelcomed } from "@/lib/budget/actions";
import { WELCOME_CONTINUE, WELCOME_LINE } from "@/lib/welcome";
import styles from "./welcome.module.css";

/**
 * The first-run welcome. She sees this once, ever.
 *
 * It is marked seen when she taps through, NOT when it renders: stamping on
 * render would let a stray refresh mid-animation burn the moment permanently,
 * whereas this way the failure direction is a harmless replay.
 *
 * The signature is revealed by sweeping a soft mask across live text rather
 * than animating an SVG path. Converting Parisienne to outlines would freeze
 * the wordmark into a static asset and quietly escape the 2.5rem floor rule
 * that the rest of the app polices, so the type stays real.
 */
export function Welcome() {
  const [leaving, setLeaving] = useState(false);

  return (
    <div className={`${styles.stage} ${leaving ? styles.leaving : ""}`}>
      <div className={styles.inner}>
        <h1 className={styles.signature}>Nadya</h1>

        <div className={styles.hairline} aria-hidden="true" />

        {WELCOME_LINE && <p className={styles.line}>{WELCOME_LINE}</p>}

        <form
          action={markWelcomed}
          onSubmit={() => setLeaving(true)}
          className={styles.actions}
        >
          <button type="submit" className={styles.begin}>
            {WELCOME_CONTINUE}
          </button>
        </form>
      </div>
    </div>
  );
}
