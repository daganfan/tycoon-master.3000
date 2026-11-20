import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { num, type Num } from '@/core/num';
import type { PhysicsPatch } from '@/sim/types';
import type { Physics } from './physics';
import { bagAtlas, billAtlas, coinMaps } from './textures';

/** Coin: cylinder whose caps use the embossed face and whose edge uses the reeding strip. */
function coinGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.035, 0.035, 0.009, 36, 1);
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) if (Math.abs(n.getY(i)) < 0.5) uv.setXY(i, uv.getX(i) * 0.12, 0.962 + uv.getY(i) * 0.036);
  return g;
}

/** Remap a box's per-face UVs into atlas rows: [x0, y0, x1, y1] per face index (+x,-x,+y,-y,+z,-z). */
function atlasBox(w: number, h: number, d: number, rects: [number, number, number, number][]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const r = rects[Math.floor(i / 4)]!;
    uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  }
  return g;
}

/** Bundle of notes with a paper band (rows: 0.5..1 face, 0.25..0.5 edges, 0..0.25 band). */
function billGeometry(): THREE.BufferGeometry {
  const FACE: [number, number, number, number] = [0, 0.5, 1, 1];
  const EDGE: [number, number, number, number] = [0, 0.27, 1, 0.48];
  const BAND: [number, number, number, number] = [0, 0.02, 1, 0.23];
  const stack = atlasBox(0.15, 0.025, 0.07, [EDGE, EDGE, FACE, FACE, EDGE, EDGE]);
  const band = atlasBox(0.034, 0.0262, 0.0712, [BAND, BAND, BAND, BAND, BAND, BAND]);
  return mergeGeometries([stack, band], false)!;
}

/** Money bag: lathed sack with a pinched neck, ruffled top and a rope tie. */
function bagGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const prof = [
    [0.001, -0.125],
    [0.06, -0.122],
    [0.1, -0.1],
    [0.118, -0.05],
    [0.115, 0.01],
    [0.095, 0.06],
    [0.055, 0.095],
    [0.035, 0.11],
    [0.045, 0.125],
    [0.07, 0.15],
    [0.055, 0.16],
    [0.03, 0.15],
    [0.001, 0.142],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r!, y!));
  const sack = new THREE.LatheGeometry(pts, 28);
  // wobble the ruffle and squash the sack slightly so it looks soft
  const p = sack.attributes.position as THREE.BufferAttribute;
  const uv = sack.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const ruffle = y > 0.12 ? 1 + 0.18 * Math.sin(a * 9) : 1 + 0.02 * Math.sin(a * 3 + y * 20);
    p.setXYZ(i, x * ruffle, y, z * ruffle * 0.92);
    uv.setXY(i, uv.getX(i), 0.2 + uv.getY(i) * 0.8);
  }
  sack.computeVertexNormals();
  const tie = new THREE.TorusGeometry(0.04, 0.011, 8, 24);
  tie.rotateX(Math.PI / 2);
  tie.translate(0, 0.107, 0);
  const tuv = tie.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i), tuv.getY(i) * 0.18);
  const knot = new THREE.SphereGeometry(0.018, 10, 8).translate(0.0, 0.107, -0.045);
  const kuv = knot.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < kuv.count; i++) kuv.setXY(i, kuv.getX(i), kuv.getY(i) * 0.18);
  const parts = [sack, tie, knot].map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(parts, false)!;
}

/** 0 = coin, 1 = bill bundle, 2 = money bag. */
type Kind = 0 | 1 | 2;
const CAPS = [360, 120, 80] as const;
const MERGE_AT = [260, 80] as const;

interface Bit {
  body: RAPIER.RigidBody;
  kind: Kind;
  value: Num;
  age: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * Physical cash: every payout spawns coins, bill bundles or money bags.
 * Rendering uses one InstancedMesh per kind; piles merge into bigger
 * denominations when there are too many bodies.
 */
export class Cash {
  readonly bits: Bit[] = [];
  readonly meshes: THREE.InstancedMesh[];
  readonly materials: THREE.MeshStandardMaterial[];
  private mergeT = 0;
  private patches: PhysicsPatch[] = [];
  bounce = 0.3;

  constructor(
    private readonly phys: Physics,
    scene: THREE.Scene,
  ) {
    const coin = coinMaps();
    const bill = billAtlas();
    const bag = bagAtlas();
    this.materials = [
      new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.32, roughnessMap: coin.rough, normalMap: coin.normal, normalScale: new THREE.Vector2(1.2, 1.2) }),
      new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0, roughness: 0.8, map: bill.map, normalMap: bill.normal, normalScale: new THREE.Vector2(0.6, 0.6) }),
      new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0, roughness: 0.92, map: bag.map, normalMap: bag.normal }),
    ];
    const geos = [coinGeometry(), billGeometry(), bagGeometry()];
    this.meshes = geos.map((g, i) => {
      const m = new THREE.InstancedMesh(g, this.materials[i]!, CAPS[i as Kind]);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
  }

  get total(): Num {
    return this.bits.reduce((a, b) => a.add(b.value), num(0));
  }

  setPatches(p: PhysicsPatch[]): void {
    this.patches = p;
    for (const b of this.bits) this.patchBody(b);
  }

  private patchBody(b: Bit): void {
    let restitution = this.bounce;
    let friction = 0.6;
    let gravity = 1;
    let density = b.kind === 0 ? 6000 : b.kind === 1 ? 900 : 700;
    for (const p of this.patches) {
      if (p.restitution !== undefined) restitution = Math.max(restitution, p.restitution);
      if (p.friction !== undefined) friction = Math.min(friction, p.friction);
      if (p.gravityScale !== undefined) gravity *= p.gravityScale;
      if (p.mass !== undefined) density *= p.mass;
    }
    const c = b.body.collider(0);
    c.setRestitution(restitution);
    c.setFriction(friction);
    c.setDensity(density);
    b.body.setGravityScale(gravity, true);
  }

  spawn(kind: Kind, value: Num, pos: THREE.Vector3Like, vel: THREE.Vector3Like): void {
    if (this.bits.filter((b) => b.kind === kind).length >= CAPS[kind]) {
      // Hard cap: fold the new value into an existing bit of this kind.
      const any = this.bits.find((b) => b.kind === kind);
      if (any) any.value = any.value.add(value);
      return;
    }
    const R = this.phys.R;
    const body = this.phys.createBody({ pos, ccd: kind === 0, angularDamping: 0.4, linearDamping: 0.1 });
    const desc =
      kind === 0 ? R.ColliderDesc.cylinder(0.0045, 0.035) : kind === 1 ? R.ColliderDesc.cuboid(0.075, 0.0125, 0.035) : R.ColliderDesc.ball(0.11);
    this.phys.world.createCollider(desc, body);
    body.setLinvel(vel, true);
    body.setAngvel({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 }, true);
    const b: Bit = { body, kind, value, age: 0 };
    this.patchBody(b);
    this.bits.push(b);
  }

  /** Spray a payout out of `origin` toward `dir`. */
  payout(amount: Num, origin: THREE.Vector3, dir: THREE.Vector3): number {
    if (amount.lte(0)) return 0;
    const a = amount.toNumber();
    const n = Math.max(3, Math.min(30, Math.round(4 + 6 * Math.log10(a + 1))));
    const per = amount.div(n);
    const p = per.toNumber();
    const kind: Kind = p < 25 ? 0 : p < 2000 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(1.6 + Math.random() * 1.6);
      v.x += (Math.random() - 0.5) * 1.4;
      v.z += (Math.random() - 0.5) * 1.4;
      v.y += 1.2 + Math.random() * 1.5;
      const o = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, Math.random() * 0.05, (Math.random() - 0.5) * 0.1));
      this.spawn(kind, per, o, v);
    }
    return n;
  }

  /** Recreate a pile for floor cash restored from a save. */
  restorePile(amount: Num, center: THREE.Vector3): void {
    if (amount.lte(0)) return;
    const n = 12;
    const per = amount.div(n);
    const kind: Kind = per.lt(25) ? 0 : per.lt(2000) ? 1 : 2;
    for (let i = 0; i < n; i++) {
      this.spawn(kind, per, { x: center.x + (Math.random() - 0.5) * 0.6, y: 0.2 + i * 0.03, z: center.z + (Math.random() - 0.5) * 0.6 }, { x: 0, y: 0, z: 0 });
    }
  }

  /**
   * Magnet + pickup + merging. Returns collected value and how many bits were
   * moving fast this frame (for avalanche detection).
   */
  update(
    dt: number,
    player: THREE.Vector3,
    magnet: number,
    seek: boolean,
    onCollect: (v: Num, coins: number) => void,
  ): number {
    let fast = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]!;
      b.age += dt;
      const t = b.body.translation();
      const dx = player.x - t.x;
      const dz = player.z - t.z;
      const dy = player.y - 0.4 - t.y;
      const d = Math.hypot(dx, dz);
      const v = b.body.linvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > 6.25) fast++;
      if (b.age > 0.6 && d < 0.5 && Math.abs(dy) < 1.1) {
        onCollect(b.value, b.kind === 0 ? 1 : b.kind === 1 ? 10 : 50);
        this.phys.world.removeRigidBody(b.body);
        this.bits.splice(i, 1);
        continue;
      }
      if (b.age > 0.6 && (d < magnet || (seek && d < 6))) {
        const m = b.body.mass();
        const pull = d < magnet ? 6 : 1.5;
        b.body.applyImpulse({ x: (dx / d) * pull * m * dt, y: 0.5 * m * dt, z: (dz / d) * pull * m * dt }, true);
      }
      if (t.y < -2) {
        b.body.setTranslation({ x: 0, y: 1, z: 0 }, true);
      }
    }
    this.mergeT += dt;
    if (this.mergeT > 0.75) {
      this.mergeT = 0;
      this.merge(0);
      this.merge(1);
    }
    this.render();
    return fast;
  }

  private merge(kind: 0 | 1): void {
    const list = this.bits.filter((b) => b.kind === kind);
    if (list.length < MERGE_AT[kind]) return;
    const seed = list.filter((b) => b.body.isSleeping() || b.age > 5).sort((a, b) => b.age - a.age)[0] ?? list[0]!;
    const sp = seed.body.translation();
    const group = list
      .map((b) => ({ b, d: Math.hypot(b.body.translation().x - sp.x, b.body.translation().z - sp.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map((x) => x.b);
    let value = num(0);
    const c = new THREE.Vector3();
    for (const b of group) {
      value = value.add(b.value);
      const t = b.body.translation();
      c.add(new THREE.Vector3(t.x, t.y, t.z));
      this.phys.world.removeRigidBody(b.body);
      this.bits.splice(this.bits.indexOf(b), 1);
    }
    c.divideScalar(group.length);
    this.spawn((kind + 1) as Kind, value, { x: c.x, y: c.y + 0.15, z: c.z }, { x: 0, y: 1, z: 0 });
  }

  private render(): void {
    const counts = [0, 0, 0];
    for (const b of this.bits) {
      const t = b.body.translation();
      const r = b.body.rotation();
      tmpP.set(t.x, t.y, t.z);
      tmpQ.set(r.x, r.y, r.z, r.w);
      tmpM.compose(tmpP, tmpQ, ONE);
      this.meshes[b.kind]!.setMatrixAt(counts[b.kind]!++, tmpM);
    }
    this.meshes.forEach((m, i) => {
      m.count = counts[i]!;
      m.instanceMatrix.needsUpdate = true;
    });
  }
}
