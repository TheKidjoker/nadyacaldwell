import * as THREE from "three";

/**
 * Procedural geometry for the scene.
 *
 * Every petal, leaf, stem and ribbon is generated here rather than loaded from
 * a model file. That keeps the arrangement genuinely custom (and varied per
 * flower) while shipping no asset bytes at all — there is nothing to Draco- or
 * KTX2-compress because nothing is downloaded.
 *
 * All shapes are built around the origin with +Y as "up the stem", so an
 * instance matrix only has to place and rotate them.
 */

export interface PetalOptions {
  segU?: number;
  segV?: number;
  length?: number;
  width?: number;
  /** how much the petal cups along its width */
  cup?: number;
  /** how far the petal bends back along its length */
  bend?: number;
  /** extra curl at the very tip */
  tipCurl?: number;
  /** <1 gives a narrow, pointed petal; >1 a broad, rounded one */
  fullness?: number;
}

/**
 * A single petal as a curved parametric surface.
 *
 * u runs base→tip, v runs edge→edge. The width profile is a sine lobe so the
 * petal narrows at the base, swells through the middle and rounds off at the
 * tip; `cup` lifts the two edges, `bend` arcs the whole petal backwards.
 */
export function createPetalGeometry(o: PetalOptions = {}): THREE.BufferGeometry {
  const segU = o.segU ?? 14;
  const segV = o.segV ?? 7;
  const length = o.length ?? 1;
  const width = o.width ?? 0.42;
  const cup = o.cup ?? 0.3;
  const bend = o.bend ?? 0.55;
  const tipCurl = o.tipCurl ?? 0.12;
  const fullness = o.fullness ?? 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU;
    // Arc the spine backwards; quadratic so the base stays put.
    const ang = bend * u * u;
    const spineY = length * u * Math.cos(ang);
    const spineZ = -length * u * Math.sin(ang);
    const halfWidth = width * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 1 / fullness);

    for (let iv = 0; iv <= segV; iv++) {
      const v = (iv / segV) * 2 - 1;
      const x = v * halfWidth;
      const z = spineZ + cup * v * v * halfWidth * 2.2 + tipCurl * Math.pow(u, 3);
      positions.push(x, spineY, z);
      uvs.push((v + 1) * 0.5, u);
    }
  }

  const row = segV + 1;
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = iu * row + iv;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** A leaf: longer and narrower than a petal, with a central crease. */
export function createLeafGeometry(
  o: { segU?: number; segV?: number; length?: number; width?: number; droop?: number } = {},
): THREE.BufferGeometry {
  const segU = o.segU ?? 12;
  const segV = o.segV ?? 5;
  const length = o.length ?? 1;
  const width = o.width ?? 0.2;
  const droop = o.droop ?? 0.35;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU;
    const ang = droop * u * u;
    const spineY = length * u * Math.cos(ang);
    const spineZ = -length * u * Math.sin(ang);
    // Pointed at both ends, widest around a third of the way up.
    const halfWidth = width * Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 - 0.25 * u);

    for (let iv = 0; iv <= segV; iv++) {
      const v = (iv / segV) * 2 - 1;
      const x = v * halfWidth;
      // Crease: the midrib sits proud, the blade falls away to the edges.
      const z = spineZ - (1 - Math.abs(v)) * halfWidth * 0.45;
      positions.push(x, spineY, z);
      uvs.push((v + 1) * 0.5, u);
    }
  }

  const row = segV + 1;
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = iu * row + iv;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** A slightly curved, tapering stem. Unit height, so instances scale in Y. */
export function createStemGeometry(
  o: { curve?: number; radius?: number; segments?: number; radial?: number } = {},
): THREE.BufferGeometry {
  const curve = o.curve ?? 0.09;
  const radius = o.radius ?? 0.012;
  const segments = o.segments ?? 10;
  const radial = o.radial ?? 5;

  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(curve * 0.25, 0.33, curve * 0.14),
    new THREE.Vector3(curve * 0.7, 0.67, curve * 0.3),
    new THREE.Vector3(curve, 1, curve * 0.45),
  ]);

  const g = new THREE.TubeGeometry(path, segments, radius, radial, false);
  // Taper towards the tip.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const center = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y, 0, 1);
    const scale = 1 - t * 0.45;
    const p = path.getPointAt(THREE.MathUtils.clamp(t, 0, 1), center);
    pos.setX(i, p.x + (pos.getX(i) - p.x) * scale);
    pos.setZ(i, p.z + (pos.getZ(i) - p.z) * scale);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A small teardrop bud. */
export function createBudGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 10, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Pinch the top into a point, keep the base round.
    const pinch = THREE.MathUtils.lerp(1, 0.35, THREE.MathUtils.smoothstep(y, -0.1, 1));
    pos.setX(i, pos.getX(i) * pinch * 0.7);
    pos.setZ(i, pos.getZ(i) * pinch * 0.7);
    pos.setY(i, y * 1.25 + 1);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export interface RibbonOptions {
  points: THREE.Vector3[];
  samples?: number;
  width?: number;
  thickness?: number;
  /** total twist along the ribbon, in radians */
  twist?: number;
  /** width multiplier at the two ends, for a tapered tail */
  taper?: [number, number];
}

/**
 * A ribbon swept along a spline.
 *
 * Builds a closed box section (top, bottom and two edges) so the fabric has
 * real thickness and its edges catch the light. A `progress` attribute runs
 * 0→1 along the length, which the vertex shader uses to animate the fabric.
 */
export function createRibbonGeometry(o: RibbonOptions): THREE.BufferGeometry {
  const samples = o.samples ?? 120;
  const width = o.width ?? 0.28;
  const thickness = o.thickness ?? 0.012;
  const twist = o.twist ?? 1.2;
  const taper = o.taper ?? [0.35, 0.2];

  const curve = new THREE.CatmullRomCurve3(o.points, false, "catmullrom", 0.5);
  const frames = curve.computeFrenetFrames(samples, false);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const progress: number[] = [];
  const indices: number[] = [];

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const corner = new THREE.Vector3();

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    curve.getPointAt(t, p);
    n.copy(frames.normals[Math.min(i, samples - 1)]);
    b.copy(frames.binormals[Math.min(i, samples - 1)]);

    // Taper the ends so the ribbon reads as cut fabric, not a cut-off tube.
    const ends = Math.min(
      THREE.MathUtils.smoothstep(t, 0, taper[0]),
      THREE.MathUtils.smoothstep(1 - t, 0, taper[1]),
    );
    const w = (width * (0.45 + 0.55 * ends)) / 2;
    const th = thickness / 2;

    const ang = twist * t;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // Rotate the section frame about the tangent to twist the fabric.
    const ex = b.clone().multiplyScalar(ca).addScaledVector(n, sa);
    const ey = n.clone().multiplyScalar(ca).addScaledVector(b, -sa);

    // 4 corners: +w/+th, -w/+th, -w/-th, +w/-th
    const signs: Array<[number, number]> = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (const [sw, st] of signs) {
      corner.copy(p).addScaledVector(ex, sw * w).addScaledVector(ey, st * th);
      positions.push(corner.x, corner.y, corner.z);
      const nrm = ey.clone().multiplyScalar(st).normalize();
      normals.push(nrm.x, nrm.y, nrm.z);
      uvs.push((sw + 1) * 0.5, t);
      progress.push(t);
    }
  }

  for (let i = 0; i < samples; i++) {
    const a = i * 4;
    const c = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      indices.push(a + k, c + k, a + k2, a + k2, c + k, c + k2);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("progress", new THREE.Float32BufferAttribute(progress, 1));
  g.setIndex(indices);
  g.computeVertexNormals();
  // Anisotropic satin needs real tangents. Without them three derives them from
  // screen-space derivatives, which goes NaN on a swept section and punches
  // black pixels along the ribbon.
  g.computeTangents();
  return g;
}

/** Ridge line for the distant coast, deformed by layered value noise. */
export function createRidgeGeometry(
  width: number,
  height: number,
  segments: number,
  seed: number,
  roughness: number,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height, segments, 12);
  const pos = g.attributes.position as THREE.BufferAttribute;

  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return THREE.MathUtils.lerp(hash(i), hash(i + 1), u);
  };
  const fbm = (x: number) => {
    let v = 0;
    let a = 0.5;
    let f = 1;
    for (let o = 0; o < 5; o++) {
      v += a * noise(x * f);
      f *= 2.07;
      a *= 0.52;
    }
    return v;
  };

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Only lift the top edge; the bottom stays flat on the waterline.
    const top = THREE.MathUtils.clamp((y + height / 2) / height, 0, 1);
    const ridge = (fbm(x * roughness) - 0.35) * height * 0.9;
    pos.setY(i, y + ridge * top);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
