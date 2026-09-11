/**
 * Device capability tiers.
 *
 * Mobile is the design target, not an afterthought: the low tier drops
 * instance counts, water tessellation, shadows, transmission materials and
 * every post-processing pass, and clamps the device pixel ratio so a 3x phone
 * screen never renders 9x the fragments.
 */

export type Tier = "low" | "medium" | "high";

export interface QualitySettings {
  tier: Tier;
  /** [min, max] device pixel ratio handed to the renderer */
  dpr: [number, number];
  /** flowers per bed */
  flowers: number;
  /** extra scatter flowers across the midground */
  scatter: number;
  /** low flowers across the full width at the very front, below the type */
  fringe: number;
  /** width segments of the ocean plane */
  waterSegments: number;
  shadows: boolean;
  /** physical transmission (real glass) vs a cheap glossy stand-in */
  transmission: boolean;
  pearls: number;
  bloom: boolean;
  depthOfField: boolean;
  /** environment cube resolution for image-based lighting */
  envResolution: number;
  ribbonSamples: number;
}

const PRESETS: Record<Tier, Omit<QualitySettings, "tier">> = {
  high: {
    dpr: [1, 1.75],
    flowers: 58,
    scatter: 26,
    fringe: 34,
    waterSegments: 160,
    shadows: true,
    transmission: true,
    pearls: 9,
    bloom: false,
    depthOfField: true,
    envResolution: 256,
    ribbonSamples: 150,
  },
  medium: {
    dpr: [1, 1.5],
    flowers: 36,
    scatter: 14,
    fringe: 22,
    waterSegments: 96,
    shadows: true,
    transmission: false,
    pearls: 6,
    bloom: false,
    depthOfField: false,
    envResolution: 128,
    ribbonSamples: 110,
  },
  low: {
    dpr: [1, 1.25],
    flowers: 22,
    scatter: 6,
    fringe: 12,
    waterSegments: 48,
    shadows: false,
    transmission: false,
    pearls: 4,
    bloom: false,
    depthOfField: false,
    envResolution: 64,
    ribbonSamples: 70,
  },
};

export function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True for touch-first devices, where pointer parallax is meaningless. */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function detectTier(): Tier {
  if (typeof window === "undefined") return "medium";

  const coarse = isCoarsePointer();
  const cores = navigator.hardwareConcurrency ?? 4;
  // Non-standard but widely available on Chrome/Android, where it matters most.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const short = Math.min(window.screen.width, window.screen.height);

  // Anything touch-first starts at low and has to earn its way up.
  if (coarse) {
    if (cores >= 8 && memory >= 6 && short >= 390) return "medium";
    return "low";
  }

  if (cores <= 4 || memory <= 4) return "medium";
  if (window.innerWidth < 1024) return "medium";
  return "high";
}

export function getQuality(tier: Tier): QualitySettings {
  return { tier, ...PRESETS[tier] };
}

/**
 * Camera and layout framing.
 *
 * Portrait viewports pull the camera back and push the flower beds outward and
 * downward, so the centre column stays clear for the name no matter how narrow
 * the screen gets.
 */
export interface Framing {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /**
   * Bed placement is expressed as a fraction of the view frustum's half-width
   * at each flower's depth, not as world units. That is the only way "keep the
   * centre clear" survives a change of aspect ratio: `inner` is how much of the
   * screen stays empty for the name, `outer` how far past the edge the beds
   * run. World-unit spreads look correct on one screen and wrong on every
   * other one.
   */
  inner: number;
  outer: number;
  /** near and far depth limits of the beds */
  bedZ: [number, number];
  /** vertical offset applied to the beds */
  bedDrop: number;
  parallax: number;
}

/** Horizontal half-width of the frustum at a given z, in world units. */
export function halfWidthAt(framing: Framing, aspect: number, z: number): number {
  const tanH = Math.tan((framing.fov * Math.PI) / 360) * aspect;
  return Math.max(0.001, (framing.position[2] - z) * tanH);
}

export function getFraming(aspect: number): Framing {
  // Portrait phone: the name occupies most of the width, so the beds are held
  // well outside it and sit lower in frame.
  if (aspect < 0.72) {
    return {
      position: [0, 0.92, 6.6],
      target: [0, 1.02, 0],
      fov: 46,
      inner: 0.84,
      outer: 1.62,
      bedZ: [2.05, 3.2],
      bedDrop: -0.12,
      parallax: 0,
    };
  }
  // Narrow / small tablet
  if (aspect < 1.05) {
    return {
      position: [0, 0.95, 6.5],
      target: [0, 1.04, 0],
      fov: 42,
      inner: 0.76,
      outer: 1.56,
      bedZ: [2.05, 3.4],
      bedDrop: -0.1,
      parallax: 0,
    };
  }
  // Landscape tablet
  if (aspect < 1.5) {
    return {
      position: [0, 0.95, 6.4],
      target: [0, 1.02, 0],
      fov: 37,
      inner: 0.66,
      outer: 1.52,
      bedZ: [2.05, 3.5],
      bedDrop: -0.05,
      parallax: 0.06,
    };
  }
  // Desktop
  return {
    position: [0, 0.95, 6.4],
    target: [0, 1.0, 0],
    fov: 35,
    inner: 0.62,
    outer: 1.5,
    bedZ: [2.05, 3.6],
    bedDrop: 0,
    parallax: 0.09,
  };
}
