"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { SKY_GLSL } from "./Ocean";
import { useClock } from "./useClock";

/**
 * Sky dome with drifting cloud banks.
 *
 * Clouds are fractal noise evaluated in the fragment shader rather than
 * billboards or a texture: they drift and evolve over minutes, never tile, and
 * cost nothing to download. Density is biased towards the upper sky and thins
 * out at the horizon so the cloud layer reads as depth rather than wallpaper.
 */

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColour;
  uniform float uCloudAmount;

  varying vec3 vDir;

  ${SKY_GLSL}

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * valueNoise(p);
      p *= 2.03;
      a *= 0.52;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    vec3 colour = skyColour(dir, uSunDir, uSunColour);

    // Project onto a dome plane so clouds compress towards the horizon.
    float h = max(dir.y, 0.02);
    vec2 uv = dir.xz / h;

    float drift = uTime * 0.004;
    float shape = fbm(uv * 0.55 + vec2(drift, drift * 0.35));
    float detail = fbm(uv * 1.7 - vec2(drift * 1.6, drift * 0.5));
    float density = smoothstep(0.48, 0.92, shape * 0.75 + detail * 0.35);

    // Keep the horizon clear and fade clouds out directly overhead.
    density *= smoothstep(0.02, 0.24, dir.y);
    density *= uCloudAmount;

    // Light the cloud: bright rim towards the sun, cool shadowed body.
    float toSun = max(dot(dir, uSunDir), 0.0);
    vec3 lit = mix(vec3(0.83, 0.88, 0.94), vec3(1.0, 0.99, 0.96), pow(toSun, 2.0));
    lit += uSunColour * pow(toSun, 8.0) * 0.35;

    colour = mix(colour, lit, density * 0.92);

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface SkyDomeProps {
  sunDirection: THREE.Vector3;
  cloudAmount?: number;
}

export function SkyDome({ sunDirection, cloudAmount = 1 }: SkyDomeProps) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const clock = useClock();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: sunDirection.clone() },
      uSunColour: { value: new THREE.Color("#fff2d8") },
      uCloudAmount: { value: cloudAmount },
    }),
    [sunDirection, cloudAmount],
  );

  useFrame(() => {
    if (material.current) material.current.uniforms.uTime.value = clock.get();
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[600, 32, 20]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
