"use client";

import { useEffect, useState, type ReactElement } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";

import { getQuality, type QualitySettings, type Tier } from "@/lib/scene/quality";
import { Scene } from "./Scene";

/**
 * The WebGL layer.
 *
 * Rendering is demand-driven whenever nothing should be moving — a hidden tab,
 * or a visitor who prefers reduced motion — so the scene holds a still frame
 * instead of burning the GPU. Pixel ratio is capped per tier rather than
 * following the device, which is the single biggest win on a 3x phone screen.
 */
function Post({ quality }: { quality: QualitySettings }) {
  const effects: ReactElement[] = [];

  if (quality.depthOfField) {
    effects.push(
      <DepthOfField key="dof" focusDistance={0.011} focalLength={0.07} bokehScale={2.4} height={480} />,
    );
  }
  if (quality.bloom) {
    effects.push(
      <Bloom
        key="bloom"
        intensity={0.42}
        luminanceThreshold={0.88}
        luminanceSmoothing={0.22}
        mipmapBlur
      />,
    );
  }

  if (effects.length === 0) return null;

  return (
    <EffectComposer enableNormalPass={false} multisampling={0}>
      {effects}
    </EffectComposer>
  );
}

export function Experience({
  tier,
  reducedMotion,
  onReady,
}: {
  tier: Tier;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const quality = getQuality(tier);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const animate = visible && !reducedMotion;

  return (
    <Canvas
      // A still scene only needs to draw when something actually changes.
      frameloop={animate ? "always" : "demand"}
      dpr={quality.dpr}
      shadows={quality.shadows}
      gl={{
        antialias: quality.tier !== "low",
        alpha: false,
        powerPreference: "high-performance",
        // ACES desaturates pastels badly; Khronos Neutral holds the blues.
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: 1.12,
      }}
      camera={{ position: [0, 1.35, 6.4], fov: 34, near: 0.1, far: 1200 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color("#cfe4f5"), 1);
        onReady();
      }}
    >
      <Scene quality={quality} animate={animate} />

      <Post quality={quality} />
    </Canvas>
  );
}
