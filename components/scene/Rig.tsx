"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { Framing } from "@/lib/scene/quality";

/**
 * Camera rig.
 *
 * The composition is fixed — there are no orbit controls, so a visitor can
 * never rotate away from the intended framing. Desktop pointers add a few
 * hundredths of a unit of drift that eases back to rest, which is enough to
 * make the scene feel dimensional without ever becoming a control surface.
 */
export function Rig({ framing, parallax }: { framing: Framing; parallax: number }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector2(0, 0));
  const current = useRef(new THREE.Vector2(0, 0));
  const base = useRef(new THREE.Vector3(...framing.position));
  const look = useRef(new THREE.Vector3(...framing.target));

  useEffect(() => {
    base.current.set(...framing.position);
    look.current.set(...framing.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = framing.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(base.current);
    camera.lookAt(look.current);
  }, [camera, framing]);

  useEffect(() => {
    if (parallax <= 0) {
      target.current.set(0, 0);
      return;
    }
    const onMove = (event: PointerEvent) => {
      target.current.set(
        (event.clientX / window.innerWidth - 0.5) * 2,
        (event.clientY / window.innerHeight - 0.5) * 2,
      );
    };
    const onLeave = () => target.current.set(0, 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [parallax]);

  useFrame(() => {
    // Ease toward the pointer, and back to centre whenever it stops.
    current.current.lerp(target.current, 0.035);
    camera.position.set(
      base.current.x + current.current.x * parallax,
      base.current.y - current.current.y * parallax * 0.55,
      base.current.z,
    );
    camera.lookAt(look.current);
  });

  return null;
}
