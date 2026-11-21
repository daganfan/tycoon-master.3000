import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { formatCash, type Num } from '@/core/num';
import {
  BELT, COLLECT_PAD, FURNACE, LINES, MAX_SCRAP, PADS, REBIRTH_PAD, STAR_BONUS, TANK, padById, type LineId, type PadDef,
} from '@/content/garage';
import type { Game } from '@/sim/game';
import type { Physics } from '../physics';
import type { Cash } from '../cash';
import type { Avatar } from '../avatar';
import { mat } from '../room';
import { GarageSound, Particles } from './fx';
import { ScrapRenderer, scrapBody, type Scrap } from './scrap';
import { buildBelt, buildDecor, buildDropper, buildFurnace, buildRobot, buildSpeed, buildTank, buildUpgrader, type Piece } from './pieces';
import { signTex } from './textures';
import { GARAGE_LAYER, mergeStatic, toGarageLayer } from './perf';

export interface FactoryHost {
  game: Game;
  scene: THREE.Object3D;
  phys: Physics;
  cash: Cash;
  avatar: Avatar;
  sound: GarageSound;
  particles: Particles;
  plot: { x0: number; x1: number; z0: number; z1: number };
}

type PadRole = 'buy' | 'collect' | 'rebirth';

interface PadVis {
  id: string;
  role: PadRole;
  x: number;
  z: number;
  group: THREE.Group;
  top: THREE.MeshStandardMaterial;
  beam: THREE.MeshBasicMaterial;
  sprite: THREE.Sprite;
  labelKey: string;
  inside: boolean;
  hold: number;
  /** Time left before standing on it triggers again. */
  cooldown: number;
  born: number;
}

interface BuiltPiece {
  group: THREE.Group;
  handles: RAPIER.Collider[];
  animate: (dt: number, t: number) => void;
  pulse: () => void;
}

const PAD_R = 0.4;
const OFF_BELT_LIFETIME = 25;
const MAX_AGE = 120;
const COLORS = { ok: '#40c057', no: '#fa5252', collect: '#22b8cf', rebirth: '#fcc419' };

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Scrap-o-Matic Works, the physical walk-around tycoon: glowing buy pads,
 * droppers that spit real Rapier bodies, belts, upgrader gates, a furnace that
 * melts scrap into the tank, and a COLLECT pad that bursts it out as coins.
 */
export class Factory3D {
  readonly root = new THREE.Group();
  readonly items: Scrap[] = [];
  private pads = new Map<string, PadVis>();
  private pieces = new Map<string, BuiltPiece>();
  private pops: { obj: THREE.Object3D; t: number }[] = [];
  private dropAcc = new Map<string, number>();
  private renderer: ScrapRenderer;
  private time = 0;
  private labelT = 0;
  private spills: number[] = [];
  private spillCooldown = 0;
  private tankSprite: THREE.Sprite | null = null;
  private tankKey = '';
  private hintText = '';
  private belts = new Map<LineId, THREE.Texture>();
  private furnace: (Piece & { mouths: THREE.MeshStandardMaterial }) | null = null;
  private tank: (Piece & { setFill(f: number): void }) | null = null;
  private robot: (Piece & { celebrate(): void }) | null = null;

  constructor(private readonly h: FactoryHost) {
    h.scene.add(this.root);
    this.renderer = new ScrapRenderer(this.root);
    const g = h.game;
    for (const id of g.state.garage.pads) this.buildPiece(id, false);
    this.refreshPads();
    g.bus.on('garagePad', (e) => {
      this.buildPiece(e.id, true);
      this.refreshPads();
    });
    g.bus.on('garagePayout', (e) => this.payout(e.amount, e.source));
    g.bus.on('garageRebirth', () => this.onRebirth());
  }

  get game(): Game {
    return this.h.game;
  }

  /* ------------------------------------------------------------ pieces */

  private buildPiece(id: string, animate: boolean): void {
    if (this.pieces.has(id)) return;
    const def = padById(id);
    if (!def) return;
    const made: Piece[] = [];
    switch (def.kind) {
      case 'furnace': {
        this.furnace = buildFurnace();
        this.tank = buildTank();
        made.push(this.furnace, this.tank);
        break;
      }
      case 'belt': {
        const b = buildBelt(def.line!);
        this.belts.set(def.line!, b.tex);
        made.push(b);
        break;
      }
      case 'dropper':
        made.push(buildDropper(def));
        break;
      case 'upgrader':
        made.push(buildUpgrader(def));
        break;
      case 'speed':
        made.push(buildSpeed(def, PADS.filter((p) => p.kind === 'speed').indexOf(def) + 1));
        break;
      case 'decor':
        made.push(buildDecor(def, this.h.plot));
        break;
      case 'robot':
        this.robot = buildRobot();
        made.push(this.robot);
        break;
    }
    const group = new THREE.Group();
    const handles: RAPIER.Collider[] = [];
    const anims: ((dt: number, t: number) => void)[] = [];
    const pulses: (() => void)[] = [];
    for (const p of made) {
      group.add(p.group);
      for (const c of p.colliders) {
        const col = this.h.phys.staticBox({ x: c.half[0], y: c.half[1], z: c.half[2] }, { x: c.pos[0], y: c.pos[1], z: c.pos[2] }, c.slick ? 0 : 0.8);
        if (c.slick) col.setFrictionCombineRule(this.h.phys.R.CoefficientCombineRule.Min);
        handles.push(col);
      }
      mergeStatic(p.group, new Set(p.keep ?? []));
      toGarageLayer(p.group);
      if (p.animate) anims.push(p.animate);
      if (p.pulse) pulses.push(p.pulse);
      if (animate) {
        p.group.scale.setScalar(0.01);
        this.pops.push({ obj: p.group, t: 0 });
      }
    }
    this.root.add(group);
    this.pieces.set(id, {
      group,
      handles,
      animate: (dt, t) => anims.forEach((a) => a(dt, t)),
      pulse: () => pulses.forEach((p) => p()),
    });
    if (animate) {
      const c = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
      this.h.particles.burst(c, '#ffd43b', 70, 3.2, 1.1);
      this.h.particles.burst(c, '#ffffff', 30, 2, 0.8);
      this.h.sound.build();
    }
  }

  private clearPieces(): void {
    for (const [, p] of this.pieces) {
      const c = new THREE.Box3().setFromObject(p.group).getCenter(new THREE.Vector3());
      this.h.particles.burst(c, '#ff922b', 25, 2.5, 0.9);
      for (const hnd of p.handles) this.h.phys.world.removeCollider(hnd, false);
      p.group.removeFromParent();
    }
    this.pieces.clear();
    this.belts.clear();
    this.furnace = this.tank = this.robot = null;
    this.dropAcc.clear();
  }

  private onRebirth(): void {
    this.clearPieces();
    for (const it of [...this.items]) this.removeItem(it, false);
    this.h.sound.rebirth();
    const p = this.h.avatar.position;
    this.h.particles.burst(p.clone().setY(1.2), '#fcc419', 160, 5, 1.6, 3, 2);
    this.refreshPads();
  }

  /* ------------------------------------------------------------ pads */

  private padColor(p: PadVis): string {
    if (p.role === 'collect') return COLORS.collect;
    if (p.role === 'rebirth') return COLORS.rebirth;
    return this.game.garage.canBuyPad(p.id) ? COLORS.ok : COLORS.no;
  }

  private makePad(id: string, role: PadRole, x: number, z: number): PadVis {
    const group = new THREE.Group();
    const r = role === 'buy' ? PAD_R : 0.5;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.09, 0.05, 32), mat('#2b2f33', 0.5, 0.6));
    ring.position.y = 0.025;
    ring.receiveShadow = true;
    group.add(ring);
    const top = mat('#1f2a24', 0.35, 0, { emissive: COLORS.ok, emissiveIntensity: 1.2 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 32), top);
    disc.position.y = 0.055;
    group.add(disc);
    const beam = new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, 1.2, 24, 1, true), beam);
    cone.position.y = 0.65;
    group.add(cone);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    sprite.position.y = role === 'buy' ? 1.45 : 1.7;
    sprite.renderOrder = 3;
    group.add(sprite);
    group.position.set(x, 0, z);
    group.scale.setScalar(0.01);
    toGarageLayer(group);
    this.root.add(group);
    const p: PadVis = { id, role, x, z, group, top, beam, sprite, labelKey: '', inside: false, hold: 0, cooldown: 0, born: this.time };
    this.pops.push({ obj: group, t: 0 });
    return p;
  }

  private removePad(p: PadVis): void {
    p.group.removeFromParent();
    (p.sprite.material as THREE.SpriteMaterial).map?.dispose();
    this.pads.delete(p.id);
  }

  /** Show exactly the pads that can be stepped on right now. */
  refreshPads(): void {
    const g = this.game.garage;
    const want = new Map<string, { role: PadRole; x: number; z: number }>();
    if (g.unlocked()) {
      for (const p of g.available()) want.set(p.id, { role: 'buy', ...p.pad });
      if (g.has('furnace')) want.set('#collect', { role: 'collect', ...COLLECT_PAD });
      if (g.rebirthReady()) want.set('#rebirth', { role: 'rebirth', ...REBIRTH_PAD });
    }
    for (const p of [...this.pads.values()]) if (!want.has(p.id)) this.removePad(p);
    for (const [id, w] of want) if (!this.pads.has(id)) this.pads.set(id, this.makePad(id, w.role, w.x, w.z));
    this.updateLabels(true);
  }

  private label(p: PadVis): { key: string; draw: () => THREE.Texture } {
    const g = this.game;
    if (p.role === 'collect') {
      const v = formatCash(Math.floor(g.state.garage.tank));
      return { key: `c${v}`, draw: () => signTex([{ text: '💰 COLLECT', size: 64, color: '#99e9f2' }, { text: v, size: 72, color: '#ffffff' }], 'rgba(8,30,38,0.85)', COLORS.collect) };
    }
    if (p.role === 'rebirth') {
      const cost = g.garage.rebirthCost();
      const ok = g.state.cash.gte(cost);
      const next = 1 + STAR_BONUS * (g.state.garage.stars + 1);
      return {
        key: `r${cost}${ok}${g.state.garage.stars}`,
        draw: () =>
          signTex(
            [
              { text: '⭐ REBIRTH ⭐', size: 66, color: '#ffe066' },
              { text: formatCash(cost), size: 60, color: ok ? '#8ce99a' : '#ff8787' },
              { text: `Scrap worth x${next.toFixed(2)} forever`, size: 34, color: '#fff', bold: false },
              { text: 'Stand still 2 s · resets the factory', size: 30, color: '#ced4da', bold: false },
            ],
            'rgba(40,30,5,0.88)',
            COLORS.rebirth,
          ),
      };
    }
    const def = padById(p.id)!;
    const ok = g.garage.canBuyPad(p.id);
    return {
      key: `b${ok}`,
      draw: () =>
        signTex(
          [
            { text: def.name, size: 50, color: '#ffffff' },
            { text: formatCash(def.cost), size: 64, color: ok ? '#8ce99a' : '#ff8787' },
            { text: def.desc, size: 28, color: '#ced4da', bold: false },
          ],
          'rgba(12,14,20,0.85)',
          ok ? COLORS.ok : COLORS.no,
        ),
    };
  }

  private updateLabels(force = false): void {
    for (const p of this.pads.values()) {
      const l = this.label(p);
      if (!force && l.key === p.labelKey) continue;
      p.labelKey = l.key;
      const m = p.sprite.material as THREE.SpriteMaterial;
      m.map?.dispose();
      const tex = l.draw();
      m.map = tex;
      m.needsUpdate = true;
      const img = tex.image as HTMLCanvasElement;
      const w = p.role === 'buy' ? 1.25 : 1.45;
      p.sprite.scale.set(w, (w * img.height) / img.width, 1);
      const c = this.padColor(p);
      p.top.emissive.set(c);
      p.beam.color.set(c);
    }
    if (this.tank) {
      const v = formatCash(Math.floor(this.game.state.garage.tank));
      if (v !== this.tankKey || !this.tankSprite) {
        this.tankKey = v;
        if (!this.tankSprite) {
          this.tankSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
          this.tankSprite.position.set(TANK.x, TANK.h + 0.55, TANK.z);
          this.tankSprite.layers.set(GARAGE_LAYER);
          this.root.add(this.tankSprite);
        }
        const m = this.tankSprite.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.map = signTex([{ text: `TANK ${v}`, size: 60, color: '#ffe8a3' }], 'rgba(30,20,0,0.8)', '#f59f00');
        m.needsUpdate = true;
        this.tankSprite.scale.set(1.1, 0.25, 1);
      }
    } else if (this.tankSprite) {
      this.tankSprite.removeFromParent();
      this.tankSprite = null;
    }
  }

  private stepOn(p: PadVis, dt: number): void {
    const g = this.game;
    const enter = !p.inside;
    p.inside = true;
    if (p.role === 'buy') {
      const def = padById(p.id)!;
      if (enter && this.time - p.born > 0.4) {
        if (g.garage.buyPad(p.id)) return;
        this.h.sound.deny();
        p.cooldown = 0.6;
      }
      const need = g.state.cash.toNumber() < def.cost ? def.cost - g.state.cash.toNumber() : 0;
      this.hintText = need > 0 ? `${def.name}: need ${formatCash(need)} more` : `${def.name} — step off and on again to build`;
      return;
    }
    if (p.role === 'collect') {
      p.cooldown -= dt;
      if ((enter || p.cooldown <= 0) && g.state.garage.tank >= 0.01) {
        g.garage.collect('pad');
        p.cooldown = 1.5;
      }
      this.hintText = g.state.garage.tank > 0 ? 'Collecting the tank…' : 'Tank is empty. Scrap melts into money in the furnace.';
      return;
    }
    // Rebirth: hold still.
    const v = this.h.avatar.body.linvel();
    const still = Math.hypot(v.x, v.z) < 0.4;
    if (!g.garage.canRebirth()) {
      p.hold = 0;
      this.hintText = `Rebirth needs ${formatCash(g.garage.rebirthCost())} (you have ${formatCash(g.state.cash)})`;
      if (enter) this.h.sound.deny();
      return;
    }
    p.hold = still ? p.hold + dt : Math.max(0, p.hold - dt);
    this.hintText = `⭐ Hold still to REBIRTH… ${Math.min(100, Math.round((p.hold / 2) * 100))}%`;
    if (p.hold >= 2) {
      p.hold = 0;
      g.garage.rebirth();
    }
  }

  /* ------------------------------------------------------------ scrap */

  private lineAt(p: THREE.Vector3Like): LineId | null {
    for (const id of ['A', 'B'] as const) {
      const L = LINES[id];
      if (!this.belts.has(id)) continue;
      if (Math.abs(p.z - L.z) < BELT.width / 2 + 0.02 && p.x > L.x0 - 0.05 && p.x < L.x1 + 0.3 && p.y > BELT.top - 0.08 && p.y < BELT.top + 0.45) return id;
    }
    return null;
  }

  private beltSpeed(): number {
    const n = PADS.filter((p) => p.kind === 'speed' && this.game.garage.has(p.id)).length;
    return 0.75 + 0.3 * n;
  }

  private spawn(def: PadDef): void {
    const d = def.dropper!;
    if (this.items.length >= MAX_SCRAP) this.evictOne();
    const at = def.at!;
    const y = d.scrap === 'crate' ? 1.4 : 1.25;
    const body = scrapBody(this.h.phys, d.scrap, { x: at.x + (Math.random() - 0.5) * 0.04, y, z: at.z + (Math.random() - 0.5) * 0.1 });
    this.items.push({
      body, kind: d.scrap, line: def.line!, value: this.game.garage.itemValue(def.id), painted: false, gold: false, wrapped: false, hat: false,
      gates: new Set(), color: ScrapRenderer.baseColor(d.scrap), offT: 0, dented: false, age: 0,
    });
    this.pieces.get(def.id)?.pulse?.();
    this.h.sound.plop();
  }

  /** Over the cap: drop the oldest spilled item, or bank the oldest belt item so no income is lost. */
  private evictOne(): void {
    const spilled = this.items.filter((i) => i.dented).sort((a, b) => b.age - a.age)[0];
    if (spilled) return this.removeItem(spilled, true);
    const oldest = [...this.items].sort((a, b) => b.age - a.age)[0];
    if (!oldest) return;
    this.game.garage.deposit(oldest.value);
    this.removeItem(oldest, true);
  }

  private removeItem(it: Scrap, poof: boolean): void {
    const i = this.items.indexOf(it);
    if (i < 0) return;
    this.items.splice(i, 1);
    if (poof) {
      const t = it.body.translation();
      this.h.particles.burst(t, '#adb5bd', 10, 1.2, 0.6, 2);
    }
    this.h.phys.world.removeRigidBody(it.body);
  }

  private melt(it: Scrap): void {
    this.game.garage.deposit(it.value);
    const t = it.body.translation();
    this.h.particles.burst({ x: FURNACE.x - FURNACE.hx, y: t.y + 0.1, z: t.z }, it.gold ? '#ffd43b' : '#ff6b00', 8, 1.6, 0.5, 1, 0.8);
    this.furnace?.pulse?.();
    this.h.sound.melt();
    this.removeItem(it, false);
  }

  private applyGate(it: Scrap, def: PadDef): void {
    const u = def.upgrader!;
    it.gates.add(def.id);
    it.value *= u.mult;
    switch (u.fx) {
      case 'paint':
        it.painted = true;
        it.color = ScrapRenderer.paintColor();
        break;
      case 'gold':
        it.gold = true;
        it.color = new THREE.Color('#ffcf4d');
        break;
      case 'wrap':
        it.wrapped = true;
        break;
      case 'hat':
        it.hat = true;
        break;
    }
    const t = it.body.translation();
    const col = { paint: it.color, gold: '#ffd43b', wrap: '#a5d8ff', hat: '#b197fc' }[u.fx];
    this.h.particles.burst(t, col, 6, 1, 0.45, 1);
    this.pieces.get(def.id)?.pulse?.();
  }

  private updateScrap(dt: number): void {
    const g = this.game.garage;
    // Droppers (only while their line can carry scrap away).
    for (const def of PADS) {
      if (def.kind !== 'dropper' || !g.has(def.id) || !g.lineWorks(def.line!)) continue;
      const acc = (this.dropAcc.get(def.id) ?? Math.random()) + dt * g.dropRate(def.id);
      this.dropAcc.set(def.id, acc >= 1 ? acc - 1 : acc);
      if (acc >= 1) this.spawn(def);
    }
    const speed = this.beltSpeed();
    const gates = PADS.filter((p) => p.kind === 'upgrader' && g.has(p.id));
    const furnaceX = FURNACE.x - FURNACE.hx - 0.12;
    const now = this.time;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.age += dt;
      const p = it.body.translation();
      if (p.y < -1 || it.age > MAX_AGE) {
        this.removeItem(it, true);
        continue;
      }
      // The furnace eats anything shoved against its front, belt or not.
      if (this.furnace && p.x > furnaceX && p.x < FURNACE.x && Math.abs(p.z - FURNACE.z) < FURNACE.hz && p.y < 1.4) {
        this.melt(it);
        continue;
      }
      const line = this.lineAt(p);
      if (line) {
        const L = LINES[line];
        const v = it.body.linvel();
        const k = Math.min(1, dt * 8);
        it.body.setLinvel({ x: v.x + (speed - v.x) * k, y: v.y, z: v.z + ((L.z - p.z) * 3 - v.z) * Math.min(1, dt * 6) }, true);
        for (const gd of gates) if (gd.line === line && !it.gates.has(gd.id) && Math.abs(p.x - gd.at!.x) < 0.12) this.applyGate(it, gd);
        continue;
      }
      // Off the belt.
      if (p.y < 0.3) {
        if (!it.dented) {
          it.dented = true;
          it.value *= 0.5;
          it.color = it.color.clone().multiplyScalar(0.5);
          this.spills.push(now);
        }
        it.offT += dt;
        if (it.offT > OFF_BELT_LIFETIME) this.removeItem(it, true);
      } else if (!it.towered && it.dented && p.y > 0.9 && it.body.isSleeping()) {
        // A pile of spilled scrap that ends up stacked high on something.
        it.towered = true;
        this.game.reportChaos('tower', { magnitude: p.y, object: 'scrap-pile' });
      }
    }
    // Spill avalanches feed the Chaos Meter.
    this.spillCooldown -= dt;
    this.spills = this.spills.filter((t) => now - t < 5);
    if (this.spills.length >= 8 && this.spillCooldown <= 0) {
      this.game.reportChaos('avalanche', { magnitude: 12 + this.spills.length, object: 'scrap' });
      this.spillCooldown = 8;
      this.spills = [];
    }
    this.renderer.render(this.items);
  }

  /* ------------------------------------------------------------ payouts */

  private payout(amount: Num, source: string): void {
    const origin = new THREE.Vector3(TANK.x - 0.05, 1.25, TANK.z - TANK.r - 0.1);
    const dir = new THREE.Vector3(-0.25, 0, -1).normalize();
    this.h.cash.payout(amount, origin, dir);
    this.h.sound.collect();
    this.h.particles.burst(origin, '#ffd43b', 40, 2.5, 1);
    if (source === 'robot') this.robot?.celebrate();
  }

  /* ------------------------------------------------------------ frame */

  update(dt: number): void {
    this.time += dt;
    this.hintText = '';
    // Pop-in animations.
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i]!;
      pop.t += dt / 0.6;
      pop.obj.scale.setScalar(Math.max(0.01, easeOutBack(Math.min(1, pop.t))));
      if (pop.t >= 1) {
        pop.obj.scale.setScalar(1);
        this.pops.splice(i, 1);
      }
    }
    // Belt textures scroll.
    const sp = this.beltSpeed();
    for (const tex of this.belts.values()) tex.offset.x -= (sp * dt) / 0.5;
    for (const p of this.pieces.values()) p.animate?.(dt, this.time);
    this.tank?.setFill(1 - Math.exp(-this.game.state.garage.tank / Math.max(1, this.game.garage.rate() * 45)));
    // Pads: pulse, and react to the avatar standing on them.
    const a = this.h.avatar.position;
    const grounded = a.y < 1.4;
    for (const p of [...this.pads.values()]) {
      const pulse = 1.3 + Math.sin(this.time * 4 + p.x) * 0.5;
      p.top.emissiveIntensity = pulse * 0.8;
      p.beam.opacity = 0.07 + 0.04 * Math.sin(this.time * 3 + p.z);
      p.sprite.position.y = (p.role === 'buy' ? 1.45 : 1.7) + Math.sin(this.time * 2 + p.x) * 0.04;
      const r = p.role === 'buy' ? PAD_R : 0.5;
      const on = grounded && Math.hypot(a.x - p.x, a.z - p.z) < r;
      // Don't let the floating label hide the player standing under it.
      const near = Math.hypot(a.x - p.x, a.z - p.z) < r + 0.5;
      const sm = p.sprite.material as THREE.SpriteMaterial;
      sm.opacity += ((near ? 0.3 : 1) - sm.opacity) * Math.min(1, dt * 8);
      if (near) p.sprite.position.y += 0.5;
      if (on) this.stepOn(p, dt);
      else {
        p.inside = false;
        p.hold = Math.max(0, p.hold - dt * 2);
      }
    }
    this.labelT -= dt;
    if (this.labelT <= 0) {
      this.labelT = 0.25;
      if (this.game.garage.available().length + (this.game.garage.rebirthReady() ? 1 : 0) + (this.game.garage.has('furnace') ? 1 : 0) !== this.pads.size) this.refreshPads();
      else this.updateLabels();
    }
    this.updateScrap(dt);
    this.h.particles.update(dt);
  }

  hint(): string {
    return this.hintText;
  }
}
