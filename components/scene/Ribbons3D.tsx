"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { createRibbonGeometry } from "@/lib/scene/geometry";
import { halfWidthAt, type Framing } from "@/lib/scene/quality";
import { useClock } from "./useClock";

/**
 * Satin ribbons woven through the beds.
 *
 * Geometry is a box section swept along a Catmull-Rom spline, so the fabric
 * has real thickness and its edges catch light. Motion is a travelling wave in
 * the vertex shader keyed off the `progress` attribute — the anchored end
 * stays put and the free end drifts, which reads as fabric rather than a
 * rotating solid.
 *
 * The satin itself is anisotropic: a stretched highlight running along the
 * weave is the difference between satin and shiny plastic.
 */

const ribbonUniforms = {
  uTime: { value: 0 },
  uAmplitude: { value: 0.055 },
};

function makeSatinMaterial(envIntensity: number) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#9cc4e6"),
    roughness: 0.2,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.32,
    sheenColor: new THREE.Color("#ffffff"),
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    anisotropy: 0.75,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: envIntensity,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ribbonUniforms.uTime;
    shader.uniforms.uAmplitude = ribbonUniforms.uAmplitude;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uAmplitude;
        attribute float progress;
        `,
      )
      .replace(
        "#include <project_vertex>",
        /* glsl */ `
        vec4 mvPosition = vec4( transformed, 1.0 );
        vec4 ribbonWorld = modelMatrix * mvPosition;

        // Anchored at the base, freest at the tail.
        float amp = uAmplitude * pow(progress, 1.4);
        ribbonWorld.x += sin(progress * 5.2 + uTime * 0.46) * amp;
        ribbonWorld.y += sin(progress * 3.3 + uTime * 0.38) * amp * 0.75;
        ribbonWorld.z += cos(progress * 4.1 + uTime * 0.33) * amp * 0.55;

        mvPosition = viewMatrix * ribbonWorld;
        gl_Position = projectionMatrix * mvPosition;
        `,
      );
  };
  material.customProgramCacheKey = () => "satin";
  return material;
}

interface RibbonPath {
  /** x as a fraction of the frustum half-width at that point's depth */
  points: [number, number, number][];
  side: -1 | 1;
  width: number;
  twist: number;
}

/**
 * Ribbons enter low and outside, rise through the bed, and stop well short of
 * the centre. Like the flowers, x is a fraction of the view width at that
 * depth, so the ribbons track the beds on every screen.
 */
const PATHS: RibbonPath[] = [
  {
    side: -1,
    points: [
      [1.12, -0.14, 4.9],
      [0.86, 0.18, 3.9],
      [0.98, 0.46, 2.9],
      [0.78, 0.74, 1.9],
      [0.88, 0.94, 0.9],
      [0.74, 1.08, 0.0],
    ],
    width: 0.13,
    twist: 2.4,
  },
  {
    side: -1,
    points: [
      [1.3, -0.16, 4.3],
      [1.08, 0.1, 3.3],
      [1.2, 0.34, 2.4],
      [1.0, 0.56, 1.5],
      [1.1, 0.7, 0.7],
    ],
    width: 0.085,
    twist: -1.8,
  },
  {
    side: 1,
    points: [
      [1.08, -0.14, 4.7],
      [0.82, 0.2, 3.7],
      [0.96, 0.5, 2.7],
      [0.74, 0.78, 1.7],
      [0.86, 0.98, 0.8],
      [0.72, 1.12, -0.1],
    ],
    width: 0.12,
    twist: -2.2,
  },
  {
    side: 1,
    points: [
      [1.32, -0.16, 4.1],
      [1.1, 0.12, 3.1],
      [1.22, 0.36, 2.2],
      [1.02, 0.58, 1.3],
      [1.12, 0.72, 0.5],
    ],
    width: 0.08,
    twist: 1.6,
  },
];

interface Ribbons3DProps {
  samples: number;
  framing: Framing;
  aspect: number;
  envIntensity?: number;
}

export function Ribbons3D({ samples, framing, aspect, envIntensity = 1 }: Ribbons3DProps) {
  const clock = useClock();

  const geometries = useMemo(
    () =>
      PATHS.map((path) =>
        createRibbonGeometry({
          points: path.points.map(([xFrac, y, z]) => {
            const half = halfWidthAt(framing, aspect, z);
            return new THREE.Vector3(
              path.side * xFrac * half * framing.inner * 1.35,
              y + framing.bedDrop,
              z,
            );
          }),
          samples,
          width: path.width,
          twist: path.twist,
          thickness: 0.01,
        }),
      ),
    [samples, framing, aspect],
  );

  const material = useMemo(() => makeSatinMaterial(envIntensity), [envIntensity]);

  useEffect(() => {
    const geos = geometries;
    const mat = material;
    return () => {
      geos.forEach((g) => g.dispose());
      mat.dispose();
    };
  }, [geometries, material]);

  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    ribbonUniforms.uTime.value = clock.get();
  });

  return (
    <group ref={ref}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={material} frustumCulled={false} />
      ))}
    </group>
  );
}
