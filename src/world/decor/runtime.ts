import * as THREE from 'three';
import type { PhysObj } from '../physics';
import type { Behavior } from './types';
import { decorSound } from './sound';

/**
 * Per-frame driver for decor behaviours. Props register themselves when they
 * are built; entries whose mesh left the scene are dropped automatically.
 */

interface Live {
  obj: PhysObj;
  fx: Behavior[];
  light?: THREE.PointLight;
  lightBase: number;
  age: number;
  /** Wall items are blu-tacked: no gravity until something knocks them. */
  stuck: boolean;
  gravity: number;
  base: Map<THREE.Object3D, { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }>;
  wob: { x: number; z: number; vx: number; vz: number };
  lastVel: THREE.Vector3;
  hauntT: number;
  singT: number;
  roamTurn: number;
}

const live: Live[] = [];
export const LIGHT_BUDGET = 5;
let lights = 0;

export function lightAvailable(): boolean {
  return lights < LIGHT_BUDGET;
}

export function registerDecor(obj: PhysObj, fx: Behavior[], opts: { light?: THREE.PointLight; stuck?: boolean }): void {
  if (opts.light) lights++;
  const float = fx.find((f): f is Extract<Behavior, { k: 'float' }> => f.k === 'float');
  const e: Live = {
    obj, fx, light: opts.light, lightBase: opts.light?.intensity ?? 0, age: 0, stuck: !!opts.stuck,
    gravity: float?.gravity ?? 1, base: new Map(), wob: { x: 0, z: 0, vx: 0, vz: 0 }, lastVel: new THREE.Vector3(),
    hauntT: 3 + Math.random() * 6, singT: 0, roamTurn: 0,
  };
  for (const f of fx) if ('node' in f && f.node) e.base.set(f.node, { p: f.node.position.clone(), r: f.node.rotation.clone(), s: f.node.scale.clone() });
  live.push(e);
  applyGravity(e, 1);
}

function applyGravity(e: Live, cosmeticGravity: number): void {
  e.obj.body.setGravityScale(e.stuck ? 0 : e.gravity * cosmeticGravity, true);
}

/** Cosmetic patches reset gravity on every prop; restore decor-specific gravity afterwards. */
export function reapplyDecorGravity(cosmeticGravity: number): void {
  for (const e of live) applyGravity(e, cosmeticGravity);
}

export function decorCount(): number {
  return live.length;
}

const tmpV = new THREE.Vector3();
const up = new THREE.Vector3();
let cleanT = 0;

export function tickDecor(dt: number, time: number, opts: { reducedMotion: boolean; cosmeticGravity: number }): void {
  cleanT += dt;
  if (cleanT > 1) {
    cleanT = 0;
    for (let i = live.length - 1; i >= 0; i--)
      if (!live[i]!.obj.mesh.parent) {
        if (live[i]!.light) lights--;
        live.splice(i, 1);
      }
  }
  const motion = opts.reducedMotion ? 0.25 : 1;
  for (const e of live) {
    e.age += dt;
    const body = e.obj.body;
    const lv = body.linvel();
    tmpV.set(lv.x, lv.y, lv.z);
    const dv = tmpV.distanceTo(e.lastVel);
    const dvx = tmpV.x - e.lastVel.x;
    const dvz = tmpV.z - e.lastVel.z;
    e.lastVel.copy(tmpV);
    const impact = e.age > 1.5 && dv > 1.1;
    if (e.stuck && e.age > 0.5) {
      const av = body.angvel();
      if (tmpV.length() > 0.25 || Math.hypot(av.x, av.y, av.z) > 0.8) {
        e.stuck = false;
        applyGravity(e, opts.cosmeticGravity);
      } else if (!body.isSleeping()) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      }
    }
    for (const f of e.fx) {
      const b = 'node' in f && f.node ? e.base.get(f.node) : undefined;
      switch (f.k) {
        case 'spin':
          f.node.rotation[f.axis] += f.speed * dt * motion;
          break;
        case 'bob':
          f.node.position[f.axis ?? 'y'] = b!.p[f.axis ?? 'y'] + Math.sin((time * f.freq * Math.PI * 2 + (f.phase ?? 0)) * motion) * f.amp;
          break;
        case 'sway': {
          let s = Math.sin(time * f.freq * Math.PI * 2 * motion + (f.phase ?? 0));
          if (f.half) s = Math.max(0, s) * f.half;
          f.node.rotation[f.axis] = b!.r[f.axis] + s * f.amp;
          break;
        }
        case 'swim': {
          const ph = time * f.freq * Math.PI * 2 * motion + (f.phase ?? 0);
          f.node.position.x = b!.p.x + Math.sin(ph) * f.amp;
          f.node.rotation.y = Math.cos(ph) >= 0 ? 0 : Math.PI;
          break;
        }
        case 'pulse': {
          const v = f.base + Math.sin(time * f.freq * Math.PI * 2) * f.amp;
          f.mat.emissiveIntensity = v;
          if (e.light) e.light.intensity = e.lightBase * (v / f.base);
          break;
        }
        case 'flicker': {
          const n = 0.82 + 0.1 * Math.sin(time * 23.1) + 0.08 * Math.sin(time * 37.7 + 1.3);
          f.mat.emissiveIntensity = f.base * n;
          if (e.light) e.light.intensity = e.lightBase * n;
          break;
        }
        case 'hue': {
          const h = (time * f.speed + (f.phase ?? 0)) % 1;
          if (f.mat) {
            f.mat.color.setHSL(h, f.sat ?? 0.8, 0.5);
            f.mat.emissive.setHSL(h, f.sat ?? 0.8, 0.5);
          }
          if (f.light && e.light) e.light.color.setHSL(h, f.sat ?? 0.8, 0.6);
          break;
        }
        case 'thump': {
          const beat = (time * f.bpm) / 60;
          const k = Math.pow(Math.max(0, Math.sin(beat * Math.PI * 2)), 6) * 0.12 * motion;
          f.node.scale.set(b!.s.x * (1 + k), b!.s.y * (1 + k), b!.s.z * (1 + k));
          break;
        }
        case 'wobble': {
          const w = e.wob;
          w.vx += -dvz * 6 * (f.amp ?? 0.4);
          w.vz += dvx * 6 * (f.amp ?? 0.4);
          const k = 140;
          const c = 3.5;
          w.vx += (-k * w.x - c * w.vx) * dt;
          w.vz += (-k * w.z - c * w.vz) * dt;
          w.x = THREE.MathUtils.clamp(w.x + w.vx * dt, -0.6, 0.6);
          w.z = THREE.MathUtils.clamp(w.z + w.vz * dt, -0.6, 0.6);
          f.node.rotation.x = b!.r.x + w.x + Math.sin(time * 2.1) * 0.03 * motion;
          f.node.rotation.z = b!.r.z + w.z;
          break;
        }
        case 'squeak':
          if (impact) decorSound.squeak(f.pitch);
          break;
        case 'sing':
          if (impact && e.singT <= 0) {
            e.singT = 1.9;
            decorSound.jingle();
          }
          if (e.singT > 0) {
            e.singT -= dt;
            if (f.node) f.node.rotation.y = Math.sin(time * 18) * 0.5;
            if (f.mouth) f.mouth.scale.y = 1 + Math.abs(Math.sin(time * 12)) * 1.5;
          } else {
            if (f.node) f.node.rotation.y = 0;
            if (f.mouth) f.mouth.scale.y = 1;
          }
          break;
        case 'haunt':
          if (opts.reducedMotion || e.stuck) break;
          haunt(e, f, dt);
          break;
        case 'float':
          break;
      }
    }
  }
}

function haunt(e: Live, f: Extract<Behavior, { k: 'haunt' }>, dt: number): void {
  const body = e.obj.body;
  up.set(0, 1, 0).applyQuaternion(e.obj.mesh.quaternion);
  const m = body.mass();
  if (f.mode === 'roam') {
    if (up.y < 0.8) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(e.obj.mesh.quaternion);
    fwd.y = 0;
    const speed = Math.hypot(body.linvel().x, body.linvel().z);
    if (speed < 0.35) body.applyImpulse({ x: fwd.x * m * 1.2 * dt, y: 0, z: fwd.z * m * 1.2 * dt }, true);
    e.hauntT -= dt;
    if (e.hauntT <= 0 || (speed < 0.05 && e.age > 3 && Math.random() < dt * 0.8)) {
      e.hauntT = f.interval * (0.5 + Math.random());
      e.roamTurn = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 1.5);
    }
    const av = body.angvel();
    body.setAngvel({ x: av.x, y: e.roamTurn * 0.6, z: av.z }, true);
    e.roamTurn *= Math.pow(0.3, dt);
    return;
  }
  e.hauntT -= dt;
  if (e.hauntT > 0) return;
  e.hauntT = f.interval * (0.6 + Math.random() * 0.8);
  const lv = body.linvel();
  if (Math.hypot(lv.x, lv.y, lv.z) > 0.3) return;
  if (f.mode === 'hop') {
    if (up.y < 0.7) {
      // Self-righting: a little twist back upright.
      body.applyImpulse({ x: 0, y: m * 2.2, z: 0 }, true);
      body.setAngvel({ x: -up.z * 5, y: 0, z: up.x * 5 }, true);
      return;
    }
    const a = Math.random() * Math.PI * 2;
    body.applyImpulse({ x: Math.cos(a) * m * 0.5, y: m * 2.2, z: Math.sin(a) * m * 0.5 }, true);
    body.setAngvel({ x: 0, y: (Math.random() - 0.5) * 6, z: 0 }, true);
    decorSound.squeak(0.5);
  } else {
    const a = Math.random() * Math.PI * 2;
    body.setAngvel({ x: Math.cos(a) * 1.4, y: 0, z: Math.sin(a) * 1.4 }, true);
  }
}
