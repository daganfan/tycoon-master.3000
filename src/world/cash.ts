import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { num, type Num } from '@/core/num';
import type { PhysicsPatch } from '@/sim/types';
import type { Physics } from './physics';

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
    this.materials = [
      new THREE.MeshStandardMaterial({ color: '#d9a93a', metalness: 1, roughness: 0.28 }),
      new THREE.MeshStandardMaterial({ color: '#6aa56a', metalness: 0, roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: '#b08a5a', metalness: 0, roughness: 0.9 }),
    ];
    const geos = [
      new THREE.CylinderGeometry(0.035, 0.035, 0.009, 20),
      new THREE.BoxGeometry(0.15, 0.025, 0.07),
      new THREE.SphereGeometry(0.11, 18, 14).scale(1, 1.15, 1),
    ];
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
