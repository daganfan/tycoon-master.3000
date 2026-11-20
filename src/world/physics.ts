import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { CosmeticTarget, PhysicsPatch } from '@/sim/types';

export type R = typeof RAPIER;

export interface PhysObj {
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  kind: string;
  target: CosmeticTarget | null;
  base: { restitution: number; friction: number; density: number };
  wasUpright: boolean;
  wobble: number;
  lastVel: THREE.Vector3;
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

  constructor(readonly R: R) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.step;
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
    const o: PhysObj = { mesh, body, kind, target, base, wasUpright: true, wobble: 0, lastVel: new THREE.Vector3() };
    this.objs.push(o);
    this.sync(o);
    return o;
  }

  addCollider(body: RAPIER.RigidBody, desc: RAPIER.ColliderDesc, o: { restitution?: number; friction?: number; density?: number }): void {
    desc.setRestitution(o.restitution ?? 0.2).setFriction(o.friction ?? 0.7).setDensity(o.density ?? 1);
    this.world.createCollider(desc, body);
  }

  remove(o: PhysObj): void {
    const i = this.objs.indexOf(o);
    if (i >= 0) this.objs.splice(i, 1);
    this.world.removeRigidBody(o.body);
    o.mesh.removeFromParent();
  }

  /** Apply a stacked physics patch (from skins/modifiers) on top of the object's base values. */
  applyPatch(o: PhysObj, patches: PhysicsPatch[]): void {
    let restitution = o.base.restitution;
    let friction = o.base.friction;
    let density = o.base.density;
    let gravity = 1;
    for (const p of patches) {
      if (p.restitution !== undefined) restitution = Math.max(restitution, p.restitution);
      if (p.friction !== undefined) friction = Math.min(friction, p.friction);
      if (p.mass !== undefined) density *= p.mass;
      if (p.gravityScale !== undefined) gravity *= p.gravityScale;
    }
    for (let i = 0; i < o.body.numColliders(); i++) {
      const c = o.body.collider(i);
      c.setRestitution(restitution);
      c.setFriction(friction);
      c.setDensity(density);
    }
    o.body.setGravityScale(gravity, true);
  }

  update(dt: number, maxSteps = 4): number {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.step && steps < maxSteps) {
      this.world.step();
      this.acc -= this.step;
      steps++;
    }
    if (steps === maxSteps) this.acc = 0;
    for (const o of this.objs) this.sync(o);
    return steps;
  }

  sync(o: PhysObj): void {
    const t = o.body.translation();
    const r = o.body.rotation();
    o.mesh.position.set(t.x, t.y, t.z);
    o.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
