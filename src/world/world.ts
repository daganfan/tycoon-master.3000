import * as THREE from 'three';
import type { Game } from '@/sim/game';
import { itemById } from '@/content/items';
import { cosmeticById } from '@/content/cosmetics';
import type { CosmeticTarget, PhysicsPatch } from '@/sim/types';
import { TycoonOS, type OsHost } from '@/os/os';
import { initRapier, Physics, type PhysObj } from './physics';
import { buildRoom, ROOM, type RoomRefs } from './room';
import { Graphics, type Quality } from './render';
import { Lighting } from './lighting';
import { Cash } from './cash';
import { Avatar } from './avatar';
import { createProp, spawnToy } from './props';
import { Sfx } from './audio';

interface ScreenEntry {
  os: TycoonOS;
  mesh: THREE.Mesh;
  tex: THREE.CanvasTexture;
  obj: PhysObj;
  w: number;
  h: number;
  redraw: number;
  acc: number;
}

const AUX_APPS = ['taskmgr', 'wallet', 'mail'];
const FOV = 55;

/** The 3D bedroom: rendering, physics, camera, input and screens. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.03, 60);
  readonly sfx = new Sfx();
  readonly screens: ScreenEntry[] = [];
  readonly props: PhysObj[] = [];
  hint = '';
  gfx!: Graphics;
  lighting: Lighting | null = null;
  focus: ScreenEntry | null = null;
  onFocusChange: (focused: boolean) => void = () => {};
  private focusBlend = 0;
  private cam = { yaw: 0, pitch: 0.32, dist: 2.4 };
  private keys = new Set<string>();
  private drag: { x: number; y: number; moved: boolean; button: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private time = 0;
  private avalancheT = 0;
  private towerT = 0;
  private spinners: THREE.Object3D[] = [];
  private tpPos = new THREE.Vector3();
  private tpQuat = new THREE.Quaternion();

  private constructor(
    readonly canvas: HTMLCanvasElement,
    readonly game: Game,
    readonly host: OsHost,
    readonly phys: Physics,
    readonly room: RoomRefs,
    readonly cash: Cash,
    readonly avatar: Avatar,
    renderer: THREE.WebGLRenderer,
  ) {
    this.renderer = renderer;
  }

  static async create(canvas: HTMLCanvasElement, game: Game, host: OsHost): Promise<World> {
    const R = await initRapier();
    const gfx = new Graphics(canvas);
    const renderer = gfx.renderer;
    const phys = new Physics(R);
    const scene = new THREE.Scene();
    const room = buildRoom(scene, phys);
    const cash = new Cash(phys, scene);
    const avatar = new Avatar(phys, scene, new THREE.Vector3(0.3, 1, 0.6));
    const w = new World(canvas, game, host, phys, room, cash, avatar, renderer);
    w.gfx = gfx;
    // move built content into the world's scene
    while (scene.children.length) w.scene.add(scene.children[0]!);
    w.setupLights();
    w.setupScreens();
    w.restoreItems();
    w.applyCosmetics();
    w.bindGame();
    w.bindInput();
    w.resize();
    cash.restorePile(game.state.floorCash, new THREE.Vector3(0.9, 0, -1.4));
    return w;
  }

  /* ------------------------------------------------------------ setup */

  private setupLights(): void {
    this.lighting = new Lighting(this.scene, this.gfx, this.room, () => this.screens[0]?.os.canvas);
    this.gfx.setQuality(this.game.state.settings.quality ?? 'auto');
    this.gfx.attach(this.scene, this.camera);
    this.avatar.lookTarget = this.camera.position;
  }

  private addScreen(mesh: THREE.Mesh, obj: PhysObj, w: number, h: number, label: string): ScreenEntry {
    const res = label === 'main' ? 1 : 0.75;
    const os = new TycoonOS(this.game, this.host, Math.round(1280 * res), Math.round(1280 * res * (h / w)), label);
    const tex = new THREE.CanvasTexture(os.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    (mesh.material as THREE.MeshBasicMaterial).map = tex;
    (mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    const e: ScreenEntry = { os, mesh, tex, obj, w, h, redraw: 0, acc: 0 };
    this.screens.push(e);
    if (label !== 'main') {
      os.boot(true);
      const n = this.screens.length - 2;
      const tycoons = this.game.running().map((r) => r.id);
      os.open(label === 'pc' ? (tycoons[1] ?? tycoons[0] ?? 'appstore') : AUX_APPS[n % AUX_APPS.length]!);
    }
    return e;
  }

  private setupScreens(): void {
    const s = this.room.screen;
    this.addScreen(s.mesh, s.obj, s.w, s.h, 'main');
    if (this.game.state.flags.includes('booted')) this.screens[0]!.os.boot(true);
  }

  private restoreItems(): void {
    for (const [id, count] of Object.entries(this.game.state.items)) for (let i = 0; i < count; i++) this.spawnItem(id, i);
  }

  private spawnItem(id: string, index: number): void {
    const def = itemById(id);
    if (!def?.prop) return;
    const res = createProp(def.prop, index, this.scene, this.phys, this.room.deskTopY);
    if (res.obj) {
      this.props.push(res.obj);
      res.obj.mesh.traverse((o) => o.name === 'spin' && this.spinners.push(o));
    }
    if (res.screen) this.addScreen(res.screen.mesh, res.screen.obj, res.screen.w, res.screen.h, def.prop === 'pc' ? 'pc' : 'aux');
  }

  private bindGame(): void {
    const g = this.game;
    g.bus.on('payout', (e) => {
      const tower = this.room.pc.mesh;
      const origin = new THREE.Vector3(0, 0.3, 0.26).applyMatrix4(tower.matrixWorld);
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(tower.quaternion).normalize();
      this.cash.payout(e.amount, origin, dir);
      this.sfx.payout();
    });
    g.bus.on('collected', () => this.sfx.clink());
    g.bus.on('token', () => this.sfx.token());
    g.bus.on('itemBought', (e) => {
      this.spawnItem(e.id, e.count - 1);
      this.applyCosmetics();
    });
    g.bus.on('cosmeticsChanged', () => this.applyCosmetics());
    g.bus.on('nodeBought', () => (this.cash.bounce = g.stat('coin.bounce')));
    g.bus.on('respec', () => (this.cash.bounce = g.stat('coin.bounce')));
    g.bus.on('spawn', (e) => {
      const scr = this.screens.find((s) => s.os.windows.includes(e.tycoonId)) ?? this.screens[0]!;
      const center = scr.mesh.getWorldPosition(new THREE.Vector3());
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(scr.mesh.getWorldQuaternion(new THREE.Quaternion()));
      const toy = spawnToy(e.kind, center.add(normal.clone().multiplyScalar(0.12)), normal, this.scene, this.phys);
      this.props.push(toy);
      if (this.props.filter((p) => p.kind === e.kind).length > 25) {
        const old = this.props.find((p) => p.kind === e.kind)!;
        this.props.splice(this.props.indexOf(old), 1);
        this.phys.remove(old);
      }
      this.applyCosmetics();
      if (e.kind === 'duck') this.sfx.quack();
    });
    this.cash.bounce = g.stat('coin.bounce');
  }

  /* ------------------------------------------------------------ cosmetics */

  private targetObjects(t: CosmeticTarget): THREE.Object3D[] {
    switch (t) {
      case 'avatar':
        return [this.avatar.group];
      case 'pc':
        return [this.room.pc.mesh, ...this.screens.map((s) => s.obj.mesh)];
      case 'desk':
        return [this.room.desk.mesh, ...this.props.filter((p) => p.target === 'desk').map((p) => p.mesh)];
      case 'props':
        return [this.room.chair.mesh, ...this.props.filter((p) => p.target === 'props').map((p) => p.mesh)];
      default:
        return [];
    }
  }

  private targetBodies(t: CosmeticTarget): PhysObj[] {
    const all = [this.room.desk, this.room.pc, this.room.chair, this.avatar.obj, ...this.screens.map((s) => s.obj), ...this.props];
    return all.filter((o) => o.target === t);
  }

  applyCosmetics(): void {
    const eq = this.game.state.cosmetics.equipped;
    const targets: CosmeticTarget[] = ['avatar', 'pc', 'desk', 'props', 'coins'];
    for (const t of targets) {
      const e = eq[t];
      const defs = [e?.skin, ...(e?.mods ?? [])].map((id) => (id ? cosmeticById(id) : undefined)).filter((d) => !!d);
      const patches: PhysicsPatch[] = defs.map((d) => d.physics).filter((p): p is PhysicsPatch => !!p);
      const jelly = defs.some((d) => d.visual.wobble);
      const mats = new Set<THREE.MeshStandardMaterial>();
      if (t === 'coins') this.cash.materials.forEach((m) => mats.add(m));
      else
        for (const root of this.targetObjects(t))
          root.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m?.isMeshStandardMaterial && !m.userData.noSkin) mats.add(m);
          });
      for (const m of mats) {
        const base = (m.userData.base ??= { color: m.color.getHex(), roughness: m.roughness, metalness: m.metalness, emissive: m.emissive.getHex(), map: m.map });
        m.color.setHex(base.color);
        m.roughness = base.roughness;
        m.metalness = base.metalness;
        m.emissive.setHex(base.emissive);
        m.map = base.map;
        for (const d of defs) {
          if (d.visual.color) {
            m.color.set(d.visual.color);
            if (t !== 'avatar') m.map = null;
          }
          if (d.visual.roughness !== undefined) m.roughness = d.visual.roughness;
          if (d.visual.metalness !== undefined) m.metalness = d.visual.metalness;
          if (d.visual.emissive) {
            m.emissive.set(d.visual.emissive);
            m.emissiveIntensity = 0.6;
          }
        }
        m.needsUpdate = true;
      }
      if (t === 'coins') this.cash.setPatches(patches);
      else
        for (const o of this.targetBodies(t)) {
          this.phys.applyPatch(o, patches);
          o.mesh.userData.jelly = jelly;
          if (!jelly) o.mesh.scale.set(1, 1, 1);
        }
    }
  }

  /* ------------------------------------------------------------ input */

  private bindInput(): void {
    const c = this.canvas;
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.toggleFocus();
      if (e.code === 'Escape' && this.focus) this.setFocus(null);
      if (e.code === 'KeyF' && !this.focus && this.avatar.flop()) this.game.reportChaos('ragdoll');
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.focus) {
        const uv = this.screenUv(e, this.focus);
        if (uv) this.focus.os.pointerMove(uv.x, uv.y);
        c.style.cursor = this.focus.os.ui.hovering ? 'pointer' : 'default';
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      if (this.drag.moved && !this.focus) {
        this.cam.yaw -= dx * 0.006;
        this.cam.pitch = Math.max(-0.2, Math.min(1.2, this.cam.pitch + dy * 0.005));
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
      }
    });
    c.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved) return;
      if (this.focus) {
        const uv = this.screenUv(e, this.focus);
        if (uv) {
          this.focus.os.click(uv.x, uv.y);
          this.sfx.click();
        } else if (d.button === 0) this.setFocus(null);
        return;
      }
      // Click a nearby screen to use it.
      const hit = this.pickScreen(e);
      if (hit && hit.dist < 2.6) this.setFocus(hit.screen);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.focus) this.focus.os.wheel(e.deltaY);
        else this.cam.dist = Math.max(1.1, Math.min(4.5, this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
      },
      { passive: false },
    );
  }

  private ndc(e: PointerEvent | MouseEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private screenUv(e: PointerEvent | MouseEvent, s: ScreenEntry): { x: number; y: number } | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObject(s.mesh, false)[0];
    if (!hit?.uv) return null;
    return { x: hit.uv.x * s.os.width, y: (1 - hit.uv.y) * s.os.height };
  }

  private pickScreen(e: PointerEvent): { screen: ScreenEntry; dist: number } | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.screens.map((s) => s.mesh), false);
    const h = hits[0];
    if (!h) return null;
    const screen = this.screens.find((s) => s.mesh === h.object)!;
    return { screen, dist: h.point.distanceTo(this.avatar.position) };
  }

  private nearestScreen(): ScreenEntry | null {
    const p = this.avatar.position;
    let best: ScreenEntry | null = null;
    let bd = 1.8;
    for (const s of this.screens) {
      const d = s.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(p);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private toggleFocus(): void {
    if (this.focus) return this.setFocus(null);
    const s = this.nearestScreen();
    if (s) this.setFocus(s);
  }

  setFocus(s: ScreenEntry | null): void {
    if (s && s.os.screen === 'off') s.os.boot();
    if (!this.focus && s) {
      this.tpPos.copy(this.camera.position);
      this.tpQuat.copy(this.camera.quaternion);
    }
    this.focus = s;
    if (s) this.lastFocusEntry = s;
    this.canvas.style.cursor = 'default';
    this.onFocusChange(!!s);
  }

  /** Open the main PC (used by the HUD and tests). */
  focusMain(): void {
    this.setFocus(this.screens[0]!);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gfx.resize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------ frame */

  update(dt: number): void {
    this.time += dt;
    this.sfx.volume = this.game.state.settings.volume;
    const comfort = this.game.state.settings.comfort;

    // Movement relative to the camera
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const fwd = new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
    if (move.lengthSq() > 1) move.normalize();
    this.avatar.update(dt, move, k.has('ShiftLeft') || k.has('ShiftRight'), k.has('Space'), !this.focus);

    this.phys.update(dt);
    this.avatar.postSync();

    // Cash magnet / pickup
    const fast = this.cash.update(dt, this.avatar.position, this.game.stat('magnet.radius'), this.game.flag('coins.seekPlayer'), (v, coins) =>
      this.game.collect(v, coins),
    );
    this.detectChaos(dt, fast);
    this.jelly(dt, comfort);
    for (const s of this.spinners) s.rotation.y += dt * 25;

    // Screens
    const focusedTycoon = this.focus?.os.focusedTycoon() ?? null;
    this.game.focused = focusedTycoon;
    for (const s of this.screens) {
      s.redraw -= dt;
      s.acc += dt;
      const fps = s === this.focus ? 30 : 6;
      if (s.redraw <= 0) {
        s.redraw = 1 / fps;
        s.os.update(s.acc);
        s.acc = 0;
        s.tex.needsUpdate = true;
      }
    }

    // Hint text
    const near = this.nearestScreen();
    this.hint = this.focus
      ? 'Click the screen to play · Esc / E to step back'
      : near
        ? near.os.screen === 'off'
          ? 'E — power on the crusty PC'
          : 'E — use this screen'
        : 'WASD move · Shift sprint · Space jump · F flop · drag to look · T skill tree';

    this.updateCamera(dt);
    this.gfx.setQuality((this.game.state.settings.quality ?? 'auto') as Quality);
    this.gfx.setFocus(this.focusBlend);
    this.gfx.render(dt);
  }

  private detectChaos(dt: number, fastCoins: number): void {
    const g = this.game;
    const tracked = [this.room.desk, this.room.pc, this.room.chair, ...this.screens.map((s) => s.obj), ...this.props];
    const up = new THREE.Vector3();
    for (const o of tracked) {
      if (o.kind === 'avatar') continue;
      up.set(0, 1, 0).applyQuaternion(o.mesh.quaternion);
      if (o.wasUpright && up.y < 0.45) {
        o.wasUpright = false;
        if (o.kind !== 'duck' && o.kind !== 'sock' && o.kind !== 'remote') {
          this.sfx.thud();
          g.reportChaos('topple');
        }
      } else if (up.y > 0.9) o.wasUpright = true;
    }
    this.avalancheT -= dt;
    if (fastCoins >= 15 && this.avalancheT <= 0) {
      this.avalancheT = 2;
      g.reportChaos('avalanche');
    }
    this.towerT -= dt;
    if (this.towerT <= 0) {
      this.towerT = 1;
      const high = this.props.filter((p) => p.kind === 'box' && p.body.isSleeping() && p.body.translation().y > 1.15);
      if (high.length > 0) g.reportChaos('tower');
    }
    if (this.avatar.airTime > 1.2) {
      this.avatar.airTime = 0;
      g.reportChaos('ragdoll');
    }
  }

  private jelly(dt: number, comfort: number): void {
    const v = new THREE.Vector3();
    for (const o of [...this.props, this.room.desk, this.room.pc, this.room.chair, this.avatar.obj, ...this.screens.map((s) => s.obj)]) {
      if (!o.mesh.userData.jelly) continue;
      const lv = o.body.linvel();
      v.set(lv.x, lv.y, lv.z);
      const dv = v.distanceTo(o.lastVel);
      o.lastVel.copy(v);
      o.wobble = Math.min(0.3, o.wobble * Math.pow(0.04, dt) + dv * 0.04 * comfort);
      const s = Math.sin(this.time * 28) * o.wobble;
      o.mesh.scale.set(1 + s, 1 - s, 1 + s);
    }
  }

  private updateCamera(dt: number): void {
    const target = this.avatar.position.add(new THREE.Vector3(0, 0.55, 0));
    const { yaw, pitch, dist } = this.cam;
    const tp = new THREE.Vector3(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    // keep the camera inside the room
    tp.x = THREE.MathUtils.clamp(tp.x, -ROOM.hx + 0.15, ROOM.hx - 0.15);
    tp.z = THREE.MathUtils.clamp(tp.z, -ROOM.hz + 0.15, ROOM.hz - 0.15);
    tp.y = THREE.MathUtils.clamp(tp.y, 0.3, ROOM.h - 0.15);
    const tq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(tp, target, new THREE.Vector3(0, 1, 0)));
    const blendTarget = this.focus ? 1 : 0;
    const prev = this.focusBlend;
    this.focusBlend += Math.sign(blendTarget - this.focusBlend) * Math.min(Math.abs(blendTarget - this.focusBlend), dt * 2.2);
    if (prev === 0 && this.focusBlend === 0) {
      this.camera.position.lerp(tp, 1 - Math.pow(0.0001, dt));
      this.camera.quaternion.slerp(tq, 1 - Math.pow(0.0001, dt));
      this.tpPos.copy(this.camera.position);
      this.tpQuat.copy(this.camera.quaternion);
      return;
    }
    const s = this.focus ?? this.lastFocus();
    if (!s) return;
    const center = s.mesh.getWorldPosition(new THREE.Vector3());
    const q = s.mesh.getWorldQuaternion(new THREE.Quaternion());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const d = Math.max(s.h / 2 / tan, s.w / 2 / (tan * this.camera.aspect)) * 1.14;
    const fp = center.clone().add(normal.multiplyScalar(d));
    const fq = q;
    const t = this.focusBlend * this.focusBlend * (3 - 2 * this.focusBlend);
    this.tpPos.lerp(tp, 1 - Math.pow(0.0001, dt));
    this.tpQuat.slerp(tq, 1 - Math.pow(0.0001, dt));
    this.camera.position.lerpVectors(this.tpPos, fp, t);
    this.camera.quaternion.slerpQuaternions(this.tpQuat, fq, t);
  }

  private lastFocusEntry: ScreenEntry | null = null;
  private lastFocus(): ScreenEntry | null {
    return this.lastFocusEntry;
  }
}
