"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useClock } from "./useClock";

/**
 * Custom ocean.
 *
 * Surface height is the sum of four directional waves; because they are plain
 * sines their slope is known analytically, so the normal is exact rather than
 * finite-differenced. Two layers of higher-frequency ripple are folded into
 * the normal in the fragment stage to keep the surface from reading as smooth
 * jelly at close range.
 *
 * Colour is depth-graded (shallow turquoise → deep blue) and mixed against a
 * Fresnel-weighted sky reflection, with a Blinn-Phong sun specular on top for
 * the glitter path. The far edge dissolves into the horizon haze so the plane
 * never shows a hard cut.
 */

export const SKY_GLSL = /* glsl */ `
  vec3 skyColour(vec3 dir, vec3 sunDir, vec3 sunColour) {
    float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizon = vec3(0.729, 0.843, 0.929);
    vec3 zenith  = vec3(0.220, 0.451, 0.765);
    vec3 base = mix(horizon, zenith, pow(clamp(dir.y, 0.0, 1.0), 0.62));
    // Warm bloom around the sun, and a wide warm wash near the horizon.
    float sun = pow(max(dot(dir, sunDir), 0.0), 90.0);
    float halo = pow(max(dot(dir, sunDir), 0.0), 5.0);
    base += sunColour * sun * 1.6;
    base += vec3(1.0, 0.93, 0.80) * halo * 0.16;
    base = mix(base, vec3(1.0, 0.973, 0.925), (1.0 - t) * 0.14);
    return base;
  }
`;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec4 uAmp;
  uniform vec4 uFreq;
  uniform vec4 uSpeed;
  uniform vec2 uDir0;
  uniform vec2 uDir1;
  uniform vec2 uDir2;
  uniform vec2 uDir3;

  varying vec3 vWorld;
  varying vec3 vNormal2;
  varying float vDist;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);

    vec2 p = world.xz;
    float h = 0.0;
    float dhdx = 0.0;
    float dhdz = 0.0;

    // Wave 0
    float ph0 = dot(uDir0, p) * uFreq.x + uTime * uSpeed.x;
    h += sin(ph0) * uAmp.x;
    dhdx += cos(ph0) * uAmp.x * uFreq.x * uDir0.x;
    dhdz += cos(ph0) * uAmp.x * uFreq.x * uDir0.y;

    float ph1 = dot(uDir1, p) * uFreq.y + uTime * uSpeed.y;
    h += sin(ph1) * uAmp.y;
    dhdx += cos(ph1) * uAmp.y * uFreq.y * uDir1.x;
    dhdz += cos(ph1) * uAmp.y * uFreq.y * uDir1.y;

    float ph2 = dot(uDir2, p) * uFreq.z + uTime * uSpeed.z;
    h += sin(ph2) * uAmp.z;
    dhdx += cos(ph2) * uAmp.z * uFreq.z * uDir2.x;
    dhdz += cos(ph2) * uAmp.z * uFreq.z * uDir2.y;

    float ph3 = dot(uDir3, p) * uFreq.w + uTime * uSpeed.w;
    h += sin(ph3) * uAmp.w;
    dhdx += cos(ph3) * uAmp.w * uFreq.w * uDir3.x;
    dhdz += cos(ph3) * uAmp.w * uFreq.w * uDir3.y;

    // Flatten the swell towards the horizon so distant water stays calm.
    float fade = 1.0 - smoothstep(40.0, 260.0, length(p));
    world.y += h * fade;

    vNormal2 = normalize(vec3(-dhdx * fade, 1.0, -dhdz * fade));
    vWorld = world.xyz;
    vDist = length(world.xyz - cameraPosition);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColour;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uHorizon;
  uniform float uRipple;

  varying vec3 vWorld;
  varying vec3 vNormal2;
  varying float vDist;

  ${SKY_GLSL}

  // Cheap, stable ripple normal — two rotated sine lattices beat a noise
  // texture here because there is no texture to download.
  vec3 rippleNormal(vec2 p, float t) {
    vec2 a = p * 3.1;
    vec2 b = p * 7.3 + 11.0;
    float n1x = cos(a.x * 1.3 + t * 0.9) * 0.5 + cos(a.y * 0.7 - t * 0.6) * 0.3;
    float n1z = sin(a.y * 1.1 - t * 0.8) * 0.5 + sin(a.x * 0.9 + t * 0.5) * 0.3;
    float n2x = cos(b.x * 0.9 - t * 1.4) * 0.22;
    float n2z = sin(b.y * 1.2 + t * 1.1) * 0.22;
    return normalize(vec3((n1x + n2x) * uRipple, 1.0, (n1z + n2z) * uRipple));
  }

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);

    // Ripples fade out with distance or they alias into noise.
    float detail = 1.0 - smoothstep(6.0, 90.0, vDist);
    vec3 rip = rippleNormal(vWorld.xz, uTime);
    vec3 n = normalize(mix(vNormal2, normalize(vNormal2 + rip * 0.55), detail));

    float ndv = clamp(dot(n, view), 0.0, 1.0);
    // Capped below 1 so the water body never fully vanishes into sky at
    // grazing angles — that is what makes a flat sea read as white fog.
    float fresnel = 0.03 + 0.60 * pow(1.0 - ndv, 3.4);

    // Depth grading: glancing angles look deep, steep angles look shallow.
    vec3 body = mix(uDeep, uShallow, pow(ndv, 1.4));

    // Stand-in for refraction: the body colour is nudged by the surface normal,
    // so what you see "through" the water shifts with the ripples.
    body += vec3(0.02, 0.05, 0.07) * (n.x + n.z) * detail;

    vec3 reflDir = reflect(-view, n);
    reflDir.y = abs(reflDir.y);
    vec3 reflection = skyColour(reflDir, uSunDir, uSunColour);

    vec3 colour = mix(body, reflection, fresnel);

    // Sun glitter.
    vec3 halfVec = normalize(uSunDir + view);
    float spec = pow(max(dot(n, halfVec), 0.0), 420.0);
    colour += uSunColour * spec * 3.4;
    float sheen = pow(max(dot(n, halfVec), 0.0), 26.0);
    colour += uSunColour * sheen * 0.12;

    // Dissolve into the horizon haze.
    float haze = smoothstep(150.0, 520.0, vDist);
    colour = mix(colour, uHorizon, haze);

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface OceanProps {
  segments: number;
  sunDirection: THREE.Vector3;
}

export function Ocean({ segments, sunDirection }: OceanProps) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const clock = useClock();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: sunDirection.clone() },
      uSunColour: { value: new THREE.Color("#fff0d2") },
      uShallow: { value: new THREE.Color("#4d9ecb") },
      uDeep: { value: new THREE.Color("#16466f") },
      uHorizon: { value: new THREE.Color("#c2dcef") },
      uRipple: { value: 0.06 },
      uAmp: { value: new THREE.Vector4(0.055, 0.035, 0.018, 0.009) },
      uFreq: { value: new THREE.Vector4(0.42, 0.78, 1.6, 3.1) },
      uSpeed: { value: new THREE.Vector4(0.55, 0.78, 1.15, 1.7) },
      uDir0: { value: new THREE.Vector2(1, 0.28).normalize() },
      uDir1: { value: new THREE.Vector2(0.72, -0.69).normalize() },
      uDir2: { value: new THREE.Vector2(-0.42, 0.91).normalize() },
      uDir3: { value: new THREE.Vector2(0.94, 0.34).normalize() },
    }),
    [sunDirection],
  );

  useFrame(() => {
    if (!material.current) return;
    material.current.uniforms.uTime.value = clock.get();
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -140]} frustumCulled={false}>
      <planeGeometry args={[900, 620, segments, Math.max(8, Math.round(segments * 0.5))]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
