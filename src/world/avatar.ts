import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics, PhysObj } from './physics';
import { shadowed } from './room';
import { buildAvatarModel, type AvatarRig } from './avatarModel';

const tmpV = new THREE.Vector3();
const tmpE = new THREE.Euler();

/**
 * Player avatar: a dynamic capsule with locked rotation while walking.
 * "Flopping" unlocks rotation (ragdoll-lite) and tips the whole body over.
 */
export class Avatar {
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly obj: PhysObj;
  readonly materials: THREE.MeshStandardMaterial[] = [];
  legs: THREE.Object3D[] = [];
  arms: THREE.Object3D[] = [];
  private walkT = 0;
  private readonly rig: AvatarRig;
  private t = 0;
  private blinkT = 2;
  private lookYaw = 0;
  private lookPitch = 0;
  /** World point the head glances at (usually the camera). */
  lookTarget: THREE.Vector3 | null = null;
  ragdoll = 0;
  airTime = 0;
  facing = 0;

  constructor(
    private readonly phys: Physics,
    scene: THREE.Scene,
    spawn: THREE.Vector3,
  ) {
    const R = phys.R;
    const rig = buildAvatarModel();
    this.rig = rig;
    this.materials.push(...rig.materials);
    this.group.add(rig.root);
    this.legs = rig.hips;
    this.arms = rig.shoulders;
    scene.add(shadowed(this.group));
    this.body = phys.createBody({ pos: spawn, linearDamping: 0.2, angularDamping: 1 });
    this.body.lockRotations(true, true);
    phys.addCollider(this.body, R.ColliderDesc.capsule(0.45, 0.25).setTranslation(0, 0.05, 0), { density: 450, friction: 0.2, restitution: 0 });
    this.obj = phys.track(this.group, this.body, 'avatar', 'avatar', { restitution: 0, friction: 0.2, density: 450 });
    this.obj.mesh = this.group;
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  grounded(): boolean {
    const t = this.body.translation();
    const ray = new this.phys.R.Ray({ x: t.x, y: t.y - 0.6, z: t.z }, { x: 0, y: -1, z: 0 });
    const hit = this.phys.world.castRay(ray, 0.25, true, undefined, undefined, undefined, this.body);
    return !!hit;
  }

  /** Flop over like a sack of potatoes. Returns true if moving fast enough to count as mayhem. */
  flop(): boolean {
    if (this.ragdoll > 0) return false;
    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    this.ragdoll = 2.6;
    this.body.lockRotations(false, true);
    const m = this.body.mass();
    this.body.applyImpulse({ x: v.x * m * 0.3, y: 2.5 * m, z: v.z * m * 0.3 }, true);
    this.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 30 }, true);
    return speed > 2.8;
  }

  update(dt: number, move: THREE.Vector3, sprint: boolean, jump: boolean, enabled: boolean): void {
    const v = this.body.linvel();
    const onGround = this.grounded();
    this.airTime = onGround ? 0 : this.airTime + dt;
    if (this.ragdoll > 0) {
      this.ragdoll -= dt;
      if (this.ragdoll <= 0) {
        const t = this.body.translation();
        this.body.setTranslation({ x: t.x, y: Math.max(t.y, 0.9), z: t.z }, true);
        this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.body.lockRotations(true, true);
      }
      this.animate(dt, 0);
      return;
    }
    const speed = sprint ? 3.6 : 2.1;
    const target = enabled ? move.clone().multiplyScalar(speed) : new THREE.Vector3();
    const blend = onGround ? 0.25 : 0.05;
    this.body.setLinvel({ x: v.x + (target.x - v.x) * blend, y: v.y, z: v.z + (target.z - v.z) * blend }, true);
    if (jump && onGround && enabled) this.body.applyImpulse({ x: 0, y: 4.2 * this.body.mass(), z: 0 }, true);
    if (move.lengthSq() > 0.01 && enabled) this.facing = Math.atan2(move.x, move.z);
    // keep the visual facing direction (body itself does not rotate)
    this.animate(dt, Math.hypot(v.x, v.z));
  }

  /** Physics sync resets the mesh rotation each step; re-apply the walking facing direction. */
  postSync(): void {
    if (this.ragdoll <= 0) this.group.quaternion.setFromEuler(tmpE.set(0, this.facing + Math.PI, 0));
  }

  private animate(dt: number, speed: number): void {
    const rig = this.rig;
    this.t += dt;
    this.walkT += dt * speed * 4;
    const swing = Math.min(1, speed / 2) * 0.7;
    const flail = this.ragdoll > 0;
    for (let i = 0; i < 2; i++) {
      const ph = this.walkT + i * Math.PI;
      const hip = rig.hips[i]!;
      hip.rotation.x = Math.sin(ph) * swing;
      // knee bends while the leg swings forward, straightens on contact
      rig.knees[i]!.rotation.x = -(0.05 + Math.max(0, Math.cos(ph)) * 1.1) * swing - (flail ? 0.6 : 0);
      const sh = rig.shoulders[i]!;
      sh.rotation.x = flail ? Math.sin(this.t * 14 + i) * 1.2 : Math.sin(ph + Math.PI) * swing * 0.8;
      sh.rotation.z = (i ? 1 : -1) * (flail ? 1.1 + Math.sin(this.t * 11 + i * 2) * 0.5 : 0.1 + Math.sin(this.t * 1.4) * 0.01);
      rig.elbows[i]!.rotation.x = 0.18 + swing * 0.45 + (flail ? 0.8 : 0);
    }
    // idle breathing
    const breath = Math.sin(this.t * 2.1);
    rig.torso.scale.set(1 + breath * 0.008, 1 + breath * 0.01, 1 + breath * 0.012);
    rig.shoulders[0]!.position.y = rig.shoulders[1]!.position.y = 0.43 + breath * 0.004;
    rig.headPivot.position.y = 0.54 + breath * 0.004 - Math.abs(Math.sin(this.walkT)) * 0.012 * swing;
    // blinking
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3.5;
    const lid = this.blinkT < 0 ? 0.1 : 1;
    for (const e of rig.eyes) e.scale.y = lid;
    // glance at the camera when it is in front of us
    let yaw = 0;
    let pitch = 0;
    if (this.lookTarget && !flail) {
      this.group.updateWorldMatrix(true, false);
      const l = this.group.worldToLocal(tmpV.copy(this.lookTarget));
      const a = Math.atan2(-l.x, -l.z);
      if (Math.abs(a) < 1.9) {
        yaw = THREE.MathUtils.clamp(a, -0.7, 0.7);
        pitch = THREE.MathUtils.clamp(Math.atan2(l.y - 0.7, Math.hypot(l.x, l.z)), -0.3, 0.35);
      }
    }
    const k = 1 - Math.pow(0.03, dt);
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    rig.headPivot.rotation.set(this.lookPitch * 0.7, this.lookYaw, 0, 'YXZ');
  }
}
