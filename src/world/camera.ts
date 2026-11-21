import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Settings } from '@/sim/types';
import type { Physics } from './physics';
import type { Avatar } from './avatar';
import { clampCamera } from './garage/areas';

/* ------------------------------------------------------------------ pure camera math (unit-tested) */

export type CamMode = 'third' | 'first';

/** Where the player looks. `pitch` > 0 looks down; `dist` is the third-person boom length. */
export interface LookState {
  yaw: number;
  pitch: number;
  dist: number;
}

/** Pitch limits per mode (radians). */
export const PITCH: Record<CamMode, readonly [number, number]> = { third: [-0.6, 1.25], first: [-1.45, 1.45] };
/** Third-person boom length limits (metres). */
export const DIST = { min: 1.0, max: 4.2 } as const;
/** Radians of turn per pixel of mouse movement at sensitivity 1. */
export const BASE_SENS = 0.0024;
/** Ignore single mouse events bigger than this (browsers emit spikes on pointer-lock changes). */
export const MAX_MOUSE_STEP = 250;
/** Eye height above the avatar body centre (the floor is 0.65 below it). */
export const EYE_HEIGHT = 0.66;
/** Third-person pivot (roughly the neck) above the avatar body centre. */
export const PIVOT_HEIGHT = 0.55;
/** Over-the-shoulder sideways offset. */
export const SHOULDER = 0.32;
/** Keep the camera this far from whatever it collided with. */
export const COLLIDE_PAD = 0.08;
export const CAM_RADIUS = 0.14;

export const nextMode = (m: CamMode): CamMode => (m === 'first' ? 'third' : 'first');

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Apply one raw mouse delta (pixels) to the look state. Returns false if the event was a spike and ignored. */
export function applyLook(s: LookState, dx: number, dy: number, sens: number, invertY: boolean, mode: CamMode): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > MAX_MOUSE_STEP || Math.abs(dy) > MAX_MOUSE_STEP) return false;
  const k = BASE_SENS * sens;
  s.yaw = wrapAngle(s.yaw - dx * k);
  const [lo, hi] = PITCH[mode];
  s.pitch = clamp(s.pitch + (invertY ? -dy : dy) * k, lo, hi);
  return true;
}

/** Re-clamp pitch after a mode change. */
export function clampPitch(s: LookState, mode: CamMode): void {
  const [lo, hi] = PITCH[mode];
  s.pitch = clamp(s.pitch, lo, hi);
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  a = ((a % t) + t) % t;
  return a > Math.PI ? a - t : a;
}

/** Mouse wheel zoom of the third-person boom. */
export function zoomDist(dist: number, deltaY: number): number {
  return clamp(dist * (1 + Math.sign(deltaY) * 0.1), DIST.min, DIST.max);
}

/** Frame-rate independent smoothing: fraction to move toward the target this frame for a given half-life. */
export function smoothFactor(dt: number, halfLife: number): number {
  if (halfLife <= 0) return 1;
  return 1 - Math.pow(2, -Math.max(0, dt) / halfLife);
}

/**
 * Camera collision: the boom length allowed when a sweep from the pivot hit something
 * `hit` metres away (null = nothing hit). Never longer than desired, never shorter than `min`.
 */
export function collideDist(desired: number, hit: number | null, pad = COLLIDE_PAD, min = 0.2): number {
  if (hit === null || hit >= desired) return desired;
  return clamp(hit - pad, Math.min(min, desired), desired);
}

/** Boom length this frame: snap in instantly when blocked, ease back out when the way clears. */
export function boomStep(current: number, allowed: number, dt: number, outHalfLife = 0.12): number {
  if (allowed <= current) return allowed;
  return current + (allowed - current) * smoothFactor(dt, outHalfLife);
}

/** Unit look direction for a yaw/pitch (pitch > 0 looks down). */
export function lookDir(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * c, -Math.sin(pitch), -Math.cos(yaw) * c);
}

/** Distance from a screen at which it fills the view (focus mode). */
export function focusDistance(w: number, h: number, fovDeg: number, aspect: number, margin = 1.14): number {
  const tan = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  return Math.max(h / 2 / tan, w / 2 / (tan * aspect)) * margin;
}

/** Avatar facing (see Avatar.facing) that looks along the camera yaw. */
export const facingForYaw = (yaw: number): number => wrapAngle(yaw + Math.PI);

/* ------------------------------------------------------------------ camera rig */

/** A screen the camera can zoom onto (focus mode). */
export interface FocusTarget {
  mesh: THREE.Object3D;
  w: number;
  h: number;
}

export interface CameraHost {
  readonly camera: THREE.PerspectiveCamera;
  readonly avatar: Avatar;
  readonly phys: Physics;
  settings(): Settings;
  /** Body currently carried by the player (ignored by camera collision). */
  heldBody(): RAPIER.RigidBody | null;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4();

/**
 * First / third-person camera. Mouse look writes `look` directly (no rotational lag);
 * only the follow point is smoothed, to hide physics stair-stepping. The third-person
 * boom sweeps a small sphere against the physics world so it never goes through walls
 * or furniture, and is clamped to the room/garage boxes on top.
 */
export class CameraRig {
  readonly look: LookState = { yaw: 0, pitch: 0.32, dist: 2.4 };
  mode: CamMode = 'third';
  /** 0 = free camera, 1 = fully zoomed onto a screen. */
  focusBlend = 0;
  /** Current (collided) third-person boom length. */
  boom = 2.4;
  private pivot = new THREE.Vector3();
  private pivotReady = false;
  private bobT = 0;
  private freePos = new THREE.Vector3();
  private freeQuat = new THREE.Quaternion();
  private dir = new THREE.Vector3();

  constructor(private readonly h: CameraHost) {}

  setMode(m: CamMode): void {
    if (m === this.mode) return;
    this.mode = m;
    clampPitch(this.look, m);
    if (m === 'third') this.boom = Math.min(this.boom, 0.6);
    this.pivotReady = false;
  }

  turn(dx: number, dy: number): void {
    const s = this.h.settings();
    applyLook(this.look, dx, dy, s.mouseSens ?? 1, !!s.invertY, this.mode);
  }

  zoom(deltaY: number): void {
    this.look.dist = zoomDist(this.look.dist, deltaY);
  }

  /** Where the eye would be in first person (also used to hold things in front of you). */
  eye(out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.h.avatar.position;
    return out.set(p.x, p.y + EYE_HEIGHT, p.z);
  }

  /** Free (non-focus) camera pose this frame. */
  private updateFree(dt: number): void {
    const av = this.h.avatar;
    const s = this.h.settings();
    const raw = av.position;
    const first = this.mode === 'first';
    raw.y += first ? EYE_HEIGHT : PIVOT_HEIGHT;
    if (!this.pivotReady || this.pivot.distanceToSquared(raw) > 4) {
      this.pivot.copy(raw);
      this.pivotReady = true;
    } else {
      // Horizontal follow is tight; vertical a little softer (jumps, landing, physics steps).
      const kh = smoothFactor(dt, first ? 0.018 : 0.035);
      const kv = smoothFactor(dt, first ? 0.04 : 0.06);
      this.pivot.x += (raw.x - this.pivot.x) * kh;
      this.pivot.z += (raw.z - this.pivot.z) * kh;
      this.pivot.y += (raw.y - this.pivot.y) * kv;
    }
    const dir = lookDir(this.look.yaw, this.look.pitch, this.dir);
    const pos = this.freePos;
    if (first) {
      pos.copy(this.pivot);
      // Step forward so the eye sits at the face, not the middle of the skull; lean
      // out further when looking down so you see your feet rather than the inside of your hoodie.
      const lean = 0.06 + 0.12 * Math.max(0, Math.sin(this.look.pitch));
      pos.x += -Math.sin(this.look.yaw) * lean;
      pos.z += -Math.cos(this.look.yaw) * lean;
      if (s.headBob && !s.reducedMotion) {
        const v = av.body.linvel();
        const sp = Math.hypot(v.x, v.z);
        this.bobT += dt * sp * 4.2;
        pos.y += Math.sin(this.bobT * 2) * 0.018 * Math.min(1, sp / 2);
      }
      this.pushOut(this.pivot, pos);
      clampCamera(pos, this.pivot);
    } else {
      // Over the shoulder: first slide to the shoulder, then back along the view.
      const right = new THREE.Vector3(Math.cos(this.look.yaw), 0, -Math.sin(this.look.yaw));
      const shoulder = this.pivot.clone().addScaledVector(right, collideDist(SHOULDER, this.sweep(this.pivot, right, SHOULDER), COLLIDE_PAD, 0));
      const back = this.dir.clone().negate();
      const allowed = collideDist(this.look.dist, this.sweep(shoulder, back, this.look.dist), COLLIDE_PAD, 0.25);
      this.boom = boomStep(this.boom, allowed, dt);
      pos.copy(shoulder).addScaledVector(back, this.boom);
      const before = pos.clone();
      clampCamera(pos, this.pivot);
      // The room clamp may have moved it; keep the boom in sync so easing out does not overshoot.
      if (before.distanceToSquared(pos) > 1e-6) this.boom = Math.min(this.boom, pos.distanceTo(shoulder));
    }
    this.freeQuat.setFromRotationMatrix(tmpM.lookAt(pos, pos.clone().add(dir), UP));
  }

  /** Sphere sweep from `from` along unit `dir`; distance to the first blocker or null. */
  private sweep(from: THREE.Vector3, dir: THREE.Vector3, max: number): number | null {
    const { R, world } = this.h.phys;
    const avatar = this.h.avatar.body;
    const held = this.h.heldBody();
    const hit = world.castShape(
      from,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      new R.Ball(CAM_RADIUS),
      0,
      max,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => {
        if (c.isSensor()) return false;
        const b = c.parent();
        if (!b) return true;
        if (b.handle === avatar.handle || (held && b.handle === held.handle)) return false;
        // Small loose stuff (coins, ducks, mugs) should not shove the camera around.
        return !(b.isDynamic() && b.mass() < 4);
      },
    );
    return hit ? hit.time_of_impact : null;
  }

  /** First person: if the eye ended up inside something, pull it back toward the body centre line. */
  private pushOut(pivot: THREE.Vector3, pos: THREE.Vector3): void {
    const d = pos.clone().sub(pivot);
    const len = d.length();
    if (len < 1e-4) return;
    d.divideScalar(len);
    const hit = this.sweep(pivot, d, len + 0.05);
    if (hit !== null) pos.copy(pivot).addScaledVector(d, Math.max(0, hit - 0.05));
  }

  /** Per frame: place the camera (free, or blending to/from the focused screen). */
  update(dt: number, focus: FocusTarget | null, last: FocusTarget | null): void {
    const cam = this.h.camera;
    const fov = clamp(this.h.settings().fov ?? 60, 40, 100);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.updateFree(dt);
    const target = focus ? 1 : 0;
    this.focusBlend += Math.sign(target - this.focusBlend) * Math.min(Math.abs(target - this.focusBlend), dt * 2.2);
    const s = focus ?? last;
    if (this.focusBlend <= 0 || !s) {
      cam.position.copy(this.freePos);
      cam.quaternion.copy(this.freeQuat);
      return;
    }
    const center = s.mesh.getWorldPosition(new THREE.Vector3());
    const q = s.mesh.getWorldQuaternion(new THREE.Quaternion());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const fp = center.addScaledVector(normal, focusDistance(s.w, s.h, cam.fov, cam.aspect));
    const b = this.focusBlend;
    const t = b * b * (3 - 2 * b);
    cam.position.lerpVectors(this.freePos, fp, t);
    cam.quaternion.slerpQuaternions(this.freeQuat, q, t);
  }

  /** How visible the local avatar should be from this camera. */
  avatarView(): 'full' | 'headless' | 'hidden' {
    if (this.mode === 'first') return 'headless';
    return this.boom < 0.45 && this.focusBlend < 0.5 ? 'hidden' : 'full';
  }
}
