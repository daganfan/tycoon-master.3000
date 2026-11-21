import * as THREE from 'three';
import type { Physics, PhysObj } from './physics';
import { buildMonitor, mat, rbox, shadowed, ROOM } from './room';
import { fabric, posterTex } from './textures';
import { createRecipeProp, hasRecipe } from './decor/factory';
import { hashId, placeInWorld } from './placement';

export interface PropResult {
  obj?: PhysObj;
  /** Present when the prop has a screen that should run its own TycoonOS. */
  screen?: { mesh: THREE.Mesh; obj: PhysObj; w: number; h: number };
  light?: THREE.PointLight;
}

const { x0, x1, z0, z1 } = ROOM;

/** Footprint (x, height, z) and preferred surface of each built-in prop; the placement solver finds the actual spot. */
const PROPS: Record<string, { hint: string; size: [number, number, number] }> = {
  monitor: { hint: 'monitor', size: [0.47, 0.5, 0.2] },
  keyboard: { hint: 'keyboard', size: [0.46, 0.05, 0.16] },
  pc: { hint: 'floor', size: [0.66, 1.1, 0.96] },
  fan: { hint: 'desk', size: [0.24, 0.42, 0.22] },
  lamp: { hint: 'desk', size: [0.16, 0.37, 0.16] },
  plant: { hint: 'floor', size: [0.44, 0.9, 0.44] },
  beanbag: { hint: 'floor', size: [0.86, 0.56, 0.86] },
  box: { hint: 'floor', size: [0.42, 0.42, 0.42] },
  piggy: { hint: 'shelf', size: [0.3, 0.2, 0.2] },
  poster: { hint: 'wall', size: [0.45, 0.63, 0.01] },
};

/** Posters hang on fixed wall spots: [x, y, z, rotY]. */
const POSTER_SLOTS: [number, number, number, number][] = [
  [-1.25, 1.75, z0 + 0.005, 0],
  [x0 + 0.005, 1.75, -1.9, Math.PI / 2],
  [x1 - 0.005, 1.75, 1.6, -Math.PI / 2],
  [-2.9, 1.75, z1 - 0.005, Math.PI],
];

/** Where the solver puts a built-in prop (bottom-centre position + yaw). */
export function propSpot(phys: Physics, prop: string, index: number): { pos: THREE.Vector3; yaw: number } {
  const p = PROPS[prop];
  if (!p) return { pos: new THREE.Vector3(ROOM.cx, 0.5, ROOM.cz), yaw: 0 };
  const s = placeInWorld(phys, p.hint, new THREE.Vector3(...p.size), hashId(`${prop}#${index}`));
  return { pos: s.pos, yaw: s.yaw };
}

const POSTERS: [string, string, string][] = [['HUSTLE', '#e63946', '#f1faee'], ['STONKS', '#2a9d8f', '#ffffff'], ['NO\nSLEEP', '#111', '#ffcc00'], ['VIBES', '#7b2cbf', '#fff']];

/** Fixed poster spots, so recipe wall decor avoids them. */
export const reservedSpots = (): THREE.Vector3[] => POSTER_SLOTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));

/** True when createProp knows how to build `prop`. */
export const isKnownProp = (prop: string): boolean => prop in PROPS || hasRecipe(prop);

export function createProp(prop: string, index: number, scene: THREE.Scene, phys: Physics, deskY: number): PropResult {
  // Data-driven props: Junk Mart decor (`decor:<id>`) and newer eBuy gear.
  if (hasRecipe(prop)) {
    const r = createRecipeProp(prop, index, scene, phys, deskY, reservedSpots());
    return r ? { obj: r.obj, light: r.light } : {};
  }
  const R = phys.R;
  if (prop === 'poster') {
    const [x, y, z, ry] = POSTER_SLOTS[index % POSTER_SLOTS.length]!;
    const [t, bg, fg] = POSTERS[index % POSTERS.length]!;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.63), mat('#fff', 0.75, 0, { map: posterTex(t, bg, fg) }));
    m.position.set(x, y, z);
    m.rotation.set(0, ry, (index % 2 ? 1 : -1) * 0.03, 'YXZ');
    scene.add(m);
    return {};
  }
  if (!PROPS[prop]) return {};
  const spot = propSpot(phys, prop, index);
  const at = spot.pos;
  const yaw = spot.yaw;
  // Sturdy defaults: grippy, barely bouncy, damped; small things get CCD so they never tunnel.
  const body = (pos: THREE.Vector3Like, rotY = yaw, ccd = false) => phys.createBody({ pos, rot: new THREE.Euler(0, rotY, 0), angularDamping: 1, linearDamping: 0.3, ccd });
  switch (prop) {
    case 'monitor': {
      const m = buildMonitor(0.42, 0.26, false);
      scene.add(m.group);
      const b = body({ x: at.x, y: at.y + 0.004, z: at.z });
      // Wide, heavy foot + light panel: low centre of mass, hard to tip.
      phys.addCollider(b, R.ColliderDesc.cuboid(0.13, 0.01, 0.1).setTranslation(0, 0.01, -0.04), { density: 3200, friction: 1, restitution: 0.05 });
      phys.addCollider(b, R.ColliderDesc.cuboid(m.half.x, 0.15, 0.03).setTranslation(0, 0.16 + 0.13, 0), { density: 180, friction: 0.8, restitution: 0.05 });
      const obj = phys.track(m.group, b, 'monitor', 'pc', { restitution: 0.05, friction: 0.8, density: 180 });
      return { obj, screen: { mesh: m.screen, obj, w: 0.42, h: 0.26 } };
    }
    case 'keyboard': {
      const g = new THREE.Group();
      const k = rbox(0.44, 0.03, 0.14, 0.008, mat('#202226', 0.5));
      g.add(k);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 14; c++) {
          const key = rbox(0.024, 0.012, 0.024, 0.004, mat(r === 3 && c > 3 && c < 10 ? '#3a3d44' : '#2e3138', 0.6));
          key.position.set(-0.19 + c * 0.029, 0.02, -0.045 + r * 0.03);
          g.add(key);
        }
      scene.add(shadowed(g));
      const b = body({ x: at.x, y: at.y + 0.019, z: at.z }, yaw, true);
      phys.addCollider(b, R.ColliderDesc.cuboid(0.22, 0.015, 0.07), { density: 900, friction: 0.9, restitution: 0.05 });
      return { obj: phys.track(g, b, 'keyboard', 'props', { restitution: 0.05, friction: 0.9, density: 900 }) };
    }
    case 'pc': {
      // Side table + flat monitor, running its own OS. The monitor faces the middle of the room.
      const table = new THREE.Group();
      const top = rbox(0.6, 0.04, 0.9, 0.01, mat('#ece6d8', 0.45));
      top.position.y = 0.72;
      table.add(top);
      for (const [x, z] of [[-0.27, -0.42], [0.27, -0.42], [-0.27, 0.42], [0.27, 0.42]] as const) {
        const leg = rbox(0.04, 0.72, 0.04, 0.01, mat('#ece6d8', 0.45));
        leg.position.set(x, 0.36, z);
        table.add(leg);
      }
      scene.add(shadowed(table));
      // The solver picked the long side along z (yaw 0) or along x (yaw 90°); the monitor faces the room across it.
      const along = Math.abs(Math.sin(yaw)) > 0.5;
      const tableYaw = along ? Math.PI / 2 : 0;
      const monYaw = along ? (ROOM.cz > at.z ? 0 : Math.PI) : ROOM.cx > at.x ? Math.PI / 2 : -Math.PI / 2;
      const tb = body({ x: at.x, y: at.y + 0.003, z: at.z }, tableYaw);
      phys.addCollider(tb, R.ColliderDesc.cuboid(0.3, 0.02, 0.45).setTranslation(0, 0.72, 0), { density: 250, friction: 0.9, restitution: 0.04 });
      for (const [x, z] of [[-0.27, -0.42], [0.27, -0.42], [-0.27, 0.42], [0.27, 0.42]] as const)
        phys.addCollider(tb, R.ColliderDesc.cuboid(0.02, 0.35, 0.02).setTranslation(x, 0.35, z), { density: 2500, friction: 1, restitution: 0.04 });
      const tObj = phys.track(table, tb, 'table', 'desk', { restitution: 0.04, friction: 0.9, density: 250 });
      tObj.heavy = true;
      tObj.tops = [{ kind: 'table', x: 0, y: 0.74, z: 0, hw: 0.28, hd: 0.43, clear: 0.9 }];
      const m = buildMonitor(0.46, 0.29, false);
      scene.add(m.group);
      const mb = body({ x: at.x, y: at.y + 0.745, z: at.z }, monYaw);
      phys.addCollider(mb, R.ColliderDesc.cuboid(0.13, 0.01, 0.1).setTranslation(0, 0.01, -0.04), { density: 3200, friction: 1, restitution: 0.05 });
      phys.addCollider(mb, R.ColliderDesc.cuboid(m.half.x, 0.16, 0.03).setTranslation(0, 0.16 + 0.145, 0), { density: 180, friction: 0.8, restitution: 0.05 });
      const obj = phys.track(m.group, mb, 'monitor', 'pc', { restitution: 0.05, friction: 0.8, density: 180 });
      return { obj, screen: { mesh: m.screen, obj, w: 0.46, h: 0.29 } };
    }
    case 'fan': {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 24), mat('#e8e8e8', 0.4));
      g.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22), mat('#cfcfcf', 0.3, 0.6));
      pole.position.y = 0.12;
      g.add(pole);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.006, 8, 32), mat('#cfcfcf', 0.3, 0.8));
      cage.position.set(0, 0.28, 0.02);
      g.add(cage);
      const blades = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.005, 3), mat('#5fb3d8', 0.4));
      blades.rotation.x = Math.PI / 2;
      blades.position.set(0, 0.28, 0.02);
      blades.name = 'spin';
      g.add(blades);
      scene.add(shadowed(g));
      const b = body({ x: at.x, y: at.y + 0.016, z: at.z });
      phys.addCollider(b, R.ColliderDesc.cylinder(0.015, 0.1), { density: 2500, friction: 1, restitution: 0.05 });
      phys.addCollider(b, R.ColliderDesc.cylinder(0.11, 0.012).setTranslation(0, 0.125, 0), { density: 300, restitution: 0.05 });
      phys.addCollider(b, R.ColliderDesc.ball(0.11).setTranslation(0, 0.28, 0.02), { density: 25, restitution: 0.05 });
      return { obj: phys.track(g, b, 'fan', 'props', { restitution: 0.05, friction: 0.8, density: 60 }) };
    }
    case 'lamp': {
      const g = new THREE.Group();
      const colors = ['#ff3d7f', '#3dd5ff', '#9dff3d', '#ffb13d'];
      const c = colors[index % colors.length]!;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.08, 20), mat('#c0c0c8', 0.25, 1));
      base.position.y = 0.04;
      g.add(base);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 20), new THREE.MeshPhysicalMaterial({ color: c, transmission: 0.6, roughness: 0.1, emissive: c, emissiveIntensity: 0.9, thickness: 0.05 }));
      glass.position.y = 0.19;
      g.add(glass);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.06, 20), mat('#c0c0c8', 0.25, 1));
      cap.position.y = 0.33;
      g.add(cap);
      const light = new THREE.PointLight(c, 0.6, 2.2, 2);
      light.position.y = 0.22;
      g.add(light);
      scene.add(shadowed(g));
      const b = body({ x: at.x, y: at.y + 0.004, z: at.z }, yaw, true);
      phys.addCollider(b, R.ColliderDesc.cylinder(0.04, 0.07).setTranslation(0, 0.04, 0), { density: 3000, friction: 1, restitution: 0.05 });
      phys.addCollider(b, R.ColliderDesc.cylinder(0.14, 0.045).setTranslation(0, 0.22, 0), { density: 300, restitution: 0.05 });
      return { obj: phys.track(g, b, 'lamp', 'props', { restitution: 0.05, friction: 0.8, density: 400 }), light };
    }
    case 'plant': {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 24), mat('#c96b4a', 0.8));
      pot.position.y = 0.15;
      g.add(pot);
      const leafM = mat('#3f8f4a', 0.6, 0, { side: THREE.DoubleSide });
      for (let i = 0; i < 9; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8).scale(0.35, 1, 0.12), leafM);
        leaf.position.set(Math.cos(i * 0.7) * 0.07, 0.48 + (i % 3) * 0.08, Math.sin(i * 0.7) * 0.07);
        leaf.rotation.set(Math.sin(i) * 0.6, i * 0.7, Math.cos(i) * 0.6);
        g.add(leaf);
      }
      scene.add(shadowed(g));
      const b = body({ x: at.x, y: at.y + 0.004, z: at.z });
      phys.addCollider(b, R.ColliderDesc.cylinder(0.15, 0.15).setTranslation(0, 0.15, 0), { density: 1200, friction: 0.9, restitution: 0.05 });
      phys.addCollider(b, R.ColliderDesc.ball(0.2).setTranslation(0, 0.55, 0), { density: 20, restitution: 0.05 });
      return { obj: phys.track(g, b, 'plant', 'props', { restitution: 0.05, friction: 0.9, density: 900 }) };
    }
    case 'beanbag': {
      const colors = ['#e07a5f', '#3d405b'];
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 20).scale(1, 0.62, 1), mat('#fff', 0.95, 0, { map: fabric(colors[index % 2]!) }));
      const g = new THREE.Group();
      g.add(m);
      scene.add(shadowed(g));
      const b = body({ x: at.x, y: at.y + 0.3, z: at.z });
      phys.addCollider(b, R.ColliderDesc.ball(0.3), { density: 120, restitution: 0.3, friction: 0.95 });
      return { obj: phys.track(g, b, 'beanbag', 'props', { restitution: 0.3, friction: 0.95, density: 120 }) };
    }
    case 'box': {
      const m = rbox(0.4, 0.4, 0.4, 0.015, mat('#c49a6c', 0.85));
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.005, 0.08), mat('#d8c39a', 0.4));
      tape.position.y = 0.2;
      m.add(tape);
      scene.add(shadowed(m));
      const b = body({ x: at.x, y: at.y + 0.204, z: at.z });
      phys.addCollider(b, R.ColliderDesc.cuboid(0.2, 0.2, 0.2), { density: 60, friction: 0.9, restitution: 0.05 });
      return { obj: phys.track(m, b, 'box', 'props', { restitution: 0.05, friction: 0.9, density: 60 }) };
    }
    case 'piggy': {
      const g = new THREE.Group();
      const pink = mat('#f7a1c4', 0.35);
      const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16).scale(1.3, 1, 1), pink);
      bodyM.position.y = 0.09;
      g.add(bodyM);
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), pink);
      snout.rotation.z = Math.PI / 2;
      snout.position.set(0.12, 0.09, 0);
      g.add(snout);
      for (const [lx, lz] of [[-0.06, -0.04], [0.06, -0.04], [-0.06, 0.04], [0.06, 0.04]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), pink);
        leg.position.set(lx, 0.015, lz);
        g.add(leg);
      }
      scene.add(shadowed(g));
      const b = body({ x: at.x, y: at.y + 0.004, z: at.z }, yaw, true);
      // Flat-bottomed (legs) so it sits still instead of rolling off the shelf.
      phys.addCollider(b, R.ColliderDesc.cuboid(0.08, 0.015, 0.055).setTranslation(0, 0.015, 0), { density: 2500, friction: 1, restitution: 0.05 });
      phys.addCollider(b, R.ColliderDesc.ball(0.09).setTranslation(0, 0.1, 0), { density: 500, restitution: 0.1 });
      return { obj: phys.track(g, b, 'piggy', 'props', { restitution: 0.1, friction: 0.8, density: 700 }) };
    }
  }
  return {};
}

/** Physical objects that escape from mini-tycoons (ducks from a jam, etc.). */
export function spawnToy(kind: string, from: THREE.Vector3, dir: THREE.Vector3, scene: THREE.Scene, phys: Physics): PhysObj {
  const R = phys.R;
  const g = new THREE.Group();
  let collider;
  if (kind === 'duck') {
    const yellow = mat('#ffd21f', 0.35);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 14).scale(1.25, 0.9, 1), yellow);
    g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), yellow);
    h.position.set(0.05, 0.06, 0);
    g.add(h);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.035, 12), mat('#ff7a1a', 0.5));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.095, 0.055, 0);
    g.add(beak);
    collider = R.ColliderDesc.ball(0.07);
  } else if (kind === 'sock') {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 6, 12), mat('#fff', 0.95, 0, { map: fabric(['#e94b4b', '#4b8be9', '#3fc46a'][Math.floor(Math.random() * 3)]!) }));
    s.rotation.z = Math.PI / 2;
    g.add(s);
    collider = R.ColliderDesc.capsule(0.08, 0.035).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
  } else {
    const r = rbox(0.06, 0.03, 0.2, 0.01, mat('#1d1d1f', 0.5));
    g.add(r);
    collider = R.ColliderDesc.cuboid(0.03, 0.015, 0.1);
  }
  scene.add(shadowed(g));
  const body = phys.createBody({ pos: from, ccd: true, angularDamping: 0.3 });
  phys.addCollider(body, collider, { density: 200, restitution: kind === 'duck' ? 0.7 : 0.2 });
  body.setLinvel({ x: dir.x * 3 + (Math.random() - 0.5), y: 2 + Math.random(), z: dir.z * 3 + (Math.random() - 0.5) }, true);
  return phys.track(g, body, kind, 'props', { restitution: kind === 'duck' ? 0.7 : 0.2, friction: 0.6, density: 200 });
}
