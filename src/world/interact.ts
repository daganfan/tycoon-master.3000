import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '@/sim/game';
import type { PropPose } from '@/sim/types';
import type { Physics, PhysObj } from './physics';
import type { Avatar } from './avatar';
import { insideAny } from './garage/areas';
import { SPAWN } from './room';
import { comfortTuning } from './physics';
import { deliberatePlacement, settleVerdict, tidyOrder, TIDY_COOLDOWN, type TidyItem } from './tidy';

/** What the interaction system needs from the world (kept small to avoid tight coupling). */
export interface InteractHost {
  readonly game: Game;
  readonly phys: Physics;
  readonly avatar: Avatar;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** Camera yaw (third-person orbit). */
  readonly yaw: number;
  /** Meshes that are screens: clicking them focuses the screen instead of grabbing. */
  screenMeshes(): THREE.Object3D[];
  /** Crosshair targeting: the grabbable prop under the centre of view (within reach), if any. */
  aimProp?(): { obj: PhysObj; point: THREE.Vector3 } | null;
  /** Where a carried object should float at `dist` (e.g. in front of the eyes in first person); null = in front of the avatar. */
  holdPoint?(dist: number): THREE.Vector3 | null;
}

interface Tween {
  obj: PhysObj;
  fromPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  toPos: THREE.Vector3;
  toQuat: THREE.Quaternion;
  t: number;
  dur: number;
  delay: number;
  arc: number;
  /** Part of a Tidy Up batch: colliders are off while it flies, everything lands together. */
  batch: boolean;
}

interface Held {
  obj: PhysObj;
  /** Grab point in the body's local frame. */
  local: THREE.Vector3;
  heavy: boolean;
  byMouse: boolean;
  damping: number;
  /** World time it was grabbed. */
  since: number;
}

interface PendingHome {
  since: number;
  at: THREE.Vector3;
}

const TOYS = new Set(['duck', 'sock', 'remote']);
const HEAVY_KINDS = new Set(['desk', 'table', 'bed', 'bookcase', 'dresser']);
const HEAVY_MASS = 20;
const REACH = 2.2;
const SAVE_EVERY = 1;

const v3 = (a: THREE.Vector3Like) => new THREE.Vector3(a.x, a.y, a.z);
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Player interaction with physical props: grab & carry (with a springy hold so
 * things swing), shove heavy furniture, stand toppled things back up (R), tidy
 * the whole room, rescue things that fell out of the world, and persist the
 * layout of every prop in the save.
 */
export class Interact {
  held: Held | null = null;
  holdDist = 1.1;
  private tweens: Tween[] = [];
  private raycaster = new THREE.Raycaster();
  private now = 0;
  private saveAcc = 0;
  private pendingHome = new Map<PhysObj, PendingHome>();
  private tidyBatch: { objs: PhysObj[]; left: number; start: number } | null = null;
  private tidyReadyAt = 0;
  private savedGroups = new Map<number, number>();
  /** Called when the player deliberately sets something down at a new home (for achievements). */
  onPlaced: (o: PhysObj, moved: number) => void = () => {};

  constructor(private readonly w: InteractHost) {}

  /* ------------------------------------------------------------ registry */

  /** Objects that belong to the room layout (have a stable id). */
  layoutObjs(): PhysObj[] {
    return this.w.phys.objs.filter((o) => !!o.id);
  }

  private grabbable(): PhysObj[] {
    return this.w.phys.objs.filter((o) => o.kind !== 'avatar' && o.body.isDynamic());
  }

  /** Give an object a stable id and restore its saved pose (if any). */
  register(o: PhysObj, id: string): void {
    o.id = id;
    const pose = this.w.game.state.layout[id];
    if (!pose || !validPose(pose.p) || !validPose(pose.q)) return;
    const p = new THREE.Vector3(...pose.p);
    if (!inside(p, 0)) return;
    o.body.setTranslation(p, true);
    o.body.setRotation(new THREE.Quaternion(...pose.q), true);
    if (pose.hp && pose.hq && validPose(pose.hp) && validPose(pose.hq) && inside(new THREE.Vector3(...pose.hp), 0)) {
      o.home.pos.set(...pose.hp);
      o.home.quat.set(...pose.hq);
    }
    o.wasUpright = up(o).y > 0.9;
    this.w.phys.sync(o);
  }

  isHeavy(o: PhysObj): boolean {
    return !!o.heavy || HEAVY_KINDS.has(o.kind) || o.body.mass() > HEAVY_MASS;
  }

  /* ------------------------------------------------------------ input */

  /** Left mouse down: grab the prop under the crosshair (or the cursor) if it's within reach. */
  pointerDown(e: PointerEvent, crosshair = false): boolean {
    if (this.held && e.button === 2) {
      this.release(false);
      return true;
    }
    if (e.button !== 0 || this.held) return false;
    const hit = crosshair ? (this.w.aimProp?.() ?? null) : this.pick(e);
    if (!hit) return false;
    this.grab(hit.obj, hit.point, true);
    return true;
  }

  pointerUp(_e: PointerEvent): boolean {
    if (this.held?.byMouse) {
      this.release(true);
      return true;
    }
    return false;
  }

  wheel(dy: number): boolean {
    if (!this.held) return false;
    this.holdDist = THREE.MathUtils.clamp(this.holdDist - Math.sign(dy) * 0.12, 0.7, 2.0);
    return true;
  }

  /** G: grab the thing in front of you, or drop what you hold. */
  toggleGrab(): void {
    if (this.held) return this.release(false);
    const aimed = this.w.aimProp?.();
    if (aimed) return this.grab(aimed.obj, aimed.point, false);
    const o = this.inFront();
    if (o) this.grab(o, o.body.translation(), false);
  }

  /** R: stand the nearest toppled object back upright where it lies. */
  uprightNearest(): boolean {
    const aimed = this.w.aimProp?.()?.obj;
    const o = aimed && up(aimed).y <= 0.9 && !this.tweens.some((t) => t.obj === aimed) ? aimed : this.nearestToppled();
    if (!o) return false;
    if (this.held?.obj === o) this.release(false);
    this.tweenTo(o, this.uprightPose(o), 0.45, 0, 0.25);
    return true;
  }

  /**
   * Return every furniture/prop to its home (spawn spot or last deliberate
   * placement). Things fly back with their colliders off, supports first,
   * then all land in the same frame with zero velocity and go to sleep, so a
   * second Tidy finds nothing to do. Returns how many objects move, or -1 if
   * a tidy is still running / cooling down.
   */
  tidyAll(): number {
    if (this.tidyBatch || this.now < this.tidyReadyAt) return -1;
    if (this.held) this.release(false);
    const byId = new Map<string, PhysObj>();
    const items: TidyItem[] = [];
    for (const o of this.layoutObjs()) {
      if (this.tweens.some((t) => t.obj === o)) continue;
      byId.set(o.id!, o);
      items.push({ id: o.id!, support: !!o.tops?.length, homeY: o.home.pos.y, dist: v3(o.body.translation()).distanceTo(o.home.pos), angle: rot(o).angleTo(o.home.quat) });
    }
    const order = tidyOrder(items).map((i) => byId.get(i.id)!);
    this.tidyReadyAt = this.now + TIDY_COOLDOWN;
    if (!order.length) return 0;
    for (const o of order) {
      this.pendingHome.delete(o);
      // Fly through everything: no collision groups while moving.
      for (let i = 0; i < o.body.numColliders(); i++) {
        const c = o.body.collider(i);
        if (!this.savedGroups.has(c.handle)) this.savedGroups.set(c.handle, c.collisionGroups());
        c.setCollisionGroups(0);
      }
    }
    order.forEach((o, i) => this.tweenTo(o, { pos: o.home.pos.clone(), quat: o.home.quat.clone() }, 0.75, i * 0.04, this.isHeavy(o) ? 0.1 : 0.3, true));
    this.tidyBatch = { objs: order, left: order.length, start: this.now };
    this.w.game.bus.emit('world', { kind: 'tidy', value: order.length });
    return order.length;
  }

  /** 'tidying' while things fly home, 'cooldown' right after, else 'idle'. */
  tidyState(): 'idle' | 'tidying' | 'cooldown' {
    return this.tidyBatch ? 'tidying' : this.now < this.tidyReadyAt ? 'cooldown' : 'idle';
  }

  /** Every batch member has arrived: land them all at once, supports first. */
  private finishTidy(): void {
    const batch = this.tidyBatch;
    if (!batch) return;
    this.tidyBatch = null;
    const R = this.w.phys.R;
    const live = batch.objs.filter((o) => this.w.phys.objs.includes(o));
    for (const o of live) {
      const b = o.body;
      // Collide again (groups, not setEnabled: a re-enabled collider misses contacts for a few steps and sinks).
      for (let i = 0; i < b.numColliders(); i++) {
        const c = b.collider(i);
        c.setCollisionGroups(this.savedGroups.get(c.handle) ?? 0xffffffff);
        this.savedGroups.delete(c.handle);
      }
      b.setBodyType(R.RigidBodyType.Dynamic, true);
      b.setTranslation(o.home.pos, true);
      b.setRotation(o.home.quat, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      o.wasUpright = up(o).y > 0.9;
      o.handledUntil = this.now + 1.5;
      this.w.phys.sync(o);
    }
    // Loose toys sitting where furniture just landed get lifted on top instead of being blasted away.
    const boxes = live.map((o) => new THREE.Box3().setFromObject(o.mesh));
    for (const t of this.w.phys.objs) {
      if (t.id || t.kind === 'avatar' || !t.body.isDynamic()) continue;
      const p = v3(t.body.translation());
      const hit = boxes.find((bx) => bx.containsPoint(p));
      if (hit) t.body.setTranslation({ x: p.x, y: hit.max.y + 0.15, z: p.z }, true);
    }
    // Landed exactly on their resting poses: sleep, so nothing creeps or jumps afterwards.
    for (const o of live) o.body.sleep();
    this.tidyReadyAt = this.now + TIDY_COOLDOWN;
  }

  /* ------------------------------------------------------------ queries */

  private ownerOf(obj: THREE.Object3D): PhysObj | undefined {
    const objs = this.grabbable();
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
      const found = objs.find((p) => p.mesh === o);
      if (found) return found;
    }
    return undefined;
  }

  private pick(e: PointerEvent): { obj: PhysObj; point: THREE.Vector3 } | null {
    const r = this.w.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.w.camera);
    const objs = this.grabbable();
    const screens = new Set(this.w.screenMeshes());
    const hits = this.raycaster.intersectObjects(objs.map((o) => o.mesh), true);
    const avatar = this.w.avatar.position;
    for (const h of hits) {
      if (screens.has(h.object)) return null; // clicking a screen uses it
      const o = this.ownerOf(h.object);
      if (!o) continue;
      if (h.point.distanceTo(avatar) > REACH) return null;
      return { obj: o, point: h.point };
    }
    return null;
  }

  private forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.w.yaw), 0, -Math.cos(this.w.yaw));
  }

  /** Best grabbable object in front of the avatar (cone around the camera direction). */
  inFront(): PhysObj | null {
    const p = this.w.avatar.position;
    const f = this.forward();
    let best: PhysObj | null = null;
    let bestScore = Infinity;
    for (const o of this.grabbable()) {
      const d = v3(o.body.translation()).sub(p);
      d.y = Math.max(-0.4, Math.min(0.4, d.y));
      const dist = d.length();
      if (dist > REACH) continue;
      const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
      const cos = flat.dot(f);
      if (cos < 0.35 && dist > 0.6) continue;
      const score = dist * (2 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  nearestToppled(): PhysObj | null {
    const p = this.w.avatar.position;
    let best: PhysObj | null = null;
    let bd = REACH;
    for (const o of this.grabbable()) {
      if (up(o).y > 0.9 || this.tweens.some((t) => t.obj === o)) continue;
      const d = v3(o.body.translation()).distanceTo(p);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------ grab */

  private grab(o: PhysObj, point: THREE.Vector3Like, byMouse: boolean): void {
    const inv = rot(o).invert();
    const local = v3(point).sub(v3(o.body.translation())).applyQuaternion(inv);
    // Grabbing by the centre for G keeps things stable; mouse grabs keep the exact point so they swing.
    if (!byMouse) local.set(0, local.y * 0.3, 0);
    const heavy = this.isHeavy(o);
    this.held = { obj: o, local, heavy, byMouse, damping: o.body.angularDamping(), since: this.now };
    this.pendingHome.delete(o);
    this.holdDist = THREE.MathUtils.clamp(v3(point).distanceTo(this.w.avatar.position), 0.8, 1.4);
    if (!heavy) o.body.setAngularDamping(3);
    o.body.wakeUp();
    this.tweens = this.tweens.filter((t) => t.obj !== o);
  }

  release(throwIt: boolean): void {
    const h = this.held;
    if (!h) return;
    this.held = null;
    const b = h.obj.body;
    b.setAngularDamping(h.damping);
    const v0 = b.linvel();
    const speed = Math.hypot(v0.x, v0.y, v0.z);
    if (throwIt && !h.heavy) {
      const boost = Math.min(1.5, 8 / Math.max(0.1, speed)) * comfortTuning(this.w.game.state.settings.comfort).throwBoost;
      b.setLinvel({ x: v0.x * boost, y: v0.y * boost, z: v0.z * boost }, true);
      if (speed * boost > 6) this.w.game.bus.emit('world', { kind: 'yeet', object: h.obj.id ?? h.obj.kind, value: speed * boost });
    }
    h.obj.handledUntil = this.now + 1.5;
    // Only a deliberate set-down (carried a moment, let go gently) can give it a new home.
    if (h.obj.id && deliberatePlacement({ heldFor: this.now - h.since, speed, thrown: throwIt, heavy: h.heavy }))
      this.pendingHome.set(h.obj, { since: this.now, at: v3(b.translation()) });
  }

  /** Explicit "this is where it lives now" for the held object (or the one in front). */
  setHomeHere(): PhysObj | null {
    const o = this.held?.obj ?? this.inFront();
    if (!o?.id) return null;
    if (this.held?.obj === o) this.release(false);
    this.pendingHome.set(o, { since: this.now, at: v3(o.body.translation()) });
    return o;
  }

  private holdTarget(): THREE.Vector3 {
    const anchored = this.w.holdPoint?.(this.holdDist);
    if (anchored) return anchored;
    const p = this.w.avatar.position;
    return p.add(this.forward().multiplyScalar(this.holdDist)).add(new THREE.Vector3(0, 0.3, 0));
  }

  private updateHeld(dt: number): void {
    const h = this.held;
    if (!h) return;
    const b = h.obj.body;
    if (!b.isDynamic()) return this.release(false);
    h.obj.handledUntil = this.now + 1.5;
    const com = v3(b.translation());
    const point = h.local.clone().applyQuaternion(rot(h.obj)).add(com);
    const target = this.holdTarget();
    const err = target.clone().sub(point);
    if (err.length() > 3) return this.release(false); // snagged on something
    const m = b.mass();
    const lv = v3(b.linvel());
    const av = v3(b.angvel());
    const pointVel = lv.clone().add(av.clone().cross(point.clone().sub(com)));
    if (h.heavy) {
      // Too heavy to lift: you can only shove it along the floor.
      err.y = 0;
      const want = err.multiplyScalar(4).clampLength(0, 1.6);
      const imp = want.sub(new THREE.Vector3(lv.x, 0, lv.z)).multiplyScalar(m * 0.08);
      b.applyImpulse(imp, true);
      return;
    }
    const want = err.multiplyScalar(10).clampLength(0, 7);
    const imp = want.sub(pointVel).multiplyScalar(m * 0.3);
    imp.y += m * 9.81 * dt; // carry the weight
    b.applyImpulseAtPoint(imp, point, true);
  }

  /* ------------------------------------------------------------ upright / tidy */

  /** Upright pose at the object's current spot: keep its heading, sit it on the surface below. */
  uprightPose(o: PhysObj): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const q = rot(o);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    if (fwd.x * fwd.x + fwd.z * fwd.z < 0.05) fwd.set(1, 0, 0).applyQuaternion(q);
    const yaw = Math.atan2(fwd.x, fwd.z);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const c = new THREE.Box3().setFromObject(o.mesh).getCenter(new THREE.Vector3());
    const surface = this.surfaceBelow(c, o.body);
    // Measure how far the object's lowest point sits below its origin when upright.
    const mesh = o.mesh;
    const savedP = mesh.position.clone();
    const savedQ = mesh.quaternion.clone();
    mesh.position.set(0, 0, 0);
    mesh.quaternion.copy(quat);
    mesh.updateMatrixWorld(true);
    const bottom = new THREE.Box3().setFromObject(mesh).min.y;
    mesh.position.copy(savedP);
    mesh.quaternion.copy(savedQ);
    mesh.updateMatrixWorld(true);
    const t = o.body.translation();
    return { pos: new THREE.Vector3(t.x, surface - bottom + 0.02, t.z), quat };
  }

  private surfaceBelow(from: THREE.Vector3, self: RAPIER.RigidBody): number {
    const R = this.w.phys.R;
    const avatar = this.w.avatar.body;
    const ray = new R.Ray({ x: from.x, y: from.y + 0.05, z: from.z }, { x: 0, y: -1, z: 0 });
    const hit = this.w.phys.world.castRay(ray, 5, true, undefined, undefined, undefined, undefined, (c) => {
      const p = c.parent();
      return !p || (p.handle !== self.handle && p.handle !== avatar.handle);
    });
    return hit ? from.y + 0.05 - hit.timeOfImpact : 0;
  }

  private tweenTo(o: PhysObj, to: { pos: THREE.Vector3; quat: THREE.Quaternion }, dur: number, delay: number, arc: number, batch = false): void {
    this.tweens = this.tweens.filter((t) => t.obj !== o);
    const R = this.w.phys.R;
    o.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    o.handledUntil = Infinity;
    this.tweens.push({ obj: o, fromPos: v3(o.body.translation()), fromQuat: rot(o), toPos: to.pos, toQuat: to.quat, t: 0, dur, delay, arc, batch });
  }

  private updateTweens(dt: number): void {
    const R = this.w.phys.R;
    for (const tw of [...this.tweens]) {
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      const p = tw.fromPos.clone().lerp(tw.toPos, k);
      p.y += Math.sin(Math.PI * tw.t) * tw.arc;
      const q = tw.fromQuat.clone().slerp(tw.toQuat, k);
      const b = tw.obj.body;
      b.setNextKinematicTranslation(p);
      b.setNextKinematicRotation(q);
      if (tw.t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        if (tw.batch) {
          // Hold position (kinematic, no collisions) until the whole batch is home.
          if (this.tidyBatch && --this.tidyBatch.left <= 0) this.finishTidy();
          continue;
        }
        b.setBodyType(R.RigidBodyType.Dynamic, true);
        b.setTranslation(tw.toPos, true);
        b.setRotation(tw.toQuat, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        tw.obj.wasUpright = up(tw.obj).y > 0.9;
        tw.obj.handledUntil = this.now + 1;
      }
    }
  }

  busy(o: PhysObj): boolean {
    return (o.handledUntil ?? -1) > this.now;
  }

  /* ------------------------------------------------------------ rescue + persistence */

  private rescue(): void {
    for (const o of this.w.phys.objs) {
      if (this.tweens.some((t) => t.obj === o)) continue;
      const p = v3(o.body.translation());
      if (o.kind === 'avatar') {
        if (!inside(p, 0.6)) {
          o.body.setTranslation(SPAWN, true);
          o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        continue;
      }
      if (inside(p)) continue;
      if (this.held?.obj === o) this.release(false);
      const to = o.id ? o.home.pos : new THREE.Vector3(SPAWN.x, 1.2, SPAWN.z);
      o.body.setTranslation(to, true);
      if (o.id) o.body.setRotation(o.home.quat, true);
      o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      o.handledUntil = this.now + 1;
    }
  }

  /** After a deliberate set-down, once the object comes to rest upright near where it was let go, that spot becomes its home. */
  private settleHomes(): void {
    for (const [o, pend] of this.pendingHome) {
      if (!this.w.phys.objs.includes(o)) {
        this.pendingHome.delete(o);
        continue;
      }
      const lv = o.body.linvel();
      const av = o.body.angvel();
      const p = v3(o.body.translation());
      const verdict = settleVerdict({
        since: this.now - pend.since,
        lin: Math.hypot(lv.x, lv.y, lv.z),
        ang: Math.hypot(av.x, av.y, av.z),
        upright: up(o).y > 0.9,
        inside: inside(p, 0),
        drift: p.distanceTo(pend.at),
        interrupted: this.held?.obj === o || this.tweens.some((t) => t.obj === o),
      });
      if (verdict === 'wait') continue;
      this.pendingHome.delete(o);
      if (verdict === 'reject') continue;
      const moved = p.distanceTo(o.home.pos);
      o.home.pos.copy(p);
      o.home.quat.copy(rot(o));
      this.onPlaced(o, moved);
    }
  }

  saveLayout(): void {
    const layout: Record<string, PropPose> = {};
    for (const o of this.layoutObjs()) {
      const t = o.body.translation();
      const r = o.body.rotation();
      const h = o.home;
      layout[o.id!] = {
        p: [round(t.x), round(t.y), round(t.z)],
        q: [round(r.x), round(r.y), round(r.z), round(r.w)],
        hp: [round(h.pos.x), round(h.pos.y), round(h.pos.z)],
        hq: [round(h.quat.x), round(h.quat.y), round(h.quat.z), round(h.quat.w)],
      };
    }
    this.w.game.state.layout = layout;
  }

  /** Call once per frame before the physics step. */
  update(dt: number): void {
    this.now += dt;
    this.updateHeld(dt);
    this.updateTweens(dt);
    // Safety net: a batch that somehow lost a member still lands.
    if (this.tidyBatch && this.now - this.tidyBatch.start > 5) {
      this.tweens = this.tweens.filter((t) => !t.batch);
      this.finishTidy();
    }
    this.rescue();
    this.settleHomes();
    this.saveAcc += dt;
    if (this.saveAcc >= SAVE_EVERY) {
      this.saveAcc = 0;
      this.saveLayout();
    }
  }

  /** Short contextual hint for the HUD, or '' if nothing to say. */
  hint(): string {
    if (this.held)
      return this.held.heavy
        ? 'Too heavy to lift: walk to shove it · G / right-click to let go'
        : 'Carrying · wheel = closer/further · release to throw · G / right-click to drop';
    if (this.nearestToppled()) return 'R — stand it back up · G — grab';
    return '';
  }

  isToy(o: PhysObj): boolean {
    return TOYS.has(o.kind);
  }
}

function rot(o: PhysObj): THREE.Quaternion {
  const r = o.body.rotation();
  return new THREE.Quaternion(r.x, r.y, r.z, r.w);
}

function up(o: PhysObj): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(rot(o));
}

const validPose = (a: unknown): boolean => Array.isArray(a) && a.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Inside the bedroom or the garage (with a margin), above the floor and below the ceiling. */
export function inside(p: THREE.Vector3Like, margin = 0.35): boolean {
  return insideAny(p, margin);
}
