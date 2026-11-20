import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics, PhysObj } from './physics';
import { mat, shadowed } from './room';
import { fabric } from './textures';

/**
 * Player avatar: a dynamic capsule with locked rotation while walking.
 * "Flopping" unlocks rotation (ragdoll-lite) and tips the whole body over.
 */
export class Avatar {
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly obj: PhysObj;
  readonly materials: THREE.MeshStandardMaterial[] = [];
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private walkT = 0;
  ragdoll = 0;
  airTime = 0;
  facing = 0;

  constructor(
    private readonly phys: Physics,
    scene: THREE.Scene,
    spawn: THREE.Vector3,
  ) {
    const R = phys.R;
    const hoodie = mat('#ffffff', 0.9, 0, { map: fabric('#4a6fa5') });
    const pants = mat('#ffffff', 0.9, 0, { map: fabric('#2d2d38') });
    const skin = mat('#e8b896', 0.55);
    const shoe = mat('#f2f2f2', 0.5);
    this.materials.push(hoodie, pants, skin, shoe);
    skin.userData.noSkin = true;
    shoe.userData.noSkin = true;
    pants.userData.noSkin = true;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 8, 16), hoodie);
    torso.position.y = 0.2;
    torso.scale.set(1, 1, 0.75);
    this.group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), skin);
    head.position.y = 0.66;
    this.group.add(head);
    const hairM = mat('#3b2a1e', 0.8);
    hairM.userData.noSkin = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2.2), hairM);
    hair.position.y = 0.68;
    this.group.add(hair);
    for (const side of [-1, 1]) {
      const eyeM = mat('#111', 0.2);
      eyeM.userData.noSkin = true;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), eyeM);
      eye.position.set(side * 0.055, 0.68, -0.135);
      this.group.add(eye);
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.1, -0.12, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 6, 12), pants);
      leg.position.y = -0.28;
      legPivot.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), shoe);
      foot.position.set(0, -0.55, -0.04);
      legPivot.add(foot);
      this.group.add(legPivot);
      this.legs.push(legPivot);
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.27, 0.4, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 6, 12), hoodie);
      arm.position.y = -0.22;
      armPivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin);
      hand.position.y = -0.46;
      armPivot.add(hand);
      armPivot.rotation.z = side * 0.12;
      this.group.add(armPivot);
      this.arms.push(armPivot);
    }
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
    if (this.ragdoll <= 0) this.group.quaternion.setFromEuler(new THREE.Euler(0, this.facing + Math.PI, 0));
  }

  private animate(dt: number, speed: number): void {
    this.walkT += dt * speed * 4;
    const swing = Math.min(1, speed / 2) * 0.7;
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.walkT + i * Math.PI) * swing));
    this.arms.forEach((a, i) => (a.rotation.x = Math.sin(this.walkT + i * Math.PI + Math.PI) * swing * 0.8));
  }
}
