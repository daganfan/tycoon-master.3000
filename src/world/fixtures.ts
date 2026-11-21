import * as THREE from 'three';
import type { Game } from '@/sim/game';
import type { PhysObj } from './physics';
import type { Avatar } from './avatar';
import type { RoomRefs } from './room';
import type { Drawer } from './furniture';
import type { Sfx } from './audio';
import { ROOM, WINDOW } from './room';

/** What the fixtures need from the world. */
export interface FixtureHost {
  readonly game: Game;
  readonly avatar: Avatar;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: THREE.Scene;
  readonly room: RoomRefs;
  readonly sfx: Sfx;
  /** Camera yaw (what is "in front"). */
  yaw(): number;
  /** The ceiling lamp light (switched by the wall switch). */
  ceilingLamp(): THREE.PointLight | null;
  /** Open/close the garage door by hand. */
  toggleDoor(): 'open' | 'closed' | 'locked';
  /** Reboot the main PC. */
  pcPower(): void;
  /** Distance to the nearest screen (E prefers a screen that is closer). */
  nearestScreenDist(): number;
  /** The object the player is holding, if any. */
  held(): PhysObj | null;
}

interface Fixture {
  /** Meshes that count as "this fixture" for clicks. */
  target: THREE.Object3D;
  /** Where it is (for E / hints). */
  anchor(): THREE.Vector3;
  label(): string;
  use(): void;
}

const REACH_CLICK = 2.4;
const REACH_E = 1.35;

/**
 * Small interactive bits of the bedroom: the light switch, the door, drawers,
 * the PC power button and the curtains (which also sway when bumped).
 * Use them with E (nearest one in front) or by clicking.
 */
export class Fixtures {
  private readonly list: Fixture[] = [];
  private readonly ray = new THREE.Raycaster();
  lightsOn = true;
  private bulb: { mat: THREE.MeshStandardMaterial; emissive: THREE.Color } | null = null;
  private curtainsClosed = false;
  private curtainT = 0;
  private sway = [
    { a: 0, v: 0 },
    { a: 0, v: 0 },
  ];
  private shoveFrom: { obj: PhysObj; p: THREE.Vector3 } | null = null;
  private shoveAcc = 0;
  private napped = false;
  private time = 0;

  constructor(private readonly w: FixtureHost) {
    const r = w.room;
    const pos = (o: THREE.Object3D) => () => o.getWorldPosition(new THREE.Vector3());
    const lamp = w.scene.getObjectByName('ceiling-lamp');
    lamp?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!this.bulb && m?.isMeshStandardMaterial && m.emissiveIntensity > 1) this.bulb = { mat: m, emissive: m.emissive.clone() };
    });
    this.list.push({
      target: r.lightToggle,
      anchor: pos(r.lightToggle),
      label: () => (this.lightsOn ? 'E — switch the light off' : 'E — switch the light on'),
      use: () => this.toggleLights(),
    });
    const doorPanel = r.door;
    this.list.push({
      target: doorPanel,
      anchor: () => new THREE.Vector3(1.6, 1, ROOM.z1 - 0.1),
      label: () => 'E — open / close the door',
      use: () => {
        const s = w.toggleDoor();
        w.game.bus.emit('world', { kind: 'door', object: s });
      },
    });
    for (const d of r.drawers) {
      this.list.push({
        target: d.mesh,
        anchor: pos(d.mesh),
        label: () => `E — ${d.open ? 'close' : 'open'} the ${d.label}`,
        use: () => this.toggleDrawer(d),
      });
    }
    this.list.push({
      target: r.powerButton,
      anchor: pos(r.powerButton),
      label: () => 'E — press the power button',
      use: () => {
        w.sfx.snap();
        w.pcPower();
        w.game.bus.emit('world', { kind: 'pcPower' });
      },
    });
    for (const c of r.curtains)
      this.list.push({
        target: c,
        anchor: pos(c),
        label: () => (this.curtainsClosed ? 'E — open the curtains' : 'E — close the curtains'),
        use: () => {
          this.curtainsClosed = !this.curtainsClosed;
          this.kickCurtains(1.2);
          w.game.bus.emit('world', { kind: 'curtains' });
        },
      });
  }

  /* ------------------------------------------------------------ actions */

  toggleLights(): void {
    this.lightsOn = !this.lightsOn;
    const lamp = this.w.ceilingLamp();
    if (lamp) lamp.visible = this.lightsOn;
    if (this.bulb) this.bulb.mat.emissive.copy(this.lightsOn ? this.bulb.emissive : new THREE.Color(0x000000));
    this.w.room.lightToggle.rotation.x = this.lightsOn ? 0.25 : -0.25;
    this.w.sfx.snap();
    this.w.game.bus.emit('world', { kind: 'lightSwitch', value: this.lightsOn ? 1 : 0 });
  }

  toggleDrawer(d: Drawer): void {
    d.open = !d.open;
    this.w.sfx.slide();
    if (d.open) this.w.game.bus.emit('world', { kind: 'drawer', object: d.label });
  }

  private kickCurtains(k: number): void {
    for (const s of this.sway) s.v += (Math.random() * 0.5 + 0.75) * k;
  }

  /** The window broke: the curtains billow. */
  gust(): void {
    this.kickCurtains(4);
  }

  /* ------------------------------------------------------------ input */

  private forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.w.yaw()), 0, -Math.cos(this.w.yaw()));
  }

  /** The fixture E would use right now (nearest in front, within reach). */
  nearest(): Fixture | null {
    const p = this.w.avatar.position;
    p.y += 0.3;
    const f = this.forward();
    let best: Fixture | null = null;
    let bd = REACH_E;
    for (const fx of this.list) {
      const a = fx.anchor();
      const d = a.distanceTo(p);
      if (d > bd) continue;
      const flat = new THREE.Vector3(a.x - p.x, 0, a.z - p.z);
      if (flat.lengthSq() > 0.09 && flat.normalize().dot(f) < 0.2) continue;
      bd = d;
      best = fx;
    }
    if (best && this.w.nearestScreenDist() < bd) return null;
    return best;
  }

  /** E: use the nearest fixture. Returns false if there is none (E then uses a screen). */
  useNearest(): boolean {
    const fx = this.nearest();
    if (!fx) return false;
    fx.use();
    return true;
  }

  /** Click: use the fixture under the cursor (ndc), if it's within reach. */
  click(ndc: THREE.Vector2): boolean {
    this.ray.setFromCamera(ndc, this.w.camera);
    const hits = this.ray.intersectObjects(
      this.list.map((f) => f.target),
      true,
    );
    const h = hits[0];
    if (!h || h.point.distanceTo(this.w.avatar.position) > REACH_CLICK) return false;
    const fx = this.list.find((f) => {
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o === f.target) return true;
      return false;
    });
    if (!fx) return false;
    fx.use();
    return true;
  }

  hint(): string {
    return this.nearest()?.label() ?? '';
  }

  /* ------------------------------------------------------------ frame */

  update(dt: number, objs: PhysObj[]): void {
    this.time += dt;
    // Drawers glide.
    for (const d of this.w.room.drawers) {
      const target = d.open ? 1 : 0;
      if (d.t === target) continue;
      d.t = THREE.MathUtils.clamp(d.t + Math.sign(target - d.t) * dt * 4, 0, 1);
      const k = d.t * d.t * (3 - 2 * d.t);
      d.mesh.position.z = d.z0 + d.travel * k;
    }
    // Curtains: draw open/closed, and sway like cloth when something brushes past.
    this.curtainT = THREE.MathUtils.clamp(this.curtainT + (this.curtainsClosed ? dt : -dt) * 1.5, 0, 1);
    const ck = this.curtainT * this.curtainT * (3 - 2 * this.curtainT);
    const half = WINDOW.w / 2;
    this.w.room.curtains.forEach((c, i) => {
      const side = i === 0 ? -1 : 1;
      const pivot = c.parent!;
      pivot.position.x = side * THREE.MathUtils.lerp(half + 0.06, half * 0.5, ck);
      c.scale.x = THREE.MathUtils.lerp(1, 1.8, ck);
      const s = this.sway[i]!;
      s.v += (-s.a * 30 - s.v * 3.5) * dt;
      s.a += s.v * dt;
      s.a = THREE.MathUtils.clamp(s.a, -0.6, 0.6);
      pivot.rotation.x = -Math.abs(s.a) * 0.8 + Math.sin(this.time * 1.3 + i) * 0.004;
      pivot.rotation.z = s.a * 0.15;
    });
    for (const o of objs) {
      const t = o.body.translation();
      if (t.x < ROOM.x1 - 0.55 || Math.abs(t.z - WINDOW.z) > WINDOW.w / 2 + 0.6 || t.y > 2.3) continue;
      const v = o.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 0.6) this.kickCurtains(Math.min(2, sp * 0.4) * dt * 6);
    }
    this.trackShove();
    this.trackNap();
  }

  /** Heavy Lifter: metres of furniture shoved by the player. */
  private trackShove(): void {
    const h = this.w.held();
    if (!h || !h.heavy) {
      this.shoveFrom = null;
      return;
    }
    const t = h.body.translation();
    const p = new THREE.Vector3(t.x, 0, t.z);
    if (this.shoveFrom?.obj !== h) {
      this.shoveFrom = { obj: h, p };
      return;
    }
    this.shoveAcc += p.distanceTo(this.shoveFrom.p);
    this.shoveFrom.p = p;
    if (this.shoveAcc >= 0.5) {
      this.w.game.bus.emit('world', { kind: 'shoved', object: h.id ?? h.kind, value: this.shoveAcc });
      this.shoveAcc = 0;
    }
  }

  /** Power Nap: flop and land on the bed. */
  private trackNap(): void {
    const av = this.w.avatar;
    if (av.ragdoll <= 0) {
      this.napped = false;
      return;
    }
    if (this.napped) return;
    const bed = this.w.room.bed.mesh;
    const box = new THREE.Box3().setFromObject(bed);
    const p = av.position;
    if (p.x > box.min.x && p.x < box.max.x && p.z > box.min.z && p.z < box.max.z && p.y > 0.45 && p.y < 1.4) {
      this.napped = true;
      this.w.game.bus.emit('world', { kind: 'nap' });
    }
  }
}
