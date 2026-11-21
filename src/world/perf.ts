import * as THREE from 'three';

/*
 * Performance utilities: frame statistics, an optional GPU timer, the adaptive
 * quality controller (dynamic resolution + Auto preset), a fixed-size point
 * light pool, and per-preset scene tweaks (shadow casters, glass).
 *
 * Rule of thumb for this file: nothing here may change the number/kind of
 * lights or material defines at runtime unless the user changes the preset by
 * hand, because that recompiles every lit shader (seconds on D3D/ANGLE).
 */

/* ------------------------------------------------------------------ frame stats */

/** Ring buffer of recent frame intervals (ms). */
export class FrameStats {
  private readonly buf: Float32Array;
  private i = 0;
  private n = 0;
  constructor(size = 240) {
    this.buf = new Float32Array(size);
  }
  push(ms: number): void {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
  }
  clear(): void {
    this.n = 0;
    this.i = 0;
  }
  get count(): number {
    return this.n;
  }
  /** Average over the last `k` frames. */
  avg(k = this.n): number {
    k = Math.min(k, this.n);
    if (!k) return 0;
    let s = 0;
    for (let j = 1; j <= k; j++) s += this.buf[(this.i - j + this.buf.length) % this.buf.length]!;
    return s / k;
  }
  max(k = this.n): number {
    k = Math.min(k, this.n);
    let m = 0;
    for (let j = 1; j <= k; j++) m = Math.max(m, this.buf[(this.i - j + this.buf.length) % this.buf.length]!);
    return m;
  }
  /** Fraction of the last `k` frames slower than `ms`. */
  over(ms: number, k = this.n): number {
    k = Math.min(k, this.n);
    if (!k) return 0;
    let c = 0;
    for (let j = 1; j <= k; j++) if (this.buf[(this.i - j + this.buf.length) % this.buf.length]! > ms) c++;
    return c / k;
  }
}

/* ------------------------------------------------------------------ GPU timer */

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

/** GPU frame time via EXT_disjoint_timer_query_webgl2 when the browser exposes it. */
export class GpuTimer {
  private readonly ext: TimerExt | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  /** Smoothed GPU ms, or -1 when unavailable. */
  ms = -1;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }
  get available(): boolean {
    return !!this.ext;
  }
  begin(): void {
    if (!this.ext || this.active || this.pending.length > 3) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }
  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    const gl = this.gl;
    while (this.pending.length) {
      const q = this.pending[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) {
        const ms = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
        this.ms = this.ms < 0 ? ms : this.ms * 0.9 + ms * 0.1;
      }
      gl.deleteQuery(q);
    }
  }
}

/* ------------------------------------------------------------------ adaptive quality */

export type TunerLevel = 'low' | 'medium' | 'high';
const TUNER_LEVELS: TunerLevel[] = ['low', 'medium', 'high'];

export interface TunerState {
  level: TunerLevel;
  scale: number;
}

/**
 * Keeps frame time under budget. Render scale moves in 0.05 steps between
 * `minScale` and 1; when `auto`, the preset level moves too (low..high).
 * Downgrades are quick (sustained misses), upgrades are slow and remembered:
 * a step that failed is banned with exponential back-off, so it never
 * oscillates.
 */
export class AutoTuner {
  level: TunerLevel = 'medium';
  scale = 1;
  auto = true;
  minScale = 0.6;
  /** Frame budget in ms (60 fps). */
  budget = 1000 / 60;
  private readonly stats = new FrameStats(180);
  private cooldown = 3;
  private stable = 0;
  private bans = new Map<string, { until: number; strikes: number }>();
  private probe: { key: string; t: number; back: TunerState } | null = null;
  private time = 0;
  /** Bumped whenever level or scale changes. */
  version = 0;

  reset(level: TunerLevel, auto: boolean, minScale: number): void {
    this.level = level;
    this.auto = auto;
    this.minScale = minScale;
    this.scale = auto ? 0.9 : 1;
    this.stats.clear();
    this.cooldown = 3;
    this.stable = 0;
    this.probe = null;
    this.version++;
  }

  /** Call once per frame with the real frame interval (ms) and the GPU ms (-1 = unknown). */
  frame(intervalMs: number, gpuMs: number, hidden: boolean): void {
    if (hidden || intervalMs > 500) {
      this.stats.clear();
      this.cooldown = Math.max(this.cooldown, 1);
      return;
    }
    const dt = intervalMs / 1000;
    this.time += dt;
    this.stats.push(intervalMs);
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return;
    }
    if (this.stats.count < 60) return;
    const avg = this.stats.avg(90);
    const slow = this.stats.over(this.budget * 1.6, 90);
    const overloaded = avg > this.budget * 1.12 || slow > 0.12;
    if (overloaded) {
      if (this.probe && this.time - this.probe.t < 6) {
        // The last upgrade did not hold: undo it and ban it for a while.
        this.ban(this.probe.key);
        this.set(this.probe.back.level, this.probe.back.scale);
        this.probe = null;
        return;
      }
      this.probe = null;
      this.stable = 0;
      if (this.scale > this.minScale + 1e-3) this.set(this.level, Math.max(this.minScale, this.scale - (avg > this.budget * 1.5 ? 0.15 : 0.1)));
      else if (this.auto && this.level !== 'low') {
        const next = TUNER_LEVELS[TUNER_LEVELS.indexOf(this.level) - 1]!;
        // Leaving Low recompiles scene shaders: once we had to go there, stay for the session.
        if (next === 'low') this.bans.set('medium', { until: Infinity, strikes: 99 });
        this.set(next, 0.85);
      }
      return;
    }
    // Comfortably on budget: consider an upgrade after a calm period.
    if (avg < this.budget * 1.04 && slow < 0.03) this.stable += dt;
    else this.stable = 0;
    const gpuKnown = gpuMs >= 0;
    const headroom = gpuKnown ? gpuMs < this.budget * (this.scale < 1 ? 0.7 : 0.5) : true;
    if (this.stable < (gpuKnown ? 3 : 8) || !headroom) return;
    this.stable = 0;
    const back = { level: this.level, scale: this.scale };
    if (this.scale < 1 - 1e-3) {
      const key = `${this.level}@${(this.scale + 0.05).toFixed(2)}`;
      if (this.banned(key)) return;
      this.set(this.level, Math.min(1, this.scale + 0.05));
      this.probe = { key, t: this.time, back };
    } else if (this.auto && this.level !== 'high') {
      const next = TUNER_LEVELS[TUNER_LEVELS.indexOf(this.level) + 1]!;
      if (this.banned(next)) return;
      this.set(next, 0.85);
      this.probe = { key: next, t: this.time, back };
    }
  }

  private set(level: TunerLevel, scale: number): void {
    scale = Math.round(scale * 20) / 20;
    if (level === this.level && Math.abs(scale - this.scale) < 1e-3) return;
    this.level = level;
    this.scale = scale;
    this.version++;
    this.stats.clear();
    this.cooldown = 2;
  }

  private banned(key: string): boolean {
    const b = this.bans.get(key);
    return !!b && this.time < b.until;
  }

  private ban(key: string): void {
    const b = this.bans.get(key) ?? { until: 0, strikes: 0 };
    b.strikes++;
    b.until = this.time + 30 * 2 ** Math.min(5, b.strikes - 1);
    this.bans.set(key, b);
  }
}

/* ------------------------------------------------------------------ light pool */

/** Lights on this layer are never seen by any camera: they only feed the pool. */
export const VIRTUAL_LIGHT_LAYER = 30;
export const POOL_SIZE = 4;

const virtualLights = new Set<THREE.PointLight>();

/** Hand a decor/prop point light to the pool (it stops being a real light). */
export function virtualizeLight(l: THREE.PointLight): void {
  if (l.userData.realLight || virtualLights.has(l)) return;
  l.layers.set(VIRTUAL_LIGHT_LAYER);
  virtualLights.add(l);
}

function rootedVisible(o: THREE.Object3D): boolean {
  let n: THREE.Object3D | null = o;
  for (; n; n = n.parent) {
    if (!n.visible) return false;
    if (!n.parent) return (n as THREE.Scene).isScene === true;
  }
  return false;
}

/**
 * A fixed number of real point lights that take over the most relevant
 * virtual lights each frame. The real light count never changes, so buying
 * a lava lamp or walking into the garage never recompiles shaders.
 */
export class LightPool {
  readonly slots: { light: THREE.PointLight; src: THREE.PointLight | null; fade: number }[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly sphere = new THREE.Sphere();
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly ranked: { l: THREE.PointLight; s: number }[] = [];
  /** Number of virtual lights currently competing (for the overlay). */
  candidates = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 1, 2);
      light.userData.realLight = true;
      light.userData.pool = true;
      light.name = 'perf-pool-light';
      scene.add(light);
      this.slots.push({ light, src: null, fade: 0 });
    }
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const ranked = this.ranked;
    ranked.length = 0;
    for (const l of virtualLights) {
      if (!l.parent) {
        // Detached and never coming back (removed decor): forget it.
        if (!l.userData.everRooted) continue;
        virtualLights.delete(l);
        continue;
      }
      if (!rootedVisible(l) || l.intensity <= 0) continue;
      l.userData.everRooted = true;
      l.getWorldPosition(this.tmp);
      const range = l.distance > 0 ? l.distance : 4;
      this.sphere.set(this.tmp, range);
      const inView = this.frustum.intersectsSphere(this.sphere);
      const d = this.tmp.distanceTo(focus);
      ranked.push({ l, s: (l.intensity / (1 + d * d)) * (inView ? 1 : 0.15) });
    }
    this.candidates = ranked.length;
    ranked.sort((a, b) => b.s - a.s);
    if (ranked.length > POOL_SIZE) ranked.length = POOL_SIZE;
    const k = Math.min(1, dt * 6);
    // Keep current assignments that are still wanted; fade out the rest, then reuse them.
    for (const slot of this.slots) {
      const want = slot.src && ranked.some((r) => r.l === slot.src);
      slot.fade = want ? Math.min(1, slot.fade + k) : Math.max(0, slot.fade - k);
      if (!want && slot.fade <= 0) slot.src = null;
    }
    for (const r of ranked) {
      if (this.slots.some((s) => s.src === r.l)) continue;
      const free = this.slots.find((s) => !s.src);
      if (free) {
        free.src = r.l;
        free.fade = 0;
      }
    }
    for (const slot of this.slots) {
      const L = slot.light;
      const src = slot.src;
      if (!src) {
        L.intensity = 0;
        continue;
      }
      src.getWorldPosition(L.position);
      L.color.copy(src.color);
      L.distance = src.distance;
      L.decay = src.decay;
      L.intensity = src.intensity * slot.fade;
    }
  }
}

/* ------------------------------------------------------------------ per-preset scene tweaks */

export interface SceneTweaks {
  /** Meshes smaller than this (bounding radius, m) don't cast shadows. */
  minCasterRadius: number;
  /** Real refraction (an extra full scene pass). Otherwise glass is faked with alpha. */
  transmission: boolean;
}

const tmpSphere = new THREE.Sphere();

/**
 * Apply the preset's cheap-scene rules to everything under `root`: tiny
 * shadow casters off, transmission faked, point lights handed to the pool.
 * Safe to call repeatedly (originals are kept in userData).
 */
export function adoptObject(root: THREE.Object3D, t: SceneTweaks): void {
  root.traverse((o) => {
    const l = o as THREE.PointLight;
    if (l.isPointLight) {
      virtualizeLight(l);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const ud = m.userData;
    if (ud.perfCast === undefined) ud.perfCast = m.castShadow;
    if (ud.perfCast && m.geometry && !(m as THREE.InstancedMesh).isInstancedMesh) {
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      tmpSphere.copy(g.boundingSphere!);
      const r = tmpSphere.radius * m.matrixWorld.getMaxScaleOnAxis();
      m.castShadow = r >= t.minCasterRadius;
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) tweakMaterial(mat as THREE.MeshPhysicalMaterial, t);
  });
}

function tweakMaterial(mat: THREE.MeshPhysicalMaterial, t: SceneTweaks): void {
  if (!mat || !mat.isMeshPhysicalMaterial) return;
  const ud = mat.userData;
  if (ud.perfTx === undefined) {
    if (!(mat.transmission > 0)) return;
    ud.perfTx = { transmission: mat.transmission, transparent: mat.transparent, opacity: mat.opacity };
  }
  const o = ud.perfTx as { transmission: number; transparent: boolean; opacity: number };
  if (t.transmission) {
    if (mat.transmission === o.transmission) return;
    mat.transmission = o.transmission;
    mat.transparent = o.transparent;
    mat.opacity = o.opacity;
  } else {
    if (mat.transmission === 0) return;
    mat.transmission = 0;
    mat.transparent = true;
    mat.opacity = Math.min(o.opacity, Math.max(0.35, 1 - 0.6 * o.transmission));
  }
  mat.needsUpdate = true;
}

/* ------------------------------------------------------------------ lights that can't be removed */

/**
 * Turn a real light on/off without changing the light count (which would
 * recompile every lit shader). Virtual (pooled) lights just toggle visibility.
 */
export function setLightEnabled(l: THREE.Light, on: boolean): void {
  if (virtualLights.has(l as THREE.PointLight)) {
    l.visible = on;
    return;
  }
  const ud = l.userData;
  if (on === !ud.perfOff) return;
  if (on) {
    l.intensity = (ud.perfIntensity as number | undefined) ?? l.intensity;
    ud.perfOff = false;
  } else {
    ud.perfIntensity = l.intensity;
    l.intensity = 0;
    ud.perfOff = true;
  }
  ud.perfShadowOff = !on;
}

/** Scale a light's intensity, also when it is currently switched off. */
export function scaleLightIntensity(l: THREE.Light, f: number): void {
  if (l.userData.perfOff) l.userData.perfIntensity = ((l.userData.perfIntensity as number) ?? 0) * f;
  else l.intensity *= f;
}

/* ------------------------------------------------------------------ shadow scheduling */

/**
 * Shadow maps render only when needed: every `interval` frames while
 * something moves, every `idleInterval` frames otherwise (slow animations).
 */
export class ShadowScheduler {
  interval = 1;
  idleInterval = 30;
  /** Extra interval multiplier for point-light (cube) shadows. */
  pointInterval = 3;
  private frame = 0;
  private force = true;
  /** Shadow map renders in the last second (overlay). */
  updates = 0;
  private count = 0;
  private t = 0;

  invalidate(): void {
    this.force = true;
  }

  /** Decide which of the shadow-casting lights render their map this frame. */
  schedule(lights: readonly THREE.Light[], moving: boolean, dt: number): void {
    this.frame++;
    this.t += dt;
    if (this.t >= 1) {
      this.updates = this.count;
      this.count = 0;
      this.t = 0;
    }
    const every = moving ? this.interval : this.idleInterval;
    const due = this.force || this.frame % every === 0;
    const pointDue = this.force || this.frame % (every * this.pointInterval) === 0;
    this.force = false;
    let any = false;
    for (const l of lights) {
      const s = (l as THREE.Light & { shadow?: THREE.LightShadow }).shadow;
      if (!l.castShadow || !s) continue;
      s.autoUpdate = false;
      const want = !l.userData.perfShadowOff && ((l as THREE.PointLight).isPointLight ? pointDue : due);
      if (want || !s.map) {
        s.needsUpdate = true;
        any = true;
      }
    }
    if (any) this.count++;
  }
}

/**
 * Cheap "did anything visible move" probe: compares tracked objects'
 * positions/rotations with the last frame.
 */
export class MotionProbe {
  private last = new Float32Array(0);
  moving(objs: readonly THREE.Object3D[], extra: boolean): boolean {
    const n = objs.length * 7;
    let moved = extra || n !== this.last.length;
    if (n !== this.last.length) this.last = new Float32Array(n);
    const a = this.last;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]!;
      const p = o.position;
      const q = o.quaternion;
      const j = i * 7;
      if (
        Math.abs(a[j]! - p.x) > 1e-4 ||
        Math.abs(a[j + 1]! - p.y) > 1e-4 ||
        Math.abs(a[j + 2]! - p.z) > 1e-4 ||
        Math.abs(a[j + 3]! - q.x) > 1e-4 ||
        Math.abs(a[j + 4]! - q.y) > 1e-4 ||
        Math.abs(a[j + 5]! - q.z) > 1e-4 ||
        Math.abs(a[j + 6]! - q.w) > 1e-4
      ) {
        moved = true;
        a[j] = p.x;
        a[j + 1] = p.y;
        a[j + 2] = p.z;
        a[j + 3] = q.x;
        a[j + 4] = q.y;
        a[j + 5] = q.z;
        a[j + 6] = q.w;
      }
    }
    return moved;
  }
}
