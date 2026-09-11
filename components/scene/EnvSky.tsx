"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { SKY_GLSL } from "./Ocean";

/**
 * The sky, rendered once into a cube map to light the scene.
 *
 * This is why there is no HDRI to download: the same gradient-and-sun function
 * that paints the dome also provides the image-based lighting, so the blue fill
 * on the petals and the warm rim on the satin are physically consistent with
 * the sky you can actually see behind them.
 */
export function EnvSky({ sunDirection }: { sunDirection: THREE.Vector3 }) {
  const uniforms = useMemo(
    () => ({
      uSunDir: { value: sunDirection.clone() },
      uSunColour: { value: new THREE.Color("#fff3da") },
    }),
    [sunDirection],
  );

  return (
    <mesh scale={80}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uSunDir;
          uniform vec3 uSunColour;
          varying vec3 vDir;
          ${SKY_GLSL}
          void main() {
            vec3 dir = normalize(vDir);
            vec3 colour = skyColour(dir, uSunDir, uSunColour);
            // Sea bounce below the horizon, so undersides pick up cool light.
            colour = mix(vec3(0.36, 0.52, 0.66), colour, smoothstep(-0.35, 0.05, dir.y));
            gl_FragColor = vec4(colour, 1.0);
          }
        `}
      />
    </mesh>
  );
}
