import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '@/sim/game';
import type { CosmeticTarget } from '@/sim/types';
import { cosmeticById, type CosmeticFxSpec } from '@/content/cosmetics';
import type { Physics, PhysObj } from './physics';
import type { Cash } from './cash';
import { reapplyDecorGravity, tickDecor } from './decor/runtime';
import { decorSound } from './decor/sound';

/**
 * Runtime cosmetic effects that go beyond a colour/physics patch:
 * neon pulse, glass, rainbow, pixelated, haunted, magnetic, squeaky and
 * giant/tiny (visual + collider scale). Also drives decor behaviours.
 *
 * World calls apply() at the end of applyCosmetics() (after it has reset
 * materials to their base values) and update() once per frame.
 */

export interface FxHost {
  game: Game;
  phys: Physics;
  cash: Cash;
  roots(t: CosmeticTarget): THREE.Object3D[];
  bodies(t: CosmeticTarget): PhysObj[];
}

type Mat = THREE.MeshStandardMaterial;
interface MatBase {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  flatShading: boolean;
  emissiveIntensity: number;
}

const TARGETS: CosmeticTarget[] = ['avatar', 'pc', 'desk', 'props', 'coins'];

interface ColliderBase {
  he?: RAPIER.Vector;
  r?: number;
  hh?: number;
  t: RAPIER.Vector;
}

export class CosmeticFx {
  private touched = new Set<Mat>();
  private pulse: { mats: Mat[]; color: THREE.Color }[] = [];
  private rainbow: { mats: Mat[]; speed: number }[] = [];
  private haunted: PhysObj[] = [];
  private magnets: { obj: PhysObj; strength: number }[] = [];
  private squeaky: { obj: PhysObj; pitch: number; last: THREE.Vector3; cd: number }[] = [];
  private scaled = new Map<PhysObj, number>();
  private colliderBase = new WeakMap<RAPIER.Collider, ColliderBase>();
  private hauntT = 2;
  private propsGravity = 1;

  constructor(private readonly host: FxHost) {}

  private mats(t: CosmeticTarget): Mat[] {
    if (t === 'coins') return [...this.host.cash.materials];
    const out = new Set<Mat>();
    for (const root of this.host.roots(t))
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as Mat | undefined;
        if (m?.isMeshStandardMaterial && !m.userData.noSkin) out.add(m);
      });
    return [...out];
  }

  private reset(): void {
    for (const m of this.touched) {
      const b = m.userData.fxBase as MatBase | undefined;
      if (!b) continue;
      m.transparent = b.transparent;
      m.opacity = b.opacity;
      m.depthWrite = b.depthWrite;
      m.flatShading = b.flatShading;
      m.emissiveIntensity = b.emissiveIntensity;
      m.needsUpdate = true;
    }
    this.touched.clear();
  }

  private touch(m: Mat): void {
    m.userData.fxBase ??= { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, flatShading: m.flatShading, emissiveIntensity: m.emissiveIntensity } satisfies MatBase;
    this.touched.add(m);
  }

  apply(): void {
    this.reset();
    this.pulse = [];
    this.rainbow = [];
    this.haunted = [];
    this.magnets = [];
    this.squeaky = [];
    const nextScale = new Map<PhysObj, number>();
    const eq = this.host.game.state.cosmetics.equipped;
    this.propsGravity = 1;
    for (const t of TARGETS) {
      const e = eq[t];
      const defs = [e?.skin, ...(e?.mods ?? [])].map((id) => (id ? cosmeticById(id) : undefined)).filter((d) => !!d);
      if (t === 'props') for (const d of defs) if (d.physics?.gravityScale !== undefined) this.propsGravity *= d.physics.gravityScale;
      const fx: CosmeticFxSpec = {};
      let scale = 1;
      for (const d of defs) {
        Object.assign(fx, d.fx ?? {});
        if (d.physics?.scale) scale *= d.physics.scale;
      }
      const hasFx = Object.keys(fx).length > 0;
      if (!hasFx && scale === 1) continue;
      const mats = hasFx ? this.mats(t) : [];
      for (const m of mats) {
        if (!fx.glass && !fx.pixel && !fx.pulse) continue;
        this.touch(m);
        if (fx.glass) {
          m.transparent = true;
          m.opacity = 0.35;
          m.depthWrite = false;
        }
        if (fx.pixel) m.flatShading = true;
        m.needsUpdate = true;
      }
      if (fx.pulse) this.pulse.push({ mats, color: new THREE.Color(fx.pulse) });
      if (fx.rainbow) this.rainbow.push({ mats, speed: fx.rainbow });
      const bodies = t === 'coins' ? [] : this.host.bodies(t);
      if (fx.haunted) this.haunted.push(...bodies);
      if (fx.magnet) for (const obj of bodies) this.magnets.push({ obj, strength: fx.magnet });
      if (fx.squeak) for (const obj of bodies) this.squeaky.push({ obj, pitch: fx.squeak, last: new THREE.Vector3(), cd: 1 });
      if (scale !== 1 && t === 'props') for (const obj of bodies) nextScale.set(obj, scale);
    }
    // Giant / Tiny: rescale colliders in place, restore anything no longer scaled.
    for (const [obj] of this.scaled) if (!nextScale.has(obj)) this.setScale(obj, 1);
    for (const [obj, s] of nextScale) if (this.scaled.get(obj) !== s) this.setScale(obj, s);
    this.scaled = nextScale;
    reapplyDecorGravity(this.propsGravity);
  }

  private setScale(obj: PhysObj, s: number): void {
    const R = this.host.phys.R;
    const body = obj.body;
    for (let i = 0; i < body.numColliders(); i++) {
      const c = body.collider(i);
      let b = this.colliderBase.get(c);
      if (!b) {
        const tr = c.translationWrtParent() ?? { x: 0, y: 0, z: 0 };
        b = { t: { x: tr.x, y: tr.y, z: tr.z } };
        const st = c.shapeType();
        if (st === R.ShapeType.Cuboid) {
          const he = c.halfExtents()!;
          b.he = { x: he.x, y: he.y, z: he.z };
        } else if (st === R.ShapeType.Ball) b.r = c.radius();
        else if (st === R.ShapeType.Cylinder || st === R.ShapeType.Capsule || st === R.ShapeType.Cone) {
          b.r = c.radius();
          b.hh = c.halfHeight();
        }
        this.colliderBase.set(c, b);
      }
      if (b.he) c.setHalfExtents({ x: b.he.x * s, y: b.he.y * s, z: b.he.z * s });
      if (b.r !== undefined) c.setRadius(b.r * s);
      if (b.hh !== undefined) c.setHalfHeight(b.hh * s);
      c.setTranslationWrtParent({ x: b.t.x * s, y: b.t.y * s, z: b.t.z * s });
    }
    if (s > 1) {
      const t = body.translation();
      body.setTranslation({ x: t.x, y: t.y + 0.05, z: t.z }, true);
    }
    body.wakeUp();
    if (s === 1 && !obj.mesh.userData.jelly) obj.mesh.scale.setScalar(1);
  }

  update(dt: number, time: number): void {
    const g = this.host.game;
    decorSound.volume = g.state.settings.volume;
    const reduced = g.state.settings.reducedMotion;
    tickDecor(dt, time, { reducedMotion: reduced, cosmeticGravity: this.propsGravity });

    for (const p of this.pulse) {
      const k = 0.9 + Math.sin(time * Math.PI * 1.6) * 0.7;
      for (const m of p.mats) {
        m.emissive.copy(p.color);
        m.emissiveIntensity = Math.max(0.15, k);
      }
    }
    for (const r of this.rainbow) {
      r.mats.forEach((m, i) => m.color.setHSL((time * r.speed + i * 0.07) % 1, 0.85, 0.55));
    }
    for (const [obj, s] of this.scaled) {
      if (obj.mesh.userData.jelly) obj.mesh.scale.multiplyScalar(s);
      else obj.mesh.scale.setScalar(s);
    }
    if (this.haunted.length && !reduced) {
      this.hauntT -= dt;
      if (this.hauntT <= 0) {
        this.hauntT = 1.5 + Math.random() * 3;
        const o = this.haunted[Math.floor(Math.random() * this.haunted.length)]!;
        // Haunted things move on purpose: never keep them frozen.
        o.noFreeze = true;
        if (o.frozen) this.host.phys.unfreeze(o);
        if (o.body.isDynamic()) {
          const m = o.body.mass();
          const a = Math.random() * Math.PI * 2;
          o.body.applyImpulse({ x: Math.cos(a) * m * 0.4, y: m * 2, z: Math.sin(a) * m * 0.4 }, true);
          const av = o.body.angvel();
          o.body.setAngvel({ x: av.x, y: av.y + (Math.random() - 0.5) * 8, z: av.z }, true);
        }
      }
    }
    if (this.magnets.length) {
      for (const bit of this.host.cash.bits) {
        const t = bit.body.translation();
        for (const mg of this.magnets) {
          const p = mg.obj.body.translation();
          const dx = p.x - t.x;
          const dy = p.y + 0.2 - t.y;
          const dz = p.z - t.z;
          const d = Math.hypot(dx, dy, dz);
          if (d > 1.4 || d < 0.05) continue;
          const f = (mg.strength * bit.body.mass() * dt) / Math.max(0.3, d);
          bit.body.applyImpulse({ x: (dx / d) * f, y: (dy / d) * f, z: (dz / d) * f }, true);
        }
      }
    }
    for (const sq of this.squeaky) {
      sq.cd -= dt;
      const v = sq.obj.body.linvel();
      const cur = new THREE.Vector3(v.x, v.y, v.z);
      if (sq.cd <= 0 && cur.distanceTo(sq.last) > 1.2) {
        sq.cd = 0.2;
        decorSound.squeak(sq.pitch * (0.8 + Math.random() * 0.4));
      }
      sq.last.copy(cur);
    }
  }
}
