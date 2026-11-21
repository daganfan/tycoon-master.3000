import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from './physics';
import type { Avatar } from './avatar';
import { InterpBuffer } from '@/net/interp';
import type { Emote, Pose } from '@/net/protocol';

/**
 * Multiplayer visuals: other players' avatars (colored hoodies, floating name
 * tags, smooth interpolation, walk / flop / emote animation) plus the hooks the
 * World calls so the net session can run inside the frame.
 */

/** Calls the World makes into the multiplayer session (null when offline). */
export interface NetHooks {
  /** Before the physics step: drive kinematic proxies / replicated bodies. */
  prePhysics(dt: number): void;
  /** After physics + cash: stream snapshots, render replicated coins, etc. */
  postPhysics(dt: number): void;
  /**
   * Pointer input on the focused screen (OS pixel coordinates). Return true to
   * swallow it (guests forward it to the host instead of their local copy).
   */
  screenInput(screen: number, kind: 'move' | 'click' | 'wheel', x: number, y: number): boolean;
}

export const EMOTE_ICON: Record<Emote, string> = { 0: '', 1: '👋', 2: '💃', 3: '😵' };

function labelTexture(text: string, color: string, sub = ''): { tex: THREE.CanvasTexture; aspect: number } {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = 'bold 44px system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(Math.max(g.measureText(text).width, sub ? g.measureText(sub).width * 0.6 : 0)) + 48;
  c.width = Math.max(96, w);
  c.height = sub ? 96 : 68;
  g.font = font;
  g.fillStyle = 'rgba(10,12,18,0.72)';
  g.beginPath();
  g.roundRect(2, 2, c.width - 4, c.height - 4, 22);
  g.fill();
  g.fillStyle = color;
  g.fillRect(14, 16, 8, c.height - 32);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, 32, sub ? 34 : c.height / 2 + 2);
  if (sub) {
    g.font = 'bold 26px system-ui, sans-serif';
    g.fillStyle = '#ffd24a';
    g.fillText(sub, 32, 74);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: c.width / c.height };
}

function emojiTexture(e: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const std = (color: string, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

/** A floating emoji over someone's head (also used for your own avatar). */
export class EmoteBubble {
  readonly sprite: THREE.Sprite;
  private current: Emote = 0;
  constructor(scene: THREE.Scene) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.sprite.scale.set(0.34, 0.34, 1);
    this.sprite.visible = false;
    this.sprite.renderOrder = 10;
    scene.add(this.sprite);
  }
  set(e: Emote, at: THREE.Vector3, time: number): void {
    if (e !== this.current) {
      this.current = e;
      const m = this.sprite.material;
      m.map?.dispose();
      m.map = e ? emojiTexture(EMOTE_ICON[e]) : null;
      m.needsUpdate = true;
    }
    this.sprite.visible = e !== 0;
    this.sprite.position.set(at.x, at.y + 1.42 + Math.sin(time * 4) * 0.04, at.z);
  }
  dispose(): void {
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
    this.sprite.removeFromParent();
  }
}

/**
 * Another player's body. Mirrors the local avatar's proportions so poses map
 * 1:1, plus a physics proxy capsule:
 *  - 'pusher' (on the host): a dynamic, avatar-weight capsule that chases the
 *    guest's reported position, slightly fatter than the guest's own collider so
 *    walking into a prop on the guest's screen shoves it in the host's world.
 *  - 'solid' (on guests): a kinematic capsule, so other players block you.
 */
export class RemoteAvatar {
  readonly group = new THREE.Group();
  readonly buf = new InterpBuffer(1 / 15);
  readonly body: RAPIER.RigidBody;
  private rig = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private hoodie: THREE.MeshStandardMaterial;
  private tag: THREE.Sprite;
  private bubble: EmoteBubble;
  private walkT = 0;
  private label = '';
  speed = 0;
  ragdoll = false;
  emote: Emote = 0;

  constructor(
    private readonly phys: Physics,
    private readonly scene: THREE.Scene,
    public name: string,
    public color: string,
    private readonly proxy: 'pusher' | 'solid' = 'solid',
  ) {
    this.hoodie = std(color);
    const pants = std('#2d2d38');
    const skin = std('#e8b896', 0.55);
    const shoe = std('#f2f2f2', 0.5);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 6, 12), this.hoodie);
    torso.position.y = 0.2;
    torso.scale.set(1, 1, 0.75);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin);
    head.position.y = 0.66;
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2),
      std('#3b2a1e', 0.8),
    );
    hair.position.y = 0.68;
    this.rig.add(torso, head, hair);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), std('#111', 0.2));
      eye.position.set(side * 0.055, 0.68, -0.135);
      const leg = new THREE.Group();
      leg.position.set(side * 0.1, -0.12, 0);
      const legM = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 4, 10), pants);
      legM.position.y = -0.28;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), shoe);
      foot.position.set(0, -0.55, -0.04);
      leg.add(legM, foot);
      const arm = new THREE.Group();
      arm.position.set(side * 0.27, 0.4, 0);
      const armM = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 10), this.hoodie);
      armM.position.y = -0.22;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin);
      hand.position.y = -0.46;
      arm.add(armM, hand);
      arm.rotation.z = side * 0.12;
      this.rig.add(eye, leg, arm);
      this.legs.push(leg);
      this.arms.push(arm);
    }
    this.rig.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    this.group.add(this.rig);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.tag.renderOrder = 10;
    this.setLabel(name, color);
    scene.add(this.group, this.tag);
    this.bubble = new EmoteBubble(scene);
    this.group.visible = false;

    const R = phys.R;
    if (proxy === 'pusher') {
      this.body = phys.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(0, -50, 0)
          .lockRotations()
          .setGravityScale(0)
          .setLinearDamping(0)
          .setCcdEnabled(true),
      );
      phys.world.createCollider(
        R.ColliderDesc.capsule(0.45, 0.31).setTranslation(0, 0.05, 0).setFriction(0.2).setDensity(450),
        this.body,
      );
    } else {
      this.body = phys.world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0),
      );
      phys.world.createCollider(
        R.ColliderDesc.capsule(0.45, 0.25).setTranslation(0, 0.05, 0).setFriction(0.2),
        this.body,
      );
    }
  }

  setLabel(name: string, color: string, sub = ''): void {
    const key = `${name}|${color}|${sub}`;
    if (key === this.label) return;
    this.label = key;
    this.name = name;
    if (color !== this.color) {
      this.color = color;
      this.hoodie.color.set(color);
    }
    const { tex, aspect } = labelTexture(name, color, sub);
    this.tag.material.map?.dispose();
    this.tag.material.map = tex;
    this.tag.material.needsUpdate = true;
    const h = sub ? 0.2 : 0.14;
    this.tag.scale.set(h * aspect, h, 1);
  }

  push(t: number, pose: Pose): void {
    this.buf.push({ t, p: pose.p, q: pose.q });
    this.speed = pose.s;
    this.ragdoll = pose.r === 1;
    this.emote = pose.e;
  }

  /** Latest known position (no interpolation), for pickups and proximity. */
  latest(): THREE.Vector3 | null {
    const s = this.buf.latest;
    return s ? new THREE.Vector3(...s.p) : null;
  }

  update(dt: number, renderT: number, time: number): void {
    const s = this.buf.sample(renderT);
    if (!s) return;
    this.group.visible = true;
    this.group.position.set(...s.p);
    this.group.quaternion.set(...s.q);
    this.drive(s.p, dt);
    this.tag.position.set(s.p[0], s.p[1] + 1.08, s.p[2]);
    this.bubble.set(this.emote, this.group.position, time);
    this.animate(dt, time);
  }

  private drive(p: [number, number, number], dt: number): void {
    if (this.proxy === 'solid') {
      this.body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
      return;
    }
    // Chase the target with a velocity; heavy things push back, far jumps teleport.
    const t = this.body.translation();
    const dx = p[0] - t.x;
    const dy = p[1] - t.y;
    const dz = p[2] - t.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 1.5) {
      this.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const k = 1 / Math.max(dt, 1 / 60);
    const max = 8;
    const sp = Math.min(max, d * k);
    const f = d > 1e-4 ? sp / d : 0;
    this.body.setLinvel({ x: dx * f, y: dy * f, z: dz * f }, true);
  }

  private animate(dt: number, time: number): void {
    const speed = this.ragdoll ? 0 : this.speed;
    this.walkT += dt * speed * 4;
    const swing = Math.min(1, speed / 2) * 0.7;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.walkT + i * Math.PI) * swing));
    this.arms.forEach((a, i) => {
      a.rotation.x = Math.sin(this.walkT + i * Math.PI + Math.PI) * swing * 0.8;
      a.rotation.z = (i ? 1 : -1) * 0.12;
    });
    if (this.ragdoll) return;
    if (this.emote === 1) {
      // wave: right arm up and waggling
      const arm = this.arms[1]!;
      arm.rotation.x = 0;
      arm.rotation.z = 2.6 + Math.sin(time * 10) * 0.35;
    } else if (this.emote === 2) {
      // dance: bounce, sway, arms in the air
      this.rig.position.y = Math.abs(Math.sin(time * 7)) * 0.08;
      this.rig.rotation.y = Math.sin(time * 3.5) * 0.6;
      this.arms.forEach((a, i) => {
        a.rotation.x = 0;
        a.rotation.z = (i ? 1 : -1) * (2.4 + Math.sin(time * 7 + i * Math.PI) * 0.4);
      });
      this.legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 7 + i * Math.PI) * 0.4));
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.tag.removeFromParent();
    this.bubble.dispose();
    this.phys.world.removeRigidBody(this.body);
    void this.scene;
  }
}

/** The local player's pose, as sent over the wire. */
export function avatarPose(a: Avatar, emote: Emote): Pose {
  const t = a.body.translation();
  const v = a.body.linvel();
  const q = a.group.quaternion;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    p: [r3(t.x), r3(t.y), r3(t.z)],
    q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)],
    s: r3(Math.hypot(v.x, v.z)),
    r: a.ragdoll > 0 ? 1 : 0,
    e: emote,
  };
}
