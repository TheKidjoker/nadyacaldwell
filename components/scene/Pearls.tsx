"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { mulberry32 } from "@/lib/rng";
import { halfWidthAt, type Framing } from "@/lib/scene/quality";

/**
 * Glass beads and dew drops caught among the flowers.
 *
 * On capable hardware these use real transmission, so they refract the scene
 * behind them. Transmission costs an extra render target pass, so the count is
 * deliberately small and weaker devices fall back to a polished dielectric
 * that reads almost the same at this size for a fraction of the cost.
 */

interface PearlsProps {
  count: number;
  framing: Framing;
  aspect: number;
  transmission: boolean;
}

export function Pearls({ count, framing, aspect, transmission }: PearlsProps) {
  const placements = useMemo(() => {
    const rnd = mulberry32(77213);
    const R = (a: number, b: number) => a + rnd() * (b - a);
    return Array.from({ length: count }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const z = R(framing.bedZ[1] * 0.45, framing.bedZ[1] * 0.92);
      const half = halfWidthAt(framing, aspect, z);
      return {
        position: [
          side * R(half * framing.inner * 1.05, half * framing.outer * 0.92),
          framing.bedDrop + R(0.12, 0.8),
          z,
        ] as [number, number, number],
        radius: R(0.016, 0.034),
      };
    });
  }, [count, framing, aspect]);

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);

  const material = useMemo(() => {
    if (transmission) {
      return new THREE.MeshPhysicalMaterial({
        transmission: 1,
        thickness: 0.32,
        ior: 1.46,
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        color: new THREE.Color("#eef6fd"),
        attenuationColor: new THREE.Color("#bfdcf2"),
        attenuationDistance: 0.6,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#e8f3fc"),
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 2.2,
      opacity: 0.86,
      transparent: true,
    });
  }, [transmission]);

  useEffect(() => {
    const g = geometry;
    const m = material;
    return () => {
      g.dispose();
      m.dispose();
    };
  }, [geometry, material]);

  return (
    <group>
      {placements.map((p, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          position={p.position}
          scale={p.radius}
        />
      ))}
    </group>
  );
}
