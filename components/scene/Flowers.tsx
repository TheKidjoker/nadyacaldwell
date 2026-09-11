"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  createBudGeometry,
  createLeafGeometry,
  createPetalGeometry,
  createStemGeometry,
} from "@/lib/scene/geometry";
import { mulberry32 } from "@/lib/rng";
import { halfWidthAt, type Framing } from "@/lib/scene/quality";
import {
  applyFoliageShader,
  createFoliageUniforms,
  type FoliageUniforms,
} from "./foliageMaterial";
import { useClock } from "./useClock";

/**
 * The floral arrangements.
 *
 * Every flower is assembled on the CPU once: each head gets a position, a
 * tilt, a petal count and a colour, and each of its petals gets a matrix. All
 * petals of a shape then live in a single InstancedMesh, so ~900 petals cost
 * two draw calls rather than nine hundred.
 *
 * Beds sit to the left and right with an exclusion zone down the middle that
 * widens as the viewport narrows, so the name never has a flower behind it.
 */

type PetalShape = "round" | "narrow";

interface Head {
  position: THREE.Vector3;
  spin: number;
  tiltX: number;
  tiltZ: number;
  scale: number;
  petals: number;
  shape: PetalShape;
  openness: number;
  colour: THREE.Color;
  centreScale: number;
}

interface Placed {
  matrix: THREE.Matrix4;
  colour: THREE.Color;
}

interface Arrangement {
  round: Placed[];
  narrow: Placed[];
  centres: Placed[];
  stems: Placed[];
  leaves: Placed[];
  buds: Placed[];
}

const BLUES = ["#5f95d0", "#7db0de", "#4a7fbe", "#93c0e6", "#3f72b2", "#6ea6d9"];
const WHITES = ["#ffffff", "#f4f9fe", "#e9f2fb", "#fbfdff"];
const GREENS = ["#87a88f", "#76997f", "#9bb59f", "#6b8d74"];

interface ArrangementOptions {
  seed: number;
  count: number;
  scatter: number;
  fringe: number;
  framing: Framing;
  aspect: number;
}

function buildArrangement(o: ArrangementOptions): Arrangement {
  const rnd = mulberry32(o.seed);
  const R = (a: number, b: number) => a + rnd() * (b - a);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

  const heads: Head[] = [];
  const stems: Placed[] = [];
  const leaves: Placed[] = [];
  const buds: Placed[] = [];

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  const addStem = (base: THREE.Vector3, height: number, spin: number, thick: number) => {
    e.set(0, spin, 0);
    q.setFromEuler(e);
    s.set(thick, height, thick);
    stems.push({
      matrix: new THREE.Matrix4().compose(base, q, s),
      colour: new THREE.Color(pick(GREENS)),
    });
  };

  const addLeaf = (base: THREE.Vector3, height: number) => {
    const n = rnd() < 0.65 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const t = R(0.18, 0.55);
      v.set(base.x + R(-0.02, 0.02), base.y + height * t, base.z + R(-0.02, 0.02));
      e.set(R(0.5, 1.1), R(0, Math.PI * 2), R(-0.25, 0.25));
      q.setFromEuler(e);
      const size = R(0.08, 0.17);
      s.set(size, size * R(1.5, 2.4), size);
      leaves.push({
        matrix: new THREE.Matrix4().compose(v.clone(), q, s),
        colour: new THREE.Color(pick(GREENS)),
      });
    }
  };

  const makeHead = (pos: THREE.Vector3, scale: number, shape: PetalShape, colour: string) => {
    heads.push({
      position: pos.clone(),
      spin: R(0, Math.PI * 2),
      tiltX: R(-0.5, -0.05),
      tiltZ: R(-0.3, 0.3),
      scale,
      petals: shape === "round" ? Math.round(R(5, 6)) : Math.round(R(8, 11)),
      shape,
      openness: shape === "round" ? R(0.55, 0.95) : R(1.0, 1.35),
      colour: new THREE.Color(colour),
      centreScale: shape === "round" ? 0.3 : 0.24,
    });
  };

  /** One plant: stem, leaves, and either a single head or a floret spike. */
  const grow = (base: THREE.Vector3, vigour: number) => {
    const kind = rnd();
    const height = R(0.3, 0.82) * vigour;
    const spin = R(0, Math.PI * 2);
    addStem(base, height, spin, R(0.5, 0.85));
    addLeaf(base, height);

    const tip = new THREE.Vector3(base.x, base.y + height, base.z);

    if (kind < 0.34) {
      // Delphinium: a tapering spike of florets up the top half of the stem.
      const florets = Math.round(R(5, 9));
      const colour = rnd() < 0.72 ? pick(BLUES) : pick(WHITES);
      for (let i = 0; i < florets; i++) {
        const t = i / florets;
        const y = base.y + height * (0.5 + t * 0.5);
        const taper = 1 - t * 0.62;
        v.set(base.x + R(-0.05, 0.05) * taper, y, base.z + R(-0.05, 0.05) * taper);
        if (t > 0.72) {
          e.set(R(-0.3, 0.3), R(0, 6.28), R(-0.3, 0.3));
          q.setFromEuler(e);
          const bs = R(0.03, 0.05) * taper;
          s.set(bs, bs, bs);
          buds.push({
            matrix: new THREE.Matrix4().compose(v.clone(), q, s),
            colour: new THREE.Color(colour),
          });
        } else {
          makeHead(v, R(0.055, 0.085) * taper, "round", colour);
        }
      }
    } else if (kind < 0.72) {
      // Forget-me-not umbel.
      const florets = Math.round(R(3, 7));
      const colour = rnd() < 0.78 ? pick(BLUES) : pick(WHITES);
      for (let i = 0; i < florets; i++) {
        const a = (i / florets) * Math.PI * 2 + R(-0.5, 0.5);
        const r = R(0.03, 0.1);
        v.set(tip.x + Math.cos(a) * r, tip.y + R(-0.03, 0.04), tip.z + Math.sin(a) * r);
        makeHead(v, R(0.06, 0.095), "round", colour);
      }
    } else {
      // A single open wildflower.
      makeHead(tip, R(0.1, 0.16), "narrow", rnd() < 0.76 ? pick(WHITES) : pick(BLUES));
    }
  };

  // Two beds, mirrored. Positions are chosen against the frustum width at each
  // flower's own depth, so the clear centre column holds at any aspect ratio.
  const [zNear, zFar] = o.framing.bedZ;
  for (const side of [-1, 1]) {
    for (let i = 0; i < o.count; i++) {
      const z = R(zNear, zFar);
      const half = halfWidthAt(o.framing, o.aspect, z);
      const x = side * R(half * o.framing.inner, half * o.framing.outer);
      const base = new THREE.Vector3(x, o.framing.bedDrop + R(-0.04, 0.02), z);
      // Flowers near the camera are cropped by the bottom edge, so they can
      // afford to be taller.
      const near = THREE.MathUtils.clamp((z - zNear) / (zFar - zNear), 0, 1);
      grow(base, R(0.78, 1.15) * (1 + near * 0.22));
    }
  }

  // A low fringe running the full width at the very front. It sits below the
  // typography, so it can cross the centre line where the beds cannot — which
  // is what keeps the shoreline from reading as a bare slab.
  for (let i = 0; i < o.fringe; i++) {
    const z = R(zFar - 0.3, zFar + 0.2);
    const half = halfWidthAt(o.framing, o.aspect, z);
    const x = R(-half * 1.3, half * 1.3);
    const base = new THREE.Vector3(x, o.framing.bedDrop + R(-0.05, 0), z);
    grow(base, R(0.32, 0.56));
  }

  // A thinner scatter very close to the camera, for foreground depth.
  for (let i = 0; i < o.scatter; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const z = R(zFar - (zFar - zNear) * 0.28, zFar);
    const half = halfWidthAt(o.framing, o.aspect, z);
    const x = side * R(half * o.framing.inner * 0.82, half * o.framing.outer);
    const base = new THREE.Vector3(x, o.framing.bedDrop + R(-0.06, 0.0), z);
    grow(base, R(0.6, 0.95));
  }

  // Expand every head into petal instances.
  const round: Placed[] = [];
  const narrow: Placed[] = [];
  const centres: Placed[] = [];

  const headMatrix = new THREE.Matrix4();
  const petalMatrix = new THREE.Matrix4();
  const spinMatrix = new THREE.Matrix4();
  const tiltMatrix = new THREE.Matrix4();

  for (const head of heads) {
    e.set(head.tiltX, head.spin, head.tiltZ);
    q.setFromEuler(e);
    s.set(head.scale, head.scale, head.scale);
    headMatrix.compose(head.position, q, s);

    const target = head.shape === "round" ? round : narrow;
    for (let i = 0; i < head.petals; i++) {
      const theta = (i / head.petals) * Math.PI * 2 + (head.spin % 1);
      spinMatrix.makeRotationY(theta);
      tiltMatrix.makeRotationX(head.openness + (i % 2) * 0.06);
      petalMatrix.copy(headMatrix).multiply(spinMatrix).multiply(tiltMatrix);
      target.push({ matrix: petalMatrix.clone(), colour: head.colour });
    }

    const cs = head.scale * head.centreScale;
    centres.push({
      matrix: new THREE.Matrix4().compose(
        head.position,
        q,
        new THREE.Vector3(cs, cs * 0.7, cs),
      ),
      colour: new THREE.Color("#f7d98f"),
    });
  }

  return { round, narrow, centres, stems, leaves, buds };
}

function InstancedGroup({
  geometry,
  items,
  material,
  receiveShadow,
}: {
  geometry: THREE.BufferGeometry;
  items: Placed[];
  material: THREE.Material;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < items.length; i++) {
      mesh.setMatrixAt(i, items[i].matrix);
      mesh.setColorAt(i, items[i].colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  );
}

interface FlowersProps {
  count: number;
  scatter: number;
  fringe: number;
  framing: Framing;
  aspect: number;
  sunDirection: THREE.Vector3;
  translucency?: number;
  sheen?: number;
}

export function Flowers({
  count,
  scatter,
  fringe,
  framing,
  aspect,
  sunDirection,
  translucency = 0.55,
  sheen = 1,
}: FlowersProps) {
  const clock = useClock();
  const { camera } = useThree();

  const arrangement = useMemo(
    () => buildArrangement({ seed: 20260911, count, scatter, fringe, framing, aspect }),
    [count, scatter, fringe, framing, aspect],
  );

  const geometries = useMemo(
    () => ({
      round: createPetalGeometry({
        segU: 16,
        segV: 9,
        length: 0.86,
        width: 0.5,
        cup: 0.08,
        bend: 0.12,
        fullness: 2.2,
      }),
      narrow: createPetalGeometry({
        segU: 16,
        segV: 7,
        length: 1.2,
        width: 0.26,
        cup: 0.15,
        bend: 0.38,
        fullness: 0.85,
      }),
      centre: new THREE.SphereGeometry(1, 10, 8),
      stem: createStemGeometry(),
      leaf: createLeafGeometry(),
      bud: createBudGeometry(),
    }),
    [],
  );

  const uniforms = useMemo<FoliageUniforms>(
    () => createFoliageUniforms(0.014, translucency),
    [translucency],
  );

  const materials = useMemo(() => {
    // Sheen is what separates a petal from a plastic chip, but it is a
    // physical-material feature and costs a little; weak devices go without.
    const petal = applyFoliageShader(
      sheen > 0
        ? new THREE.MeshPhysicalMaterial({
            roughness: 0.62,
            metalness: 0,
            side: THREE.DoubleSide,
            sheen,
            sheenRoughness: 0.55,
            sheenColor: new THREE.Color("#ffffff"),
          })
        : new THREE.MeshStandardMaterial({
            roughness: 0.66,
            metalness: 0,
            side: THREE.DoubleSide,
          }),
      uniforms,
    );
    const centre = applyFoliageShader(
      new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 }),
      uniforms,
    );
    const green = applyFoliageShader(
      new THREE.MeshStandardMaterial({
        roughness: 0.78,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      uniforms,
    );
    return { petal, centre, green };
  }, [uniforms, sheen]);

  useEffect(() => {
    const geos = geometries;
    const mats = materials;
    return () => {
      Object.values(geos).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geometries, materials]);

  const sunView = useRef(new THREE.Vector3());

  useFrame(() => {
    uniforms.uTime.value = clock.get();
    // The translucency term works in view space, so the sun has to follow.
    sunView.current.copy(sunDirection).transformDirection(camera.matrixWorldInverse);
    uniforms.uSunDirView.value.copy(sunView.current);
  });

  return (
    <group>
      <InstancedGroup
        geometry={geometries.stem}
        items={arrangement.stems}
        material={materials.green}
      />
      <InstancedGroup
        geometry={geometries.leaf}
        items={arrangement.leaves}
        material={materials.green}
      />
      <InstancedGroup
        geometry={geometries.round}
        items={arrangement.round}
        material={materials.petal}
      />
      <InstancedGroup
        geometry={geometries.narrow}
        items={arrangement.narrow}
        material={materials.petal}
      />
      <InstancedGroup
        geometry={geometries.bud}
        items={arrangement.buds}
        material={materials.petal}
      />
      <InstancedGroup
        geometry={geometries.centre}
        items={arrangement.centres}
        material={materials.centre}
      />
    </group>
  );
}
