import * as THREE from "three";

/**
 * Shared material for everything that grows.
 *
 * Two additions to the standard PBR material:
 *
 * 1. A coastal breeze. `project_vertex` is replaced so the sway is applied in
 *    world space after the instance matrix — displacing the local position
 *    instead would send every petal in a different direction, because each one
 *    carries its own rotation. Amplitude scales with height, so stems bend and
 *    the ground stays put.
 *
 * 2. Light transmission through thin petals. A wrap term lets the sun bleed
 *    through surfaces facing away from it, which is what gives a real petal its
 *    glow at the edges. Cheaper than true `transmission`, which would force a
 *    separate render pass per frame for hundreds of instances.
 */

export interface FoliageUniforms {
  uTime: { value: number };
  uSway: { value: number };
  uSunDirView: { value: THREE.Vector3 };
  uTranslucency: { value: number };
  uTranslucencyColour: { value: THREE.Color };
}

export function createFoliageUniforms(sway: number, translucency: number): FoliageUniforms {
  return {
    uTime: { value: 0 },
    uSway: { value: sway },
    uSunDirView: { value: new THREE.Vector3(0, 0, 1) },
    uTranslucency: { value: translucency },
    uTranslucencyColour: { value: new THREE.Color("#ffe9c4") },
  };
}

export function applyFoliageShader(
  material: THREE.MeshStandardMaterial,
  uniforms: FoliageUniforms,
) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uSway;
        `,
      )
      .replace(
        "#include <project_vertex>",
        /* glsl */ `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 swayWorld = modelMatrix * mvPosition;

        // Taller things move more; the base is pinned.
        float swayH = clamp(swayWorld.y / 1.5, 0.0, 1.0);
        float swayAmp = uSway * pow(swayH, 1.7);
        float swayPhase = swayWorld.x * 0.55 + swayWorld.z * 0.8;
        swayWorld.x += sin(uTime * 0.52 + swayPhase) * swayAmp;
        swayWorld.z += sin(uTime * 0.39 + swayPhase * 1.37) * swayAmp * 0.62;

        mvPosition = viewMatrix * swayWorld;
        gl_Position = projectionMatrix * mvPosition;
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform vec3 uSunDirView;
        uniform float uTranslucency;
        uniform vec3 uTranslucencyColour;
        `,
      )
      .replace(
        "#include <lights_fragment_end>",
        /* glsl */ `
        #include <lights_fragment_end>
        // Wrap-around transmission: light bleeding through the back of a petal.
        float backLit = max(dot(normalize(-normal), normalize(uSunDirView)), 0.0);
        reflectedLight.directDiffuse +=
          uTranslucencyColour * uTranslucency * pow(backLit, 1.7) * diffuseColor.rgb;
        `,
      );
  };
  material.customProgramCacheKey = () => "foliage";
  return material;
}
