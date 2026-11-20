import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Physics, PhysObj } from './physics';
import { fabric, labelTex, posterTex, rug, wallPaint, woodFloor } from './textures';

export const ROOM = { hx: 3, hz: 2.5, h: 2.7 };

export const mat = (color: string, roughness = 0.6, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

export const rbox = (w: number, h: number, d: number, r = 0.01, m?: THREE.Material) =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), m);

export interface Screen {
  mesh: THREE.Mesh;
  obj: PhysObj;
  /** Local transform of the screen plane inside the tracked body. */
  w: number;
  h: number;
}

export interface RoomRefs {
  desk: PhysObj;
  pc: PhysObj;
  monitor: PhysObj;
  screen: Screen;
  chair: PhysObj;
  garageSign: THREE.Mesh;
  deskTopY: number;
}

/** Build a monitor: bezel + stand + glowing screen plane. Returns the group and the screen mesh. */
export function buildMonitor(w: number, h: number, crusty: boolean): { group: THREE.Group; screen: THREE.Mesh; half: THREE.Vector3 } {
  const g = new THREE.Group();
  const bezel = crusty ? mat('#d8d2bd', 0.65) : mat('#1b1c1f', 0.4, 0.2);
  const depth = crusty ? 0.32 : 0.05;
  const body = rbox(w + 0.06, h + 0.06, depth, 0.02, bezel);
  body.position.set(0, 0.16 + h / 2, crusty ? -depth / 2 + 0.03 : 0);
  g.add(body);
  const neck = rbox(0.06, 0.12, 0.05, 0.01, bezel);
  neck.position.set(0, 0.07, crusty ? -0.06 : -0.04);
  g.add(neck);
  const foot = rbox(crusty ? 0.3 : 0.24, 0.02, 0.2, 0.01, bezel);
  foot.position.set(0, 0.01, -0.04);
  g.add(foot);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  screen.position.set(0, 0.16 + h / 2, (crusty ? 0.03 : depth / 2) + 0.002);
  g.add(screen);
  shadowed(g);
  screen.castShadow = false;
  const half = new THREE.Vector3((w + 0.06) / 2, (0.16 + h + 0.03) / 2, Math.max(0.1, depth / 2));
  return { group: g, screen, half };
}

export function buildRoom(scene: THREE.Scene, phys: Physics): RoomRefs {
  const R = phys.R;
  const { hx, hz, h } = ROOM;

  // Floor
  const wood = woodFloor();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), mat('#ffffff', 1, 0, { map: wood.map, roughnessMap: wood.rough }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  phys.staticBox({ x: hx + 1, y: 0.1, z: hz + 1 }, { x: 0, y: -0.1, z: 0 });

  // Walls + ceiling
  const wallMat = mat('#ffffff', 0.92, 0, { map: wallPaint(205) });
  const wall = (w: number, pos: THREE.Vector3, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.copy(pos);
    m.rotation.y = ry;
    m.receiveShadow = true;
    scene.add(m);
  };
  wall(hx * 2, new THREE.Vector3(0, h / 2, -hz), 0);
  wall(hx * 2, new THREE.Vector3(0, h / 2, hz), Math.PI);
  wall(hz * 2, new THREE.Vector3(-hx, h / 2, 0), Math.PI / 2);
  wall(hz * 2, new THREE.Vector3(hx, h / 2, 0), -Math.PI / 2);
  phys.staticBox({ x: hx, y: h, z: 0.1 }, { x: 0, y: h / 2, z: -hz - 0.1 });
  phys.staticBox({ x: hx, y: h, z: 0.1 }, { x: 0, y: h / 2, z: hz + 0.1 });
  phys.staticBox({ x: 0.1, y: h, z: hz }, { x: -hx - 0.1, y: h / 2, z: 0 });
  phys.staticBox({ x: 0.1, y: h, z: hz }, { x: hx + 0.1, y: h / 2, z: 0 });
  phys.staticBox({ x: hx, y: 0.1, z: hz }, { x: 0, y: h + 0.1, z: 0 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), mat('#f2efe8', 0.95));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  scene.add(ceil);
  // Skirting boards
  const skirt = mat('#efeae0', 0.5);
  for (const [w, x, z, ry] of [[hx * 2, 0, -hz + 0.01, 0], [hx * 2, 0, hz - 0.01, 0], [hz * 2, -hx + 0.01, 0, Math.PI / 2], [hz * 2, hx - 0.01, 0, Math.PI / 2]] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.02), skirt);
    s.position.set(x, 0.05, z);
    s.rotation.y = ry;
    scene.add(s);
  }

  // Window (right wall) with glowing sky
  const win = new THREE.Group();
  const frame = mat('#f7f7f2', 0.4);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: '#bfe3ff', toneMapped: false }));
  win.add(sky);
  for (const [w, hh, x, y] of [[1.5, 0.06, 0, 0.58], [1.5, 0.06, 0, -0.58], [0.06, 1.2, 0.72, 0], [0.06, 1.2, -0.72, 0], [0.04, 1.1, 0, 0], [1.4, 0.04, 0, 0]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.06), frame);
    b.position.set(x, y, 0.02);
    win.add(b);
  }
  const sill = rbox(1.6, 0.04, 0.2, 0.01, frame);
  sill.position.set(0, -0.62, 0.08);
  win.add(sill);
  win.position.set(hx - 0.01, 1.55, 0.6);
  win.rotation.y = -Math.PI / 2;
  scene.add(shadowed(win));
  sky.castShadow = false;

  // Rug
  const rugMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), mat('#ffffff', 1, 0, { map: rug() }));
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.set(0.3, 0.004, 0.4);
  rugMesh.receiveShadow = true;
  scene.add(rugMesh);

  // Bed (static)
  const bed = new THREE.Group();
  const frameM = mat('#5b3a22', 0.55);
  const base = rbox(1.0, 0.3, 2.0, 0.03, frameM);
  base.position.y = 0.15;
  bed.add(base);
  const mattress = rbox(0.95, 0.18, 1.92, 0.06, mat('#f3f1ea', 0.9));
  mattress.position.y = 0.39;
  bed.add(mattress);
  const blanket = rbox(0.98, 0.06, 1.3, 0.03, mat('#ffffff', 0.95, 0, { map: fabric('#3c5a8a') }));
  blanket.position.set(0, 0.49, 0.32);
  bed.add(blanket);
  const pillow = rbox(0.6, 0.12, 0.35, 0.06, mat('#fbfbf7', 0.95));
  pillow.position.set(0, 0.54, -0.72);
  pillow.rotation.x = -0.15;
  bed.add(pillow);
  const head = rbox(1.02, 0.7, 0.06, 0.02, frameM);
  head.position.set(0, 0.55, -1.0);
  bed.add(head);
  bed.position.set(-hx + 0.55, 0, 0.9);
  scene.add(shadowed(bed));
  phys.staticBox({ x: 0.5, y: 0.25, z: 1.0 }, { x: -hx + 0.55, y: 0.25, z: 0.9 });

  // Desk (dynamic, heavy, can be shoved)
  const deskTopY = 0.76;
  const deskMat = mat('#8a6a4a', 0.5);
  const desk = new THREE.Group();
  const top = rbox(1.6, 0.045, 0.72, 0.01, deskMat);
  top.position.y = deskTopY;
  top.name = 'desk-top';
  desk.add(top);
  const legM = mat('#2a2a2a', 0.4, 0.6);
  for (const [x, z] of [[-0.75, -0.31], [0.75, -0.31], [-0.75, 0.31], [0.75, 0.31]] as const) {
    const leg = rbox(0.045, deskTopY, 0.045, 0.01, legM);
    leg.position.set(x, deskTopY / 2, z);
    desk.add(leg);
  }
  scene.add(shadowed(desk));
  const deskBody = phys.createBody({ pos: { x: 0, y: 0, z: -hz + 0.42 }, angularDamping: 2, linearDamping: 1.5 });
  phys.addCollider(deskBody, R.ColliderDesc.cuboid(0.8, 0.0225, 0.36).setTranslation(0, deskTopY, 0), { density: 220, friction: 0.9 });
  for (const [x, z] of [[-0.75, -0.31], [0.75, -0.31], [-0.75, 0.31], [0.75, 0.31]] as const)
    phys.addCollider(deskBody, R.ColliderDesc.cuboid(0.0225, deskTopY / 2, 0.0225).setTranslation(x, deskTopY / 2, z), { density: 800, friction: 1 });
  const deskObj = phys.track(desk, deskBody, 'desk', 'desk', { restitution: 0.05, friction: 0.9, density: 220 });

  // Crusty main monitor (dynamic)
  const mon = buildMonitor(0.52, 0.36, true);
  scene.add(mon.group);
  const monBody = phys.createBody({ pos: { x: -0.1, y: deskTopY + 0.03, z: -hz + 0.42 }, angularDamping: 0.6 });
  phys.addCollider(monBody, R.ColliderDesc.cuboid(0.16, 0.01, 0.11).setTranslation(0, 0.01, -0.04), { density: 2000, friction: 0.9 });
  phys.addCollider(monBody, R.ColliderDesc.cuboid(mon.half.x, 0.21, 0.16).setTranslation(0, 0.16 + 0.18, -0.13), { density: 150, friction: 0.7 });
  const monitor = phys.track(mon.group, monBody, 'monitor', 'pc', { restitution: 0.1, friction: 0.8, density: 150 });
  // Sticky note on the bezel
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), mat('#ffffff', 0.9, 0, { map: labelTex('Rent due.\n-Mom', '#fff59d', '#333', 256, 256, 44) }));
  note.position.set(0.3, 0.5, 0.035);
  note.rotation.z = -0.12;
  mon.group.add(note);

  // PC tower on the floor (coins come out of here)
  const towerMat = mat('#cfc8b2', 0.6);
  const tower = new THREE.Group();
  const case_ = rbox(0.2, 0.42, 0.44, 0.015, towerMat);
  case_.position.y = 0.21;
  tower.add(case_);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.01), mat('#111', 0.3));
  slot.position.set(0, 0.3, 0.222);
  tower.add(slot);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: '#39ff6a', toneMapped: false }));
  led.position.set(0.06, 0.37, 0.222);
  tower.add(led);
  scene.add(shadowed(tower));
  const towerBody = phys.createBody({ pos: { x: 0.95, y: 0, z: -hz + 0.35 }, angularDamping: 0.5 });
  phys.addCollider(towerBody, R.ColliderDesc.cuboid(0.1, 0.21, 0.22).setTranslation(0, 0.21, 0), { density: 120 });
  const pc = phys.track(tower, towerBody, 'pc', 'pc', { restitution: 0.1, friction: 0.8, density: 120 });

  // Office chair (dynamic)
  const chair = new THREE.Group();
  const seatM = mat('#ffffff', 0.85, 0, { map: fabric('#2b2b33') });
  const seat = rbox(0.48, 0.08, 0.46, 0.03, seatM);
  seat.position.y = 0.48;
  chair.add(seat);
  const back = rbox(0.46, 0.55, 0.07, 0.03, seatM);
  back.position.set(0, 0.8, 0.22);
  chair.add(back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4), legM);
  pole.position.y = 0.24;
  chair.add(pole);
  const star = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 5), legM);
  star.position.y = 0.04;
  chair.add(star);
  scene.add(shadowed(chair));
  const chairBody = phys.createBody({ pos: { x: -0.1, y: 0, z: -hz + 1.15 }, angularDamping: 0.8 });
  phys.addCollider(chairBody, R.ColliderDesc.cylinder(0.02, 0.3).setTranslation(0, 0.04, 0), { density: 600, friction: 0.5 });
  phys.addCollider(chairBody, R.ColliderDesc.cuboid(0.24, 0.04, 0.23).setTranslation(0, 0.48, 0), { density: 200 });
  phys.addCollider(chairBody, R.ColliderDesc.cuboid(0.23, 0.27, 0.035).setTranslation(0, 0.8, 0.22), { density: 150 });
  phys.addCollider(chairBody, R.ColliderDesc.cylinder(0.2, 0.025).setTranslation(0, 0.24, 0), { density: 300 });
  const chairObj = phys.track(chair, chairBody, 'chair', 'props', { restitution: 0.1, friction: 0.5, density: 200 });

  // Door + garage teaser sign (front wall)
  const door = rbox(0.9, 2.05, 0.05, 0.01, mat('#e8e2d4', 0.5));
  door.position.set(1.6, 1.025, hz - 0.03);
  scene.add(shadowed(door));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mat('#c9a24a', 0.25, 1));
  knob.position.set(1.95, 1.0, hz - 0.07);
  scene.add(knob);
  const garageSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), mat('#ffffff', 0.8, 0, { map: labelTex('GARAGE →\n🔒 Key needed', '#ffeb3b', '#222', 512, 320, 54) }));
  garageSign.position.set(1.6, 1.55, hz - 0.06);
  garageSign.rotation.y = Math.PI;
  scene.add(garageSign);

  // Poster spot + shelf with clutter (static)
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), mat('#ffffff', 0.7, 0, { map: posterTex('GRIND', '#1d3557', '#ffd166') }));
  poster.position.set(-1.2, 1.7, -hz + 0.005);
  scene.add(poster);
  const shelf = rbox(0.9, 0.03, 0.22, 0.005, mat('#ffffff', 0.5));
  shelf.position.set(1.2, 1.5, -hz + 0.11);
  scene.add(shadowed(shelf));
  phys.staticBox({ x: 0.45, y: 0.015, z: 0.11 }, { x: 1.2, y: 1.5, z: -hz + 0.11 });
  const books = ['#a23b3b', '#3b6aa2', '#e0b040', '#4b8b4b', '#7a4ba2'];
  books.forEach((c, i) => {
    const b = rbox(0.04, 0.22 + (i % 2) * 0.03, 0.16, 0.004, mat(c, 0.7));
    b.position.set(0.85 + i * 0.05, 1.63 + (i % 2) * 0.015, -hz + 0.11);
    scene.add(shadowed(b));
  });

  return {
    desk: deskObj,
    pc,
    monitor,
    chair: chairObj,
    screen: { mesh: mon.screen, obj: monitor, w: 0.52, h: 0.36 },
    garageSign,
    deskTopY,
  };
}
