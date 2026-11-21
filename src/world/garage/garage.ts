import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { formatCash } from '@/core/num';
import { GARAGE } from '@/content/garage';
import { itemById } from '@/content/items';
import type { Game } from '@/sim/game';
import type { Physics, PhysObj } from '../physics';
import type { Cash } from '../cash';
import type { Avatar } from '../avatar';
import type { Interact } from '../interact';
import { DOOR, ROOM, type RoomRefs } from '../room';
import { labelTex } from '../textures';
import { areaAt } from './areas';
import { buildGarageShell, type GarageShell } from './building';
import { Factory3D } from './factory3d';
import { GarageSound, Particles } from './fx';
import { GARAGE_PROPS, buildGarageProp } from './garageProps';
import { GARAGE_LAYER, SHADOW_ONLY_LAYER } from './perf';

/** What the garage needs from the world. */
export interface GarageHost {
  readonly game: Game;
  readonly scene: THREE.Scene;
  readonly phys: Physics;
  readonly cash: Cash;
  readonly avatar: Avatar;
  readonly interact: Interact;
  readonly room: RoomRefs;
  readonly camera: THREE.PerspectiveCamera;
}

const DOOR_OPEN = -1.45;
const DOORWAY_BOX = new THREE.Box3(new THREE.Vector3(DOOR.x - DOOR.w / 2, 0, ROOM.z1 - 0.05), new THREE.Vector3(DOOR.x + DOOR.w / 2, DOOR.h, GARAGE.z0 + 0.05));

/**
 * Phase 2 in the 3D world: the garage behind the bedroom door, the door
 * itself (locked until the Garage Key), the physical factory and the garage
 * eBuy props.
 */
export class Garage {
  readonly shell: GarageShell;
  readonly factory: Factory3D;
  readonly sound: GarageSound;
  readonly particles: Particles;
  readonly props: PhysObj[] = [];
  private doorBody: RAPIER.RigidBody;
  private doorAngle = 0;
  private doorTarget = 0;
  private rattle = 0;
  private rattleCd = 0;
  private lockedHint = 0;
  private time = 0;
  private sun: { light: THREE.DirectionalLight; cam: { l: number; r: number; t: number; b: number; far: number }; target: THREE.Vector3; offset: THREE.Vector3 } | null = null;
  private sunArea: 'bedroom' | 'garage' = 'bedroom';
  private signUnlocked = false;
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();

  constructor(private readonly w: GarageHost) {
    const g = w.game;
    // Physical scrap now carries the factory's value: switch off the analytic production.
    g.garage.live = true;
    this.shell = buildGarageShell(w.scene, w.phys);
    this.particles = new Particles(w.scene);
    this.sound = new GarageSound(() => g.state.settings.volume);
    this.factory = new Factory3D({ game: g, scene: w.scene, phys: w.phys, cash: w.cash, avatar: w.avatar, sound: this.sound, particles: this.particles, plot: this.shell.plot });

    // The bedroom door becomes a kinematic body we can swing.
    const R = w.phys.R;
    const pivot = w.room.door;
    this.doorBody = w.phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pivot.position.x, 0, pivot.position.z));
    w.phys.world.createCollider(R.ColliderDesc.cuboid(DOOR.w / 2, DOOR.h / 2, 0.03).setTranslation(DOOR.w / 2, DOOR.h / 2, 0).setFriction(0.5), this.doorBody);
    if (this.unlocked()) {
      this.doorAngle = this.doorTarget = DOOR_OPEN;
      this.applyDoor();
      this.unlockSign();
    }

    for (const [id, count] of Object.entries(g.state.items)) for (let i = 0; i < count; i++) this.spawnProp(id, i);
    g.bus.on('itemBought', (e) => {
      this.spawnProp(e.id, e.count - 1);
      if (e.id === 'garage_key') this.openDoor();
    });
    this.findSun();
    // Garage content renders on its own layer: the main camera sees it, the bedroom's shadow passes don't.
    w.camera.layers.enable(GARAGE_LAYER);
    w.scene.traverse((o) => {
      const l = o as THREE.Light & { shadow?: THREE.LightShadow };
      if (l.isLight && l.castShadow && l.shadow && !this.shell.lights.includes(l)) l.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
    });
  }

  /** Skip drawing the garage when the camera can't possibly see it. */
  private updateVisibility(): void {
    const cam = this.w.camera;
    let show = areaAt(cam.position).id === 'garage' || areaAt(this.w.avatar.position).id === 'garage';
    if (!show && this.doorAngle < -0.05) {
      cam.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      show = this.frustum.intersectsBox(DOORWAY_BOX);
    }
    if (show === this.shell.root.visible) return;
    this.shell.root.visible = show;
    this.factory.root.visible = show;
    this.particles.points.visible = show;
    for (const l of this.shell.lights) l.visible = show;
  }

  private unlocked(): boolean {
    return this.w.game.garage.unlocked();
  }

  /* ------------------------------------------------------------ door */

  private openDoor(): void {
    this.doorTarget = DOOR_OPEN;
    this.sound.creak();
    this.unlockSign();
  }

  /** Open or close the door by hand. Without the Garage Key it only rattles. */
  toggleDoor(): 'open' | 'closed' | 'locked' {
    if (!this.unlocked()) {
      this.rattle = 0.6;
      this.rattleCd = 1.6;
      this.lockedHint = 2;
      this.sound.rattle();
      return 'locked';
    }
    this.doorTarget = this.doorTarget === 0 ? DOOR_OPEN : 0;
    this.sound.creak();
    return this.doorTarget === 0 ? 'closed' : 'open';
  }

  private unlockSign(): void {
    if (this.signUnlocked) return;
    this.signUnlocked = true;
    const m = this.w.room.garageSign.material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    m.map = labelTex('GARAGE →\n🔓 Open!', '#8ce99a', '#1b1b1b', 512, 320, 54);
    m.needsUpdate = true;
  }

  private applyDoor(): void {
    const pivot = this.w.room.door;
    pivot.rotation.y = this.doorAngle;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.doorAngle);
    this.doorBody.setNextKinematicRotation(q);
  }

  private updateDoor(dt: number): void {
    const p = this.w.avatar.position;
    const nearDoor = Math.abs(p.x - DOOR.x) < DOOR.w / 2 + 0.15 && p.z > ROOM.z1 - 0.75 && p.z < ROOM.z1 + 0.1;
    this.rattleCd -= dt;
    if (!this.unlocked()) {
      if (nearDoor) {
        this.lockedHint = 1.5;
        if (this.rattleCd <= 0) {
          this.rattleCd = 1.6;
          this.rattle = 0.6;
          this.sound.rattle();
        }
      }
    }
    this.lockedHint -= dt;
    this.rattle = Math.max(0, this.rattle - dt);
    const prev = this.doorAngle;
    this.doorAngle += (this.doorTarget - this.doorAngle) * Math.min(1, dt * 2.2);
    const jiggle = this.rattle > 0 ? Math.sin(this.rattle * 60) * 0.025 * this.rattle : 0;
    if (Math.abs(prev - this.doorAngle) > 1e-5 || jiggle !== 0 || this.rattle > 0) {
      this.doorAngle += jiggle;
      this.applyDoor();
      this.doorAngle -= jiggle;
    }
  }

  /* ------------------------------------------------------------ props */

  private spawnProp(id: string, index: number): void {
    const spec = GARAGE_PROPS[id];
    const def = itemById(id);
    if (!spec || !def) return;
    const spot = spec.spots[index % spec.spots.length]!;
    const mesh = buildGarageProp(id);
    if (!mesh) return;
    if (id === 'g_disco_lamp') {
      for (const l of this.shell.lights) l.intensity *= 1.3;
      for (const t of this.shell.tubes) t.emissiveIntensity *= 1.3;
    }
    if (!spec.half) {
      mesh.position.set(...spot);
      mesh.rotation.y = spec.ry ?? 0;
      this.shell.root.add(mesh);
      return;
    }
    this.w.scene.add(mesh);
    const R = this.w.phys.R;
    const [hx, hy, hz] = spec.half;
    const body = this.w.phys.createBody({ pos: { x: spot[0], y: spot[1] + 0.02, z: spot[2] }, angularDamping: 0.6, linearDamping: 0.4 });
    this.w.phys.addCollider(body, R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, hy, 0), { density: 300, friction: 0.8, restitution: 0.1 });
    const o = this.w.phys.track(mesh, body, `garage:${id}`, 'props', { restitution: 0.1, friction: 0.8, density: 300 });
    this.w.interact.register(o, `${id}#${index}`);
    this.props.push(o);
  }

  /* ------------------------------------------------------------ lighting */

  /** Remember the sun so its shadow camera can follow the player into the garage. */
  private findSun(): void {
    let light: THREE.DirectionalLight | null = null;
    this.w.scene.traverse((o) => {
      if (!light && (o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) light = o as THREE.DirectionalLight;
    });
    if (!light) return;
    const l = light as THREE.DirectionalLight;
    const c = l.shadow.camera;
    this.sun = { light: l, cam: { l: c.left, r: c.right, t: c.top, b: c.bottom, far: c.far }, target: l.target.position.clone(), offset: l.position.clone().sub(l.target.position) };
  }

  private updateSun(): void {
    if (!this.sun) return;
    const area = areaAt(this.w.avatar.position).id;
    if (area === this.sunArea) return;
    this.sunArea = area;
    const { light, cam, target, offset } = this.sun;
    const c = light.shadow.camera;
    if (area === 'garage') c.layers.enable(GARAGE_LAYER);
    else c.layers.disable(GARAGE_LAYER);
    if (area === 'garage') {
      const t = new THREE.Vector3((GARAGE.x0 + GARAGE.x1) / 2, 0.5, (GARAGE.z0 + GARAGE.z1) / 2);
      light.target.position.copy(t);
      light.position.copy(t).add(offset);
      c.left = -6.5;
      c.right = 6.5;
      c.top = 6.5;
      c.bottom = -6.5;
      c.far = cam.far + 6;
    } else {
      light.target.position.copy(target);
      light.position.copy(target).add(offset);
      c.left = cam.l;
      c.right = cam.r;
      c.top = cam.t;
      c.bottom = cam.b;
      c.far = cam.far;
    }
    light.target.updateMatrixWorld();
    c.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------ frame */

  /** Call once per frame, before the physics step. */
  update(dt: number): void {
    this.time += dt;
    this.updateDoor(dt);
    this.updateSun();
    this.updateVisibility();
    if (this.w.avatar.position.z > GARAGE.z0 + 0.3 && this.unlocked()) this.w.game.setFlag('garage:entered');
    this.factory.update(dt);
    const rec = this.shell.root.getObjectByName('rec');
    if (rec) rec.visible = Math.sin(this.time * 4) > 0;
  }

  hint(): string {
    if (this.lockedHint > 0 && !this.unlocked()) return `🔒 Locked — buy the Garage Key in eBuy (${formatCash(itemById('garage_key')!.baseCost)})`;
    return this.factory.hint();
  }
}
