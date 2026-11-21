import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAX_SCRAP, type LineId, type ScrapKind } from '@/content/garage';
import type { Physics } from '../physics';
import { GARAGE_LAYER } from './perf';

/** One physical piece of scrap riding the factory. */
export interface Scrap {
  body: RAPIER.RigidBody;
  kind: ScrapKind;
  line: LineId;
  value: number;
  /** Upgrader effects applied so far. */
  painted: boolean;
  gold: boolean;
  wrapped: boolean;
  hat: boolean;
  /** Gate ids already passed (each gate applies once). */
  gates: Set<string>;
  color: THREE.Color;
  /** Seconds spent lying on the floor (off the belt). */
  offT: number;
  dented: boolean;
  age: number;
  /** Has come to rest high up on something (tower bookkeeping). */
  towered?: boolean;
}

interface KindSpec {
  geo: () => THREE.BufferGeometry;
  collider: (R: typeof RAPIER) => RAPIER.ColliderDesc;
  /** Half extents (for the shrink-wrap overlay and the hat). */
  half: [number, number, number];
  color: string;
  density: number;
}

/** Give every vertex of a geometry one colour (multiplied by the per-instance colour). */
function tint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => mergeGeometries(parts, false)!;

export const SCRAP: Record<ScrapKind, KindSpec> = {
  cap: {
    geo: () => {
      const top = tint(new THREE.CylinderGeometry(0.06, 0.062, 0.022, 18), '#ffffff');
      const ridge = tint(new THREE.TorusGeometry(0.06, 0.006, 4, 18).rotateX(Math.PI / 2).translate(0, -0.008, 0), '#dddddd');
      return merge([top, ridge]);
    },
    collider: (R) => R.ColliderDesc.cylinder(0.012, 0.062),
    half: [0.062, 0.012, 0.062],
    color: '#d63b3b',
    density: 900,
  },
  duck: {
    geo: () => {
      const body = tint(new THREE.SphereGeometry(0.07, 14, 10).scale(1.15, 0.85, 1), '#ffffff');
      const head = tint(new THREE.SphereGeometry(0.045, 12, 10).translate(0.055, 0.07, 0), '#ffffff');
      const beak = tint(new THREE.ConeGeometry(0.018, 0.04, 8).rotateZ(-Math.PI / 2).translate(0.105, 0.065, 0), '#ff8c1a');
      const eyeL = tint(new THREE.SphereGeometry(0.008, 6, 6).translate(0.085, 0.085, 0.025), '#111111');
      const eyeR = tint(new THREE.SphereGeometry(0.008, 6, 6).translate(0.085, 0.085, -0.025), '#111111');
      return merge([body, head, beak, eyeL, eyeR]);
    },
    collider: (R) => R.ColliderDesc.ball(0.07),
    half: [0.08, 0.09, 0.07],
    color: '#ffd43b',
    density: 250,
  },
  phone: {
    geo: () => {
      const body = tint(new THREE.BoxGeometry(0.085, 0.016, 0.16), '#ffffff');
      const screen = tint(new THREE.BoxGeometry(0.074, 0.002, 0.135).translate(0, 0.009, 0), '#1b2a3a');
      const crack = tint(new THREE.BoxGeometry(0.004, 0.0025, 0.1).rotateY(0.6).translate(0.01, 0.0105, 0), '#c5d3e0');
      return merge([body, screen, crack]);
    },
    collider: (R) => R.ColliderDesc.cuboid(0.0425, 0.008, 0.08),
    half: [0.043, 0.01, 0.08],
    color: '#495057',
    density: 1400,
  },
  sock: {
    geo: () => {
      const leg = tint(new THREE.CapsuleGeometry(0.035, 0.11, 4, 10).translate(0, 0.02, 0).rotateZ(Math.PI / 2), '#ffffff');
      const foot = tint(new THREE.CapsuleGeometry(0.033, 0.05, 4, 10).translate(0.07, -0.03, 0), '#ffffff');
      const stripe = tint(new THREE.TorusGeometry(0.036, 0.008, 4, 12).rotateY(Math.PI / 2).translate(-0.07, 0.0, 0), '#d6336c');
      return merge([leg, foot, stripe]);
    },
    collider: (R) => R.ColliderDesc.cuboid(0.1, 0.04, 0.036),
    half: [0.1, 0.05, 0.04],
    color: '#f1f3f5',
    density: 200,
  },
  gear: {
    geo: () => {
      const parts = [tint(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 20), '#ffffff')];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        parts.push(tint(new THREE.BoxGeometry(0.03, 0.03, 0.026).rotateY(-a).translate(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08), '#ffffff'));
      }
      parts.push(tint(new THREE.CylinderGeometry(0.02, 0.02, 0.034, 10), '#555555'));
      return merge(parts);
    },
    collider: (R) => R.ColliderDesc.cylinder(0.016, 0.09),
    half: [0.09, 0.016, 0.09],
    color: '#8d99a6',
    density: 2600,
  },
  crate: {
    geo: () => {
      const parts = [tint(new THREE.BoxGeometry(0.26, 0.26, 0.26), '#ffffff')];
      for (const y of [-0.08, 0, 0.08]) parts.push(tint(new THREE.BoxGeometry(0.27, 0.012, 0.27).translate(0, y, 0), '#b3875a'));
      parts.push(tint(new THREE.BoxGeometry(0.06, 0.06, 0.272).translate(0, 0, 0), '#ffd43b'));
      return merge(parts);
    },
    collider: (R) => R.ColliderDesc.cuboid(0.13, 0.13, 0.13),
    half: [0.135, 0.135, 0.135],
    color: '#c8965f',
    density: 450,
  },
};

const KINDS = Object.keys(SCRAP) as ScrapKind[];
const PAINT = ['#ff3b7f', '#3bc9ff', '#7cff3b', '#b13bff', '#ff8a00', '#00e0b0'];

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s1 = new THREE.Vector3(1, 1, 1);
const tmp = new THREE.Matrix4();

/**
 * Renders all scrap with a handful of instanced meshes: one per kind for the
 * normal finish and one per kind for gold, plus shared overlays for shrink
 * wrap and tiny top hats.
 */
export class ScrapRenderer {
  private normal = new Map<ScrapKind, THREE.InstancedMesh>();
  private golden = new Map<ScrapKind, THREE.InstancedMesh>();
  private wrap: THREE.InstancedMesh;
  private hats: THREE.InstancedMesh;

  constructor(scene: THREE.Object3D) {
    const matN = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.1, vertexColors: true });
    const matG = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 1, vertexColors: true, emissive: '#3a2600', emissiveIntensity: 0.4 });
    for (const k of KINDS) {
      const geo = SCRAP[k].geo();
      for (const [map, mat] of [[this.normal, matN], [this.golden, matG]] as const) {
        const im = new THREE.InstancedMesh(geo, mat, MAX_SCRAP);
        im.count = 0;
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SCRAP * 3), 3);
        im.layers.set(GARAGE_LAYER);
        scene.add(im);
        map.set(k, im);
      }
    }
    this.wrap = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhysicalMaterial({ color: '#e7f5ff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.38, clearcoat: 1, depthWrite: false }),
      MAX_SCRAP,
    );
    this.wrap.count = 0;
    this.wrap.frustumCulled = false;
    this.wrap.renderOrder = 2;
    this.wrap.layers.set(GARAGE_LAYER);
    scene.add(this.wrap);
    const hatGeo = mergeGeometries([
      tint(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 16), '#ffffff'),
      tint(new THREE.CylinderGeometry(0.03, 0.032, 0.06, 16).translate(0, 0.034, 0), '#ffffff'),
      tint(new THREE.CylinderGeometry(0.0325, 0.0325, 0.012, 16).translate(0, 0.012, 0), '#c92a2a'),
    ])!;
    this.hats = new THREE.InstancedMesh(hatGeo, new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6, vertexColors: true }), MAX_SCRAP);
    this.hats.count = 0;
    this.hats.castShadow = true;
    this.hats.frustumCulled = false;
    this.hats.layers.set(GARAGE_LAYER);
    scene.add(this.hats);
  }

  static baseColor(kind: ScrapKind): THREE.Color {
    return new THREE.Color(SCRAP[kind].color);
  }

  static paintColor(): THREE.Color {
    return new THREE.Color(PAINT[Math.floor(Math.random() * PAINT.length)]!);
  }

  render(items: Scrap[]): void {
    const counts = new Map<THREE.InstancedMesh, number>();
    let wraps = 0;
    let hats = 0;
    for (const it of items) {
      const t = it.body.translation();
      const r = it.body.rotation();
      p.set(t.x, t.y, t.z);
      q.set(r.x, r.y, r.z, r.w);
      m4.compose(p, q, s1);
      const im = (it.gold ? this.golden : this.normal).get(it.kind)!;
      const i = counts.get(im) ?? 0;
      counts.set(im, i + 1);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, it.color);
      const half = SCRAP[it.kind].half;
      if (it.wrapped) {
        tmp.makeScale(half[0] * 2.25, half[1] * 2.25 + 0.01, half[2] * 2.25);
        this.wrap.setMatrixAt(wraps++, tmp.premultiply(m4));
      }
      if (it.hat) {
        tmp.makeTranslation(0, half[1] + 0.004, 0);
        this.hats.setMatrixAt(hats++, tmp.premultiply(m4));
      }
    }
    for (const map of [this.normal, this.golden])
      for (const im of map.values()) {
        im.count = counts.get(im) ?? 0;
        im.visible = im.count > 0;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    this.wrap.count = wraps;
    this.wrap.visible = wraps > 0;
    this.hats.visible = hats > 0;
    this.wrap.instanceMatrix.needsUpdate = true;
    this.hats.count = hats;
    this.hats.instanceMatrix.needsUpdate = true;
  }
}

/** Create the rigid body for a new piece of scrap. */
export function scrapBody(phys: Physics, kind: ScrapKind, pos: THREE.Vector3Like): RAPIER.RigidBody {
  const R = phys.R;
  const body = phys.createBody({ pos, angularDamping: 0.6, linearDamping: 0.15 });
  const spec = SCRAP[kind];
  const desc = spec.collider(R).setDensity(spec.density).setFriction(0.9).setRestitution(0.15);
  phys.world.createCollider(desc, body);
  body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
  return body;
}
