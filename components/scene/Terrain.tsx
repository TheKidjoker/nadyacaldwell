"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { createRidgeGeometry } from "@/lib/scene/geometry";

/**
 * Distant coastline and the stone the flowers grow out of.
 *
 * The ridges are three noise-carved silhouettes at different depths. Each one
 * is washed towards the horizon colour by an aerial-perspective term that
 * strengthens with distance and towards the waterline, which is what sells the
 * depth — a Mediterranean coast reads as pale, flat and hazy, not as detailed
 * rock.
 */

const ridgeVertex = /* glsl */ `
  varying float vHeight;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vHeight = position.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ridgeFragment = /* glsl */ `
  uniform vec3 uRock;
  uniform vec3 uHorizon;
  uniform vec3 uSunColour;
  uniform float uHaze;
  uniform float uHeight;

  varying float vHeight;
  varying vec3 vWorld;

  void main() {
    float t = clamp(vHeight / uHeight, 0.0, 1.0);

    // Sunlit crests, cooler flanks.
    vec3 rock = mix(uRock * 0.92, uRock * 1.12 + uSunColour * 0.10, pow(t, 1.4));

    // Aerial perspective: thickest at the waterline, thinning towards the peaks.
    float haze = clamp(uHaze + (1.0 - t) * 0.45, 0.0, 1.0);
    vec3 colour = mix(rock, uHorizon, haze);

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface RidgeProps {
  width: number;
  height: number;
  z: number;
  seed: number;
  roughness: number;
  haze: number;
  rock: string;
}

function Ridge({ width, height, z, seed, roughness, haze, rock }: RidgeProps) {
  const geometry = useMemo(
    () => createRidgeGeometry(width, height, 110, seed, roughness),
    [width, height, seed, roughness],
  );

  const uniforms = useMemo(
    () => ({
      uRock: { value: new THREE.Color(rock) },
      uHorizon: { value: new THREE.Color("#cbe0f1") },
      uSunColour: { value: new THREE.Color("#ffeccb") },
      uHaze: { value: haze },
      uHeight: { value: height },
    }),
    [rock, haze, height],
  );

  return (
    <mesh geometry={geometry} position={[0, height / 2 - height * 0.06, z]}>
      <shaderMaterial
        vertexShader={ridgeVertex}
        fragmentShader={ridgeFragment}
        uniforms={uniforms}
      />
    </mesh>
  );
}

/** Weathered coastal stone, deformed so no two boulders repeat. */
function Stone({
  position,
  scale,
  seed,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  seed: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n =
        Math.sin(v.x * 3.1 + seed) * 0.12 +
        Math.sin(v.y * 4.3 + seed * 1.7) * 0.09 +
        Math.sin(v.z * 2.7 + seed * 2.3) * 0.11;
      v.multiplyScalar(1 + n);
      // Flatten the underside so it beds into the ground.
      if (v.y < 0) v.y *= 0.45;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [seed]);

  return (
    <mesh geometry={geometry} position={position} scale={scale} castShadow receiveShadow>
      <meshStandardMaterial color="#b9bfc0" roughness={0.94} metalness={0} />
    </mesh>
  );
}

/**
 * The coastal terrace.
 *
 * Without it the flowers appear to grow straight out of the sea. Its front
 * edge reads as the shoreline, sitting below the typography, and it gives the
 * contact shadows something real to fall on.
 */
function Bank() {
  return (
    <group>
      {/* Held close to the camera so it reads as a sliver of shore at the very
          bottom of frame rather than a slab across the middle of the view. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 11]} receiveShadow>
        <planeGeometry args={[160, 18.2]} />
        <meshStandardMaterial color="#a7adad" roughness={0.98} metalness={0} />
      </mesh>
      {/* Wet stone at the waterline. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 2.05]}>
        <planeGeometry args={[160, 0.5]} />
        <meshStandardMaterial color="#93a0a4" roughness={0.5} metalness={0} />
      </mesh>
    </group>
  );
}

export function Terrain({
  stones = true,
  stoneSpread = 3,
}: {
  stones?: boolean;
  stoneSpread?: number;
}) {
  return (
    <group>
      <Bank />
      <Ridge width={1500} height={27} z={-430} seed={3} roughness={0.09} haze={0.66} rock="#a8bed3" />
      <Ridge width={1150} height={18} z={-335} seed={17} roughness={0.13} haze={0.55} rock="#9db6cf" />
      <Ridge width={880} height={11} z={-252} seed={41} roughness={0.2} haze={0.44} rock="#95b0cb" />

      {stones && (
        <group>
          <Stone position={[-stoneSpread * 1.1, -0.3, 2.6]} scale={[1.5, 0.62, 1.2]} seed={1.3} />
          <Stone position={[-stoneSpread * 0.78, -0.34, 3.8]} scale={[1.0, 0.45, 0.9]} seed={5.1} />
          <Stone position={[stoneSpread * 1.06, -0.29, 2.4]} scale={[1.4, 0.58, 1.15]} seed={9.7} />
          <Stone position={[stoneSpread * 0.8, -0.36, 3.9]} scale={[1.1, 0.42, 0.95]} seed={13.2} />
        </group>
      )}
    </group>
  );
}
