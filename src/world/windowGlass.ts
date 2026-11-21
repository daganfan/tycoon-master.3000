import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '@/sim/game';
import type { Physics, PhysObj } from './physics';
import type { RoomRefs } from './room';
import { ROOM, WINDOW } from './room';
import type { Sfx } from './audio';

/** Impact speed (m/s, towards the glass) that shatters it. */
export const BREAK_SPEED = 4.2;
/** Play time (s) before Mom calls the Window Guy herself. */
export const AUTO_REPAIR = 240;
const SHARDS = 28;
const SHARD_LIFE = 30;
const FLAG = 'window:broken';

/** Collision groups: shards never touch the player (no damage, no tripping). */
const AVATAR_GROUP = 0x0002;
const SHARD_GROUP = 0x0004;
const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

/** Is a moving object about to hit the glass hard enough to break it? Pure, for tests. */
export function hitsGlass(p: THREE.Vector3Like, v: THREE.Vector3Like, radius = 0.1): boolean {
  const glassX = ROOM.x1 + 0.11;
  if (v.x < BREAK_SPEED * 0.75 || Math.hypot(v.x, v.y, v.z) < BREAK_SPEED) return false;
  if (p.x + radius < glassX - 0.45 || p.x - radius > glassX + 0.05) return false;
  return Math.abs(p.z - WINDOW.z) < WINDOW.w / 2 + radius * 0.5 && Math.abs(p.y - WINDOW.y) < WINDOW.h / 2 + radius * 0.5;
}

interface Shard {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null;
  age: number;
}

/**
 * The bedroom window: a breakable glass collider. A thrown or flying object
 * that hits it fast enough shatters it into pooled physical shards (they
 * never hit the player and vanish after a while). It is fixed by the Window
 * Guy (eBuy) or, after a few minutes, by Mom.
 */
export class WindowGlass {
  private collider: RAPIER.Collider | null = null;
  private readonly shards: Shard[] = [];
  private readonly shardMat: THREE.MeshStandardMaterial;
  private readonly hole: THREE.Mesh;
  private brokenFor = 0;

  constructor(
    private readonly game: Game,
    private readonly phys: Physics,
    scene: THREE.Scene,
    private readonly room: RoomRefs,
    private readonly sfx: Sfx,
  ) {
    this.shardMat = new THREE.MeshStandardMaterial({ color: '#d8ecf5', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, envMapIntensity: 2 });
    // Jagged remains of the pane, shown while broken.
    this.hole = new THREE.Mesh(brokenPaneGeo(WINDOW.w - 0.04, WINDOW.h - 0.04), room.glass);
    this.hole.position.copy(room.pane.position);
    this.hole.visible = false;
    this.hole.renderOrder = 2;
    room.windowGroup.add(this.hole);
    for (let i = 0; i < SHARDS; i++) {
      const m = new THREE.Mesh(shardGeo(i), this.shardMat);
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      this.shards.push({ mesh: m, body: null, age: 0 });
    }
    // The player never collides with shards.
    const av = phys.objs.find((o) => o.kind === 'avatar');
    if (av) for (let i = 0; i < av.body.numColliders(); i++) av.body.collider(i).setCollisionGroups(groups(AVATAR_GROUP, 0xffff));
    if (this.broken) this.showBroken(true);
    else this.addGlass();
    game.bus.on('itemBought', (e) => {
      if (e.id !== 'window_guy') return;
      this.game.state.items.window_guy = 0;
      this.repair('guy');
    });
  }

  get broken(): boolean {
    return this.game.state.flags.includes(FLAG);
  }

  private addGlass(): void {
    if (this.collider) return;
    this.collider = this.phys.staticBox({ x: 0.015, y: WINDOW.h / 2, z: WINDOW.w / 2 }, { x: ROOM.x1 + 0.11, y: WINDOW.y, z: WINDOW.z }, 0.3);
    this.collider.setRestitution(0.2);
  }

  private showBroken(b: boolean): void {
    this.room.pane.visible = !b;
    this.hole.visible = b;
  }

  /** Smash! `by` is what hit it; `vel` its velocity. */
  shatter(by: PhysObj | null, at: THREE.Vector3, vel: THREE.Vector3): void {
    if (this.broken) return;
    if (this.collider) {
      this.phys.world.removeCollider(this.collider, false);
      this.collider = null;
    }
    this.game.state.flags.push(FLAG);
    this.game.state.counters.windowBrokenAt = this.game.state.time;
    this.brokenFor = 0;
    this.showBroken(true);
    this.sfx.shatter();
    this.spawnShards(at, vel);
    this.game.bus.emit('world', { kind: 'windowBroken', object: by?.id ?? by?.kind, value: vel.length() });
    this.game.bus.emit('notify', { text: '📧 Mom: WHAT WAS THAT NOISE?! If that was the window, the Window Guy is on eBuy. It is coming out of your allowance.', tone: 'warn' });
  }

  repair(by: 'guy' | 'mom'): void {
    if (!this.broken) return;
    const f = this.game.state.flags;
    f.splice(f.indexOf(FLAG), 1);
    this.addGlass();
    this.showBroken(false);
    this.game.bus.emit('world', { kind: 'windowRepaired', object: by });
    this.game.bus.emit('notify', {
      text: by === 'guy' ? '🪟 The Window Guy fixed it in 4 minutes flat. He asked no questions.' : '📧 Mom: I called the Window Guy myself. We will talk about this at dinner.',
      tone: 'info',
    });
  }

  private spawnShards(at: THREE.Vector3, vel: THREE.Vector3): void {
    const R = this.phys.R;
    const dir = vel.clone().setY(0).normalize();
    this.shards.forEach((s, i) => {
      if (s.body) this.phys.world.removeRigidBody(s.body);
      const p = new THREE.Vector3(ROOM.x1 + 0.1, WINDOW.y + (Math.random() - 0.5) * WINDOW.h * 0.8, WINDOW.z + (Math.random() - 0.5) * WINDOW.w * 0.8);
      p.lerp(at, 0.25);
      // Most fly out with the ball, some spill back into the room onto the sill and floor.
      const inward = i % 3 === 0;
      const sp = 0.6 + Math.random() * 1.6;
      const v = inward
        ? new THREE.Vector3(-0.6 - Math.random() * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2)
        : dir.clone().multiplyScalar(sp).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.4));
      if (inward) p.x = ROOM.x1 - 0.02;
      const body = this.phys.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y, p.z)
          .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)))
          .setLinvel(v.x, v.y, v.z)
          .setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 })
          .setLinearDamping(0.3)
          .setAngularDamping(0.8)
          .setCcdEnabled(true),
      );
      const size = (s.mesh.geometry.boundingSphere?.radius ?? 0.05) * 0.8;
      this.phys.world.createCollider(
        R.ColliderDesc.cuboid(size, 0.004, size)
          .setDensity(800)
          .setFriction(0.6)
          .setRestitution(0.15)
          .setCollisionGroups(groups(SHARD_GROUP, 0xffff & ~AVATAR_GROUP)),
        body,
      );
      s.body = body;
      s.age = 0;
      s.mesh.visible = true;
    });
  }

  /** Call after the physics step: detect impacts, move shards, Mom's patience. */
  update(dt: number, objs: PhysObj[], held: PhysObj | null): void {
    if (!this.broken) {
      for (const o of objs) {
        if (o.kind === 'avatar' || o === held || !o.body.isDynamic()) continue;
        const t = o.body.translation();
        if (t.x < ROOM.x1 - 0.8) continue;
        const v = o.body.linvel();
        if (hitsGlass(t, v, 0.12)) {
          this.shatter(o, new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(v.x, v.y, v.z));
          break;
        }
      }
    } else {
      this.brokenFor += dt;
      const since = this.game.state.time - (this.game.state.counters.windowBrokenAt ?? this.game.state.time);
      if (this.brokenFor > 5 && since > AUTO_REPAIR) this.repair('mom');
    }
    for (const s of this.shards) {
      if (!s.body) continue;
      s.age += dt;
      const t = s.body.translation();
      if (s.age > SHARD_LIFE || t.y < -1) {
        this.phys.world.removeRigidBody(s.body);
        s.body = null;
        s.mesh.visible = false;
        continue;
      }
      const r = s.body.rotation();
      s.mesh.position.set(t.x, t.y, t.z);
      s.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      // Fade out in the last seconds.
      const fade = Math.min(1, (SHARD_LIFE - s.age) / 3);
      s.mesh.scale.setScalar(Math.max(0.01, fade));
    }
  }

  liveShards(): number {
    return this.shards.filter((s) => s.body).length;
  }
}

/** A random flat triangle-ish glass splinter. */
function shardGeo(seed: number): THREE.BufferGeometry {
  let x = seed * 9301 + 49297;
  const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const s = 0.03 + r() * 0.06;
  const pts = [new THREE.Vector2(0, s), new THREE.Vector2(-s * (0.4 + r() * 0.6), -s * (0.3 + r() * 0.5)), new THREE.Vector2(s * (0.4 + r() * 0.6), -s * (0.3 + r() * 0.6))];
  if (r() > 0.5) pts.splice(2, 0, new THREE.Vector2(-s * 0.1, -s * (0.8 + r() * 0.4)));
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  g.rotateX(-Math.PI / 2);
  g.computeBoundingSphere();
  return g;
}

/** The pane with a jagged hole punched through the middle. */
function brokenPaneGeo(w: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.lineTo(-w / 2, -h / 2);
  const hole = new THREE.Path();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = (i % 2 ? 0.55 : 0.85) * Math.min(w, h) * 0.45;
    const px = Math.cos(a) * rr * (w / h);
    const py = Math.sin(a) * rr;
    if (i === 0) hole.moveTo(px, py);
    else hole.lineTo(px, py);
  }
  hole.closePath();
  s.holes.push(hole);
  return new THREE.ShapeGeometry(s);
}
