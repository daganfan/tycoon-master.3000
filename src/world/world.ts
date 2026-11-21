import * as THREE from 'three';
import type { Game } from '@/sim/game';
import { itemById } from '@/content/items';
import { cosmeticById } from '@/content/cosmetics';
import type { CosmeticTarget, PhysicsPatch } from '@/sim/types';
import { TycoonOS, type OsHost } from '@/os/os';
import { initRapier, Physics, type PhysObj } from './physics';
import { buildRoom, type RoomRefs } from './room';
import { Graphics, type Quality } from './render';
import { Lighting } from './lighting';
import { Cash } from './cash';
import { Avatar } from './avatar';
import { createProp, spawnToy } from './props';
import { Sfx } from './audio';
import { Interact } from './interact';
import { ChaosDetector } from './chaos';
import { CosmeticFx } from './cosmeticFx';
import type { NetHooks } from './remote';
import { Garage } from './garage/garage';
import { CameraRig, facingForYaw, lookDir, nextMode, type CamMode } from './camera';
import { Controls, GRAB_REACH, aimAt, type AimHit } from './controls';

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

const FOV = 60;

/** The 3D bedroom: rendering, physics, camera, input and screens. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.03, 60);
  readonly sfx = new Sfx();
  readonly screens: ScreenEntry[] = [];
  readonly props: PhysObj[] = [];
  hint = '';
  /** Context hint next to the crosshair ('' = nothing interactable in view). */
  aimHint = '';
  /** What the crosshair is on this frame. */
  aim: AimHit | null = null;
  gfx!: Graphics;
  lighting: Lighting | null = null;
  focus: ScreenEntry | null = null;
  onFocusChange: (focused: boolean) => void = () => {};
  /** Multiplayer session hooks (src/net); null when playing alone. */
  netHooks: NetHooks | null = null;
  /** First / third-person camera (src/world/camera.ts). */
  readonly rig: CameraRig;
  /** Keyboard, mouse and pointer lock (src/world/controls.ts). */
  controls!: Controls;
  private raycaster = new THREE.Raycaster();
  private time = 0;
  readonly interact: Interact;
  readonly chaos: ChaosDetector;
  private spinners: THREE.Object3D[] = [];
  private fx?: CosmeticFx;
  /** Phase 2: the garage behind the bedroom door. */
  garage?: Garage;

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
    this.rig = new CameraRig({
      camera: this.camera,
      avatar,
      phys,
      settings: () => game.state.settings,
      heldBody: () => this.interact.held?.obj.body ?? null,
    });
    this.rig.mode = game.state.settings.camMode === 'first' ? 'first' : 'third';
    this.interact = new Interact(this);
    this.chaos = new ChaosDetector(game, avatar, (o) => this.interact.busy(o), () => this.sfx.thud());
    for (const id of ['desk', 'pc', 'monitor', 'chair'] as const) this.interact.register(room[id], id);
  }

  /** Camera yaw (used by grab/carry to know what's "in front"). */
  get yaw(): number {
    return this.rig.look.yaw;
  }

  get camMode(): CamMode {
    return this.rig.mode;
  }

  /** Switch first / third person (V, Settings). Remembered in the save. */
  setCamMode(m: CamMode): void {
    this.game.state.settings.camMode = m;
    this.rig.setMode(m);
  }

  toggleCamMode(): void {
    this.setCamMode(nextMode(this.rig.mode));
  }

  /** Crosshair targeting for grab/carry. */
  aimProp(): { obj: PhysObj; point: THREE.Vector3 } | null {
    const a = this.aim;
    return a && a.kind !== 'door' && a.obj.kind !== 'avatar' && a.obj.body.isDynamic() && a.dist <= GRAB_REACH ? { obj: a.obj, point: a.point } : null;
  }

  /** First person: carried things float in front of your eyes, following the view pitch. */
  holdPoint(dist: number): THREE.Vector3 | null {
    if (this.rig.mode !== 'first') return null;
    const d = lookDir(this.rig.look.yaw, Math.max(-0.9, Math.min(1.1, this.rig.look.pitch)));
    return this.rig.eye().addScaledVector(d, dist).add(new THREE.Vector3(0, -0.12, 0));
  }

  screenMeshes(): THREE.Object3D[] {
    return this.screens.map((s) => s.mesh);
  }

  /** Put every piece of furniture and decor back where it belongs. */
  tidyAll(): number {
    return this.interact.tidyAll();
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
    w.fx = new CosmeticFx({ game, phys, cash, roots: (t) => w.targetObjects(t), bodies: (t) => w.targetBodies(t) });
    w.gfx = gfx;
    // move built content into the world's scene
    while (scene.children.length) w.scene.add(scene.children[0]!);
    w.setupLights();
    w.garage = new Garage(w);
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

  /** `screenId` ties the OS to the game's desk (which windows are open decides which games run). */
  private addScreen(mesh: THREE.Mesh, obj: PhysObj, w: number, h: number, label: string, screenId: string): ScreenEntry {
    const res = label === 'main' ? 1 : 0.75;
    const os = new TycoonOS(this.game, this.host, Math.round(1280 * res), Math.round(1280 * res * (h / w)), label, screenId);
    const tex = new THREE.CanvasTexture(os.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    (mesh.material as THREE.MeshBasicMaterial).map = tex;
    (mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    const e: ScreenEntry = { os, mesh, tex, obj, w, h, redraw: 0, acc: 0 };
    this.screens.push(e);
    // Extra screens are always on; what they show comes from the game's desk.
    if (label !== 'main') os.boot(true);
    return e;
  }

  private setupScreens(): void {
    const s = this.room.screen;
    this.addScreen(s.mesh, s.obj, s.w, s.h, 'main', 'main');
    if (this.game.state.flags.includes('booted')) this.screens[0]!.os.boot(true);
  }

  private restoreItems(): void {
    for (const [id, count] of Object.entries(this.game.state.items)) for (let i = 0; i < count; i++) this.spawnItem(id, i);
  }

  private spawnItem(id: string, index: number): void {
    const def = itemById(id);
    if (!def?.prop) return;
    const before = this.phys.objs.length;
    const res = createProp(def.prop, index, this.scene, this.phys, this.room.deskTopY);
    // Stable ids for persistence: the main object is `${id}#${index}`, extras (e.g. a side table) get a suffix.
    const created = this.phys.objs.slice(before);
    const main = res.obj ?? created[0];
    let extra = 0;
    for (const o of created) this.interact.register(o, o === main ? `${id}#${index}` : `${id}#${index}/${++extra}`);
    if (res.obj) {
      this.props.push(res.obj);
      res.obj.mesh.traverse((o) => o.name === 'spin' && this.spinners.push(o));
    }
    if (res.screen) this.addScreen(res.screen.mesh, res.screen.obj, res.screen.w, res.screen.h, def.prop === 'pc' ? 'pc' : 'aux', `${id}#${index}`);
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
    this.fx?.apply();
  }

  /* ------------------------------------------------------------ input */

  private bindInput(): void {
    window.addEventListener('resize', () => this.resize());
    this.controls = new Controls({
      canvas: this.canvas,
      focused: () => !!this.focus,
      look: (dx, dy) => this.rig.turn(dx, dy),
      key: (code) => this.onKey(code),
      worldDown: (e, crosshair) => {
        if (crosshair && e.button === 0 && !this.interact.held && this.aim?.kind === 'screen') {
          this.setFocus(this.screens[this.aim.index] ?? null);
          return true;
        }
        return this.interact.pointerDown(e, crosshair);
      },
      worldUp: (e) => this.interact.pointerUp(e),
      worldClick: (e, crosshair) => {
        if (crosshair) {
          if (this.aim?.kind === 'screen') this.setFocus(this.screens[this.aim.index] ?? null);
          return;
        }
        // Click a nearby screen to use it.
        const hit = this.pickScreen(e);
        if (hit && hit.dist < 2.6) this.setFocus(hit.screen);
      },
      screenMove: (e) => {
        if (!this.focus) return;
        const uv = this.screenUv(e, this.focus);
        if (uv && !this.netScreen('move', uv)) this.focus.os.pointerMove(uv.x, uv.y);
        this.canvas.style.cursor = this.focus.os.ui.hovering ? 'pointer' : 'default';
      },
      screenClick: (e) => {
        if (!this.focus) return;
        const uv = this.screenUv(e, this.focus);
        if (uv) {
          if (!this.netScreen('click', uv)) this.focus.os.click(uv.x, uv.y);
          this.sfx.click();
        } else if (e.button === 0) this.setFocus(null);
      },
      wheel: (dy) => {
        if (this.focus) {
          if (!this.netScreen('wheel', { x: 0, y: dy })) this.focus.os.wheel(dy);
        } else if (!this.interact.wheel(dy) && this.rig.mode === 'third') this.rig.zoom(dy);
      },
    });
  }

  private onKey(code: string): void {
    if (code === 'KeyE') this.toggleFocus();
    if (code === 'Escape' && this.focus) this.setFocus(null, false);
    if (this.focus) return;
    if (code === 'KeyV') this.toggleCamMode();
    if (code === 'KeyF') this.chaos.tryFlop();
    if (code === 'KeyG') this.interact.toggleGrab();
    if (code === 'KeyR') this.interact.uprightNearest();
  }

  /** Multiplayer: let the net session take screen input (visitors forward it to the host). */
  private netScreen(kind: 'move' | 'click' | 'wheel', p: { x: number; y: number }): boolean {
    return !!this.focus && !!this.netHooks?.screenInput(this.screens.indexOf(this.focus), kind, p.x, p.y);
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
    const aimed = this.aim?.kind === 'screen' ? this.screens[this.aim.index] : undefined;
    const s = aimed ?? this.nearestScreen();
    if (s) this.setFocus(s);
  }

  /**
   * Zoom onto a screen (null = step back). Focusing frees the mouse for TycoonOS;
   * stepping back re-captures it when the browser allows (click / key), otherwise
   * the "Click to play" overlay asks for a click.
   */
  setFocus(s: ScreenEntry | null, recapture = true): void {
    if (s && s.os.screen === 'off') s.os.boot();
    this.focus = s;
    if (s) {
      this.lastFocusEntry = s;
      this.controls?.release();
    } else if (recapture) this.controls?.capture();
    this.controls?.reset();
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
    const ctl = this.controls;
    const mode = this.game.state.settings.camMode === 'first' ? 'first' : 'third';
    if (mode !== this.rig.mode) this.rig.setMode(mode);
    const { f, r } = ctl.axes();
    const yaw = this.rig.look.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
    if (move.lengthSq() > 1) move.normalize();
    // First person (and while carrying) the body turns with the view; otherwise it faces where it walks.
    const face = !this.focus && (mode === 'first' || this.interact.held) ? facingForYaw(yaw) : undefined;
    this.avatar.update(dt, move, ctl.sprint, ctl.jump, !this.focus, face);
    this.interact.update(dt);
    this.garage?.update(dt);

    this.netHooks?.prePhysics(dt);
    this.phys.update(dt);
    this.avatar.postSync();

    // Cash magnet / pickup
    const fast = this.cash.update(dt, this.avatar.position, this.game.stat('magnet.radius'), this.game.flag('coins.seekPlayer'), (v, coins) =>
      this.game.collect(v, coins),
    );
    this.netHooks?.postPhysics(dt);
    this.chaos.update(dt, this.phys.objs, fast);
    this.jelly(dt, comfort);
    this.fx?.update(dt, this.time);
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

    this.rig.update(dt, this.focus, this.lastFocusEntry);
    this.avatar.setView(this.rig.avatarView());
    this.avatar.lookTarget = this.rig.mode === 'first' ? null : this.camera.position;
    this.updateAim();

    // Hint text
    const near = this.nearestScreen();
    const extra = this.focus ? '' : this.garage?.hint() || this.interact.hint() || this.chaos.hint();
    this.hint = this.focus
      ? 'Click the screen to play · Esc / E to step back'
      : extra
        ? extra
        : near
        ? near.os.screen === 'off'
          ? 'E — power on the crusty PC'
          : 'E — use this screen'
        : 'WASD move · Mouse look · V camera · Shift sprint · Space jump · F flop · G grab · T skills';

    this.gfx.setQuality((this.game.state.settings.quality ?? 'auto') as Quality);
    this.gfx.setFocus(this.rig.focusBlend);
    this.gfx.render(dt);
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

  /** Centre-of-view target and its crosshair hint. */
  private updateAim(): void {
    if (this.focus || this.rig.focusBlend > 0.05) {
      this.aim = null;
      this.aimHint = '';
      return;
    }
    const a = (this.aim = aimAt({
      camera: this.camera,
      phys: this.phys,
      avatar: this.avatar,
      screenObjs: () => this.screens.map((s) => s.obj),
      heldObj: () => this.interact.held?.obj ?? null,
    }));
    if (!a || this.interact.held) {
      this.aimHint = '';
      return;
    }
    if (a.kind === 'screen') {
      this.aimHint = this.screens[a.index]?.os.screen === 'off' ? 'E — power on the PC' : 'E — use screen';
    } else if (a.kind === 'prop') {
      const toppled = new THREE.Vector3(0, 1, 0).applyQuaternion(a.obj.mesh.quaternion).y <= 0.9;
      this.aimHint = this.interact.isHeavy(a.obj) ? 'G — shove' : toppled ? 'R — stand up · G — grab' : 'G — grab';
    } else this.aimHint = this.game.garage.unlocked() ? '' : '🔒 Locked door — buy the Garage Key in eBuy';
  }

  private lastFocusEntry: ScreenEntry | null = null;
  private lastFocus(): ScreenEntry | null {
    return this.lastFocusEntry;
  }
}
