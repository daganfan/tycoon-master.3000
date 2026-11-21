import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { CosmeticTarget, PhysicsPatch } from '@/sim/types';

export type R = typeof RAPIER;

/** What kind of surface a flat top offers to the placement solver. */
export type SurfaceKind = 'desk' | 'riser' | 'table' | 'shelf' | 'dresser' | 'nightstand' | 'floor';

/** A flat top on a piece of furniture, in the body's local frame (centre x/z, height y, half sizes). */
export interface Top {
  kind: SurfaceKind;
  x: number;
  y: number;
  z: number;
  hw: number;
  hd: number;
  /** Free height above the top (e.g. up to the next shelf). */
  clear: number;
}

export interface PhysObj {
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  kind: string;
  target: CosmeticTarget | null;
  base: { restitution: number; friction: number; density: number };
  wasUpright: boolean;
  wobble: number;
  lastVel: THREE.Vector3;
  /** Stable id for persistence (`desk`, `used_monitor#0`, ...). Unset for transient toys. */
  id?: string;
  /** Where Tidy Up returns the object: its spawn pose, or where the player last deliberately set it down. */
  home: { pos: THREE.Vector3; quat: THREE.Quaternion };
  /** Player interaction (grab / tidy) is in control until this time (world seconds); chaos ignores it. */
  handledUntil?: number;
  /** Flat surfaces other things can be placed on (desk tops, shelves...). */
  tops?: Top[];
  /** Too heavy to carry: can only be shoved along the floor. */
  heavy?: boolean;
  /** Last cosmetic physics patches (re-applied when the comfort setting changes). */
  patches?: PhysicsPatch[];
  /** Base damping, before the comfort setting is applied. */
  damping?: { lin: number; ang: number };
}

export interface BodyOpts {
  pos: THREE.Vector3Like;
  rot?: THREE.Euler;
  fixed?: boolean;
  restitution?: number;
  friction?: number;
  density?: number;
  ccd?: boolean;
  linearDamping?: number;
  angularDamping?: number;
}

/** Per-collider material as authored (cosmetics and comfort scale from here, never from the last applied value). */
interface ColliderBase {
  restitution: number;
  friction: number;
  density: number;
  local: THREE.Vector3;
  localQ: THREE.Quaternion;
}

/** How the comfort setting (0 = calm, 1 = full chaos) shapes the physics. Pure, for tests. */
export function comfortTuning(comfort: number): { restitution: number; angDamping: number; linDamping: number; avatarMass: number; throwBoost: number } {
  const c = THREE.MathUtils.clamp(comfort, 0, 1);
  return {
    restitution: 0.3 + 0.7 * c,
    angDamping: (1 - c) * 3,
    linDamping: (1 - c) * 0.8,
    avatarMass: 0.3 + 0.7 * c,
    throwBoost: 0.45 + 0.55 * c,
  };
}

/** Seconds a body must stay nearly still before it is put to sleep (a softer, larger sleep threshold). */
const NAP_AFTER = 0.6;
const NAP_LIN = 0.04;
const NAP_ANG = 0.08;

let rapier: R | null = null;

export async function initRapier(): Promise<R> {
  if (!rapier) {
    await RAPIER.init();
    rapier = RAPIER;
  }
  return rapier;
}

/** Thin wrapper over a Rapier world that keeps meshes in sync with bodies. */
export class Physics {
  readonly world: RAPIER.World;
  readonly objs: PhysObj[] = [];
  private acc = 0;
  readonly step = 1 / 60;
  /** 0 = calm world, 1 = full chaos (Settings → Physics chaos). */
  comfort = 1;
  private colliderBase = new Map<number, ColliderBase>();
  private still = new WeakMap<RAPIER.RigidBody, number>();

  constructor(readonly R: R) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.step;
    // More solver iterations: stacks on desks and shelves stay put instead of jittering apart.
    this.world.numSolverIterations = 8;
  }

  /** A fixed (static) cuboid collider, no mesh tracking. */
  staticBox(half: THREE.Vector3Like, pos: THREE.Vector3Like, friction = 0.8, rot?: THREE.Quaternion): RAPIER.Collider {
    const d = this.R.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(pos.x, pos.y, pos.z).setFriction(friction);
    if (rot) d.setRotation(rot);
    return this.world.createCollider(d);
  }

  createBody(o: BodyOpts): RAPIER.RigidBody {
    const R = this.R;
    const desc = (o.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic()).setTranslation(o.pos.x, o.pos.y, o.pos.z);
    if (o.rot) {
      const q = new THREE.Quaternion().setFromEuler(o.rot);
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    if (o.ccd) desc.setCcdEnabled(true);
    desc.setLinearDamping(o.linearDamping ?? 0.05).setAngularDamping(o.angularDamping ?? 0.2);
    return this.world.createRigidBody(desc);
  }

  /** Register a mesh + body pair. Colliders must already be attached. */
  track(mesh: THREE.Object3D, body: RAPIER.RigidBody, kind: string, target: CosmeticTarget | null, base: PhysObj['base']): PhysObj {
    const t = body.translation();
    const r = body.rotation();
    const home = { pos: new THREE.Vector3(t.x, t.y, t.z), quat: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
    const o: PhysObj = { mesh, body, kind, target, base, wasUpright: true, wobble: 0, lastVel: new THREE.Vector3(), home };
    o.damping = { lin: body.linearDamping(), ang: body.angularDamping() };
    this.objs.push(o);
    if (kind !== 'avatar' && body.isDynamic()) this.refresh(o);
    else if (kind === 'avatar') this.refresh(o);
    this.sync(o);
    return o;
  }

  addCollider(body: RAPIER.RigidBody, desc: RAPIER.ColliderDesc, o: { restitution?: number; friction?: number; density?: number }): RAPIER.Collider {
    const b: ColliderBase = {
      restitution: o.restitution ?? 0.2,
      friction: o.friction ?? 0.7,
      density: o.density ?? 1,
      local: new THREE.Vector3(desc.translation.x, desc.translation.y, desc.translation.z),
      localQ: new THREE.Quaternion(desc.rotation.x, desc.rotation.y, desc.rotation.z, desc.rotation.w),
    };
    desc.setRestitution(b.restitution).setFriction(b.friction).setDensity(b.density);
    const c = this.world.createCollider(desc, body);
    this.colliderBase.set(c.handle, b);
    return c;
  }

  /** The collider's pose in its body's frame as authored (works before the first step). */
  colliderLocal(c: RAPIER.Collider): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    const b = this.colliderBase.get(c.handle);
    return b ? { pos: b.local, quat: b.localQ } : null;
  }

  remove(o: PhysObj): void {
    const i = this.objs.indexOf(o);
    if (i >= 0) this.objs.splice(i, 1);
    for (let k = 0; k < o.body.numColliders(); k++) this.colliderBase.delete(o.body.collider(k).handle);
    this.world.removeRigidBody(o.body);
    o.mesh.removeFromParent();
  }

  /** Apply a stacked physics patch (from skins/modifiers) on top of the object's base values. */
  applyPatch(o: PhysObj, patches: PhysicsPatch[]): void {
    o.patches = patches;
    this.refresh(o);
  }

  /** Change the comfort setting and re-tune every body. */
  setComfort(c: number): void {
    if (Math.abs(c - this.comfort) < 1e-3) return;
    this.comfort = c;
    for (const o of this.objs) this.refresh(o);
  }

  /** Recompute collider materials and damping from authored values + cosmetic patches + comfort. */
  refresh(o: PhysObj): void {
    const tune = comfortTuning(this.comfort);
    let rMax = 0;
    let fMin = Infinity;
    let massMul = 1;
    let gravity = 1;
    for (const p of o.patches ?? []) {
      if (p.restitution !== undefined) rMax = Math.max(rMax, p.restitution);
      if (p.friction !== undefined) fMin = Math.min(fMin, p.friction);
      if (p.mass !== undefined) massMul *= p.mass;
      if (p.gravityScale !== undefined) gravity *= p.gravityScale;
    }
    const avatar = o.kind === 'avatar';
    if (avatar) massMul *= tune.avatarMass;
    for (let i = 0; i < o.body.numColliders(); i++) {
      const c = o.body.collider(i);
      const b = this.colliderBase.get(c.handle) ?? { restitution: o.base.restitution, friction: o.base.friction, density: o.base.density };
      c.setRestitution(Math.max(b.restitution, rMax) * (avatar ? 1 : tune.restitution));
      c.setFriction(Math.min(b.friction, fMin));
      c.setDensity(b.density * massMul);
    }
    if (o.patches) o.body.setGravityScale(gravity, true);
    if (!avatar && o.damping) {
      o.body.setAngularDamping(o.damping.ang + tune.angDamping);
      o.body.setLinearDamping(o.damping.lin + tune.linDamping);
    }
  }

  /**
   * "Calm" window (seconds of sim time): after every step, cap the speed of every
   * dynamic body except `calmExempt`. Used right after Tidy Up so any leftover
   * overlap is resolved as a gentle nudge instead of launching furniture.
   */
  calmFor = 0;
  calmExempt: RAPIER.RigidBody | null = null;

  update(dt: number, maxSteps = 4): number {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.step && steps < maxSteps) {
      this.world.step();
      if (this.calmFor > 0) {
        this.calmFor -= this.step;
        this.calm();
      }
      this.acc -= this.step;
      steps++;
    }
    if (steps === maxSteps) this.acc = 0;
    for (const o of this.objs) this.sync(o);
    if (steps) this.nap(steps * this.step);
    return steps;
  }

  private calm(): void {
    const MAX_V = 0.6;
    const MAX_W = 2;
    this.world.forEachRigidBody((b) => {
      if (!b.isDynamic() || b === this.calmExempt || b.isSleeping()) return;
      const v = b.linvel();
      const s = Math.hypot(v.x, v.y, v.z);
      // Let things fall normally (gravity), only clamp sideways/upward bursts.
      if (s > MAX_V && !(v.y < 0 && Math.hypot(v.x, v.z) < MAX_V)) {
        const k = MAX_V / s;
        b.setLinvel({ x: v.x * k, y: Math.min(v.y * k, v.y), z: v.z * k }, true);
      }
      const w = b.angvel();
      const ws = Math.hypot(w.x, w.y, w.z);
      if (ws > MAX_W) b.setAngvel({ x: (w.x * MAX_W) / ws, y: (w.y * MAX_W) / ws, z: (w.z * MAX_W) / ws }, true);
    });
  }

  /** Put bodies that have barely moved for a while to sleep, so stacks stop creeping. */
  private nap(dt: number): void {
    for (const o of this.objs) {
      const b = o.body;
      if (o.kind === 'avatar' || !b.isDynamic() || b.isSleeping()) {
        // Reset while frozen/asleep: a body that was still before being carried or
        // tidied must not be put to sleep the very step it turns dynamic again —
        // Rapier then misses its floor contact and it sinks through the floor.
        this.still.set(b, 0);
        continue;
      }
      const lv = b.linvel();
      const av = b.angvel();
      if (Math.abs(lv.x) + Math.abs(lv.y) + Math.abs(lv.z) > NAP_LIN || Math.abs(av.x) + Math.abs(av.y) + Math.abs(av.z) > NAP_ANG) {
        this.still.set(b, 0);
        continue;
      }
      const t = (this.still.get(b) ?? 0) + dt;
      this.still.set(b, t);
      if (t > NAP_AFTER) b.sleep();
    }
  }

  sync(o: PhysObj): void {
    const t = o.body.translation();
    const r = o.body.rotation();
    o.mesh.position.set(t.x, t.y, t.z);
    o.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
