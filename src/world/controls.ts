import * as THREE from 'three';
import type { PhysObj, Physics } from './physics';
import type { Avatar } from './avatar';
import { DOOR, ROOM } from './room';

/* ------------------------------------------------------------------ crosshair aim */

/** What the crosshair is on. */
export type AimHit =
  | { kind: 'screen'; index: number; obj: PhysObj; point: THREE.Vector3; dist: number }
  | { kind: 'prop'; obj: PhysObj; point: THREE.Vector3; dist: number }
  | { kind: 'door'; point: THREE.Vector3; dist: number };

/** How close (to the avatar) a screen / a prop must be to use / grab it. */
export const SCREEN_REACH = 2.6;
export const GRAB_REACH = 2.2;

export interface AimHost {
  readonly camera: THREE.PerspectiveCamera;
  readonly phys: Physics;
  readonly avatar: Avatar;
  /** Physics objects that carry a TycoonOS screen, in screen order. */
  screenObjs(): PhysObj[];
  heldObj(): PhysObj | null;
}

const fwd = new THREE.Vector3();

/** Cast the centre-of-view ray into the physics world and classify what it lands on. */
export function aimAt(h: AimHost, extra = 0): AimHit | null {
  const { R, world, objs } = h.phys;
  const cam = h.camera;
  cam.getWorldDirection(fwd);
  const avatarPos = h.avatar.position;
  const avatar = h.avatar.body;
  const held = h.heldObj()?.body;
  const max = cam.position.distanceTo(avatarPos) + SCREEN_REACH + extra;
  const hit = world.castRay(new R.Ray(cam.position, fwd), max, true, undefined, undefined, undefined, undefined, (c) => {
    if (c.isSensor()) return false;
    const b = c.parent();
    return !b || (b.handle !== avatar.handle && b.handle !== held?.handle);
  });
  if (!hit) return null;
  const point = cam.position.clone().addScaledVector(fwd, hit.timeOfImpact);
  const dist = point.distanceTo(avatarPos);
  const body = hit.collider.parent();
  const obj = body ? objs.find((o) => o.body.handle === body.handle) : undefined;
  if (obj) {
    const index = h.screenObjs().indexOf(obj);
    if (index >= 0 && dist <= SCREEN_REACH) return { kind: 'screen', index, obj, point, dist };
    if (obj.kind !== 'avatar' && obj.body.isDynamic() && dist <= GRAB_REACH) return { kind: 'prop', obj, point, dist };
    return null;
  }
  if (dist <= SCREEN_REACH && Math.abs(point.x - DOOR.x) < DOOR.w / 2 + 0.05 && Math.abs(point.z - ROOM.hz) < 0.25 && point.y < DOOR.h) {
    return { kind: 'door', point, dist };
  }
  return null;
}

/* ------------------------------------------------------------------ input */

/** High-level actions the input layer triggers on the world. */
export interface ControlActions {
  readonly canvas: HTMLCanvasElement;
  /** A TycoonOS screen is zoomed in (normal cursor, clicks go to the screen). */
  focused(): boolean;
  /** Raw mouse look in pixels. */
  look(dx: number, dy: number): void;
  /** Gameplay key pressed (not in a text field). */
  key(code: string): void;
  /** Mouse button pressed in the 3D view. `crosshair` = target the centre of view, else the cursor. */
  worldDown(e: PointerEvent, crosshair: boolean): boolean;
  worldUp(e: PointerEvent): boolean;
  /** Short click in the 3D view that nothing else used. */
  worldClick(e: PointerEvent, crosshair: boolean): void;
  /** Focus mode: cursor moves / clicks on the screen; `click` on nothing steps back. */
  screenMove(e: PointerEvent): void;
  screenClick(e: PointerEvent): void;
  wheel(deltaY: number): void;
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/**
 * Keyboard + mouse. Mouse look uses Pointer Lock (click the view to capture, Esc
 * releases). When pointer lock is unavailable (or on touch) dragging the view turns
 * the camera instead, and clicks target the cursor rather than the crosshair.
 */
export class Controls {
  readonly keys = new Set<string>();
  /** Pointer lock can be used here (desktop browser, not refused). */
  lockable: boolean;
  private drag: { x: number; y: number; moved: boolean; button: number; look: boolean } | null = null;
  /** The press that requested pointer lock: swallow its release. */
  private capturePress = false;
  private lockErrors = 0;
  private unlockedAt = -1e9;
  private pendingClick: PointerEvent | null = null;

  constructor(private readonly a: ControlActions) {
    const c = a.canvas;
    this.lockable = typeof c.requestPointerLock === 'function' && !matchMedia?.('(pointer: coarse)').matches;
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.reset());
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) {
        this.unlockedAt = performance.now();
        this.keys.clear();
      } else this.lockErrors = 0;
    });
    document.addEventListener('pointerlockerror', () => {
      // Re-locking right after the user pressed Esc is refused by browsers; that is not a real failure.
      if (performance.now() - this.unlockedAt > 1500 && ++this.lockErrors >= 2) this.lockable = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked && !a.focused()) a.look(e.movementX, e.movementY);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', () => (this.drag = null));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        a.wheel(e.deltaY);
      },
      { passive: false },
    );
  }

  get locked(): boolean {
    return document.pointerLockElement === this.a.canvas;
  }

  /** Movement axes from WASD / arrows: forward (+1 = W) and right (+1 = D). */
  axes(): { f: number; r: number } {
    const k = this.keys;
    return {
      f: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      r: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
    };
  }

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get jump(): boolean {
    return this.keys.has('Space');
  }

  /** Try to capture the mouse (needs a recent click/keypress; failures are harmless). */
  capture(): void {
    if (!this.lockable || this.locked || this.a.focused()) return;
    const c = this.a.canvas;
    try {
      // Raw (unaccelerated) input where supported; fall back to a plain lock.
      const p = (c.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined)({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function')
        p.catch((err: unknown) => {
          if ((err as { name?: string })?.name === 'NotSupportedError') c.requestPointerLock()?.catch?.(() => {});
        });
    } catch {
      /* not allowed right now */
    }
  }

  release(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Forget held keys and drags (window lost focus, tab hidden, UI took over). */
  reset(): void {
    this.keys.clear();
    this.drag = null;
    this.pendingClick = null;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (isTyping(e.target)) return;
    this.keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) this.a.key(e.code);
  }

  private onDown(e: PointerEvent): void {
    const a = this.a;
    if (a.focused()) {
      this.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button, look: false };
      return;
    }
    if (this.locked) {
      if (!a.worldDown(e, true) && e.button === 0) this.pendingClick = e;
      return;
    }
    if (this.lockable && e.pointerType === 'mouse' && e.button === 0) {
      this.capturePress = true;
      this.capture();
      return;
    }
    // Fallback: drag to look (right mouse always; left mouse unless it grabbed something).
    const grabbed = a.worldDown(e, false);
    this.drag = { x: e.clientX, y: e.clientY, moved: grabbed, button: e.button, look: !grabbed };
    try {
      a.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  }

  private onMove(e: PointerEvent): void {
    const a = this.a;
    if (a.focused()) {
      a.screenMove(e);
      return;
    }
    const d = this.drag;
    if (!d || this.locked) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved && d.look) {
      a.look(dx, dy);
      d.x = e.clientX;
      d.y = e.clientY;
    }
  }

  private onUp(e: PointerEvent): void {
    const a = this.a;
    const d = this.drag;
    this.drag = null;
    if (this.capturePress) {
      this.capturePress = false;
      return;
    }
    if (a.focused()) {
      if (d && !d.moved) a.screenClick(e);
      return;
    }
    if (a.worldUp(e)) return;
    if (this.locked) {
      if (this.pendingClick && e.button === 0) a.worldClick(e, true);
      this.pendingClick = null;
      return;
    }
    if (d && !d.moved && d.button === 0) a.worldClick(e, false);
  }
}
