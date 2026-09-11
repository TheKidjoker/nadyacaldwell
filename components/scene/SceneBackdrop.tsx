"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import styles from "@/app/scene.module.css";
import { detectTier, hasWebGL, prefersReducedMotion, type Tier } from "@/lib/scene/quality";

/**
 * Progressive enhancement wrapper for the 3D scene.
 *
 * A CSS poster paints first and never goes away — it is the loading state, the
 * no-WebGL fallback and the backdrop behind the canvas all at once, so there
 * is never a blank frame and the page's message never depends on WebGL. The
 * WebGL bundle is only requested after the browser has gone idle, so the name
 * is on screen long before Three.js is even fetched.
 */
const Experience = dynamic(
  () => import("./Experience").then((m) => ({ default: m.Experience })),
  { ssr: false },
);

export function SceneBackdrop() {
  const [tier, setTier] = useState<Tier | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasWebGL()) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(reduce.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    reduce.addEventListener("change", onChange);

    // Let the typography paint and settle before asking for the 3D bundle.
    let cancelled = false;
    const start = () => {
      if (!cancelled) setTier(detectTier());
    };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 1200 })
      : window.setTimeout(start, 350);

    return () => {
      cancelled = true;
      reduce.removeEventListener("change", onChange);
      if (window.cancelIdleCallback && typeof idle === "number") {
        window.cancelIdleCallback(idle);
      } else {
        clearTimeout(idle as number);
      }
    };
  }, []);

  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.poster} />
      {tier && (
        <div className={`${styles.canvasWrap} ${ready ? styles.canvasReady : ""}`}>
          <Experience
            tier={tier}
            reducedMotion={reducedMotion}
            onReady={() => setReady(true)}
          />
        </div>
      )}
    </div>
  );
}
