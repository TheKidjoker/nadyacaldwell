"use client";

import { useMemo } from "react";
import { ContactShadows, Environment } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { getFraming, halfWidthAt, type QualitySettings } from "@/lib/scene/quality";
import { Flowers } from "./Flowers";
import { Ocean } from "./Ocean";
import { Pearls } from "./Pearls";
import { Ribbons3D } from "./Ribbons3D";
import { Rig } from "./Rig";
import { SkyDome } from "./SkyDome";
import { Terrain } from "./Terrain";
import { ClockDriver } from "./useClock";
import { EnvSky } from "./EnvSky";

/**
 * Scene assembly.
 *
 * One cinematic key light (warm, upper-right) plus cool sky fill from an
 * image-based environment generated in-engine — no HDRI download. Depth is
 * built with real distance rather than layered images: foreground flowers sit
 * within a couple of units of the camera, the beds and ribbons at mid depth,
 * the water running back 600 units to hazed coastal ridges.
 */

/** Warm morning sun, high on the right. */
export const SUN_DIRECTION = new THREE.Vector3(0.52, 0.36, -0.78).normalize();

export function Scene({
  quality,
  animate,
}: {
  quality: QualitySettings;
  animate: boolean;
}) {
  const { size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const framing = useMemo(() => getFraming(aspect), [aspect]);

  const sunPosition = useMemo(
    () => SUN_DIRECTION.clone().multiplyScalar(40),
    [],
  );

  return (
    <>
      <ClockDriver animate={animate} />
      <Rig framing={framing} parallax={framing.parallax} />

      <SkyDome sunDirection={SUN_DIRECTION} cloudAmount={quality.tier === "low" ? 0.75 : 1} />

      {/* Image-based lighting from a procedurally rendered sky. */}
      <Environment resolution={quality.envResolution} frames={1}>
        <EnvSky sunDirection={SUN_DIRECTION} />
      </Environment>

      <hemisphereLight args={["#cfe6fb", "#7f98a2", 0.38]} />
      <directionalLight
        position={sunPosition}
        intensity={3.1}
        color="#ffeaC4"
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.tier === "high" ? 1024 : 512}
        shadow-mapSize-height={quality.tier === "high" ? 1024 : 512}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0008}
      />
      {/* Cool bounce from the water, filling the undersides of the petals. */}
      <directionalLight position={[-4, -2, 3]} intensity={0.35} color="#a9cbe8" />

      <Ocean segments={quality.waterSegments} sunDirection={SUN_DIRECTION} />
      <Terrain
        stones={quality.tier !== "low"}
        stoneSpread={halfWidthAt(framing, aspect, 2.6) * framing.outer * 1.1}
      />

      <Flowers
        count={quality.flowers}
        scatter={quality.scatter}
        fringe={quality.fringe}
        framing={framing}
        aspect={aspect}
        sunDirection={SUN_DIRECTION}
        translucency={quality.tier === "low" ? 0.4 : 0.6}
        sheen={quality.tier === "low" ? 0 : 1}
      />

      <Ribbons3D
        samples={quality.ribbonSamples}
        framing={framing}
        aspect={aspect}
        envIntensity={1.15}
      />

      <Pearls
        count={quality.pearls}
        framing={framing}
        aspect={aspect}
        transmission={quality.transmission}
      />

      {quality.shadows && (
        <ContactShadows
          position={[0, framing.bedDrop + 0.035, 2.3]}
          scale={13}
          resolution={quality.tier === "high" ? 512 : 256}
          blur={2.8}
          opacity={0.32}
          far={1.6}
          color="#2c4f74"
          frames={1}
        />
      )}
    </>
  );
}
