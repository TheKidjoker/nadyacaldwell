"use client";

import { useFrame } from "@react-three/fiber";

/**
 * One shared scene clock.
 *
 * Everything animated reads this instead of keeping its own timer, so the
 * whole scene can be frozen in a single place — when the tab is hidden, or
 * when the visitor prefers reduced motion. Freezing time rather than stopping
 * the render loop means the composition holds its pose instead of snapping
 * back to t=0.
 */
const state = { t: 0 };

export function ClockDriver({ animate }: { animate: boolean }) {
  useFrame((_, delta) => {
    // Clamp so a backgrounded tab returning to focus does not jump the scene.
    if (animate) state.t += Math.min(delta, 0.05);
  });
  return null;
}

export function useClock() {
  return {
    get: () => state.t,
  };
}

export function currentSceneTime() {
  return state.t;
}
