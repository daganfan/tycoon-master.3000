import * as THREE from 'three';
import { GARAGE } from '@/content/garage';
import type { Physics } from '../physics';
import { DOOR, ROOM, mat, rbox, shadowed } from '../room';
import { cinderBlock, concrete, hazard, oilStain, pegboard, rollUpDoor, signTex } from './textures';
import { GARAGE_LAYER, mergeStatic, toGarageLayer } from './perf';

export interface GarageShell {
  root: THREE.Group;
  /** Emissive tube materials (dimmed until the lights come on). */
  tubes: THREE.MeshStandardMaterial[];
  lights: THREE.Light[];
  /** Where the factory plot is painted on the floor. */
  plot: { x0: number; x1: number; z0: number; z1: number };
  /** Sign above the door on the garage side. */
  doorSign: THREE.Mesh;
}

const { x0, x1, z0, z1, h } = GARAGE;
const W = x1 - x0;
const D = z1 - z0;
const CX = (x0 + x1) / 2;
const CZ = (z0 + z1) / 2;

/**
 * The garage shell: concrete floor, painted cinder-block walls, a roll-up
 * door, fluorescent tubes, and the usual garage clutter. All static.
 */
export function buildGarageShell(scene: THREE.Scene, phys: Physics): GarageShell {
  const root = new THREE.Group();
  root.name = 'garage';
  scene.add(root);
  const add = <T extends THREE.Object3D>(o: T, shadow = true): T => {
    root.add(shadow ? shadowed(o) : o);
    return o;
  };

  // Floor
  const con = concrete([W / 4, D / 4]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#ffffff', 1, 0, { map: con.map, roughnessMap: con.rough }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  root.add(floor);
  phys.staticBox({ x: W / 2 + 0.6, y: 0.1, z: D / 2 + 0.6 }, { x: CX, y: -0.1, z: CZ });

  // Oil stains where the car used to live.
  const stainMat = mat('#ffffff', 0.35, 0, { map: oilStain(3), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [x, z, s, r] of [[-1.9, 9.6, 1.4, 0.4], [3.2, 10.0, 0.9, 1.9], [-2.6, 3.6, 0.6, 0.2]] as const) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(s, s), stainMat);
    st.rotation.set(-Math.PI / 2, 0, r);
    st.position.set(x, 0.003, z);
    st.receiveShadow = true;
    root.add(st);
  }

  // Walls: painted cinder block (lower band darker).
  const block = cinderBlock([W / 1.6, h / 0.8]);
  const wallMat = mat('#ffffff', 0.9, 0, { map: block.map, bumpMap: block.bump, bumpScale: 1.2 });
  const blockS = cinderBlock([D / 1.6, h / 0.8]);
  const wallMatS = mat('#ffffff', 0.9, 0, { map: blockS.map, bumpMap: blockS.bump, bumpScale: 1.2 });
  const wallPlane = (w: number, wh: number, m: THREE.Material, pos: THREE.Vector3, ry: number, uv?: [number, number, number, number]) => {
    const geo = new THREE.PlaneGeometry(w, wh);
    if (uv) {
      // Crop the shared texture so blocks line up across wall pieces.
      const a = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[1] - uv[0]), uv[2] + a.getY(i) * (uv[3] - uv[2]));
    }
    const p = new THREE.Mesh(geo, m);
    p.position.copy(pos);
    p.rotation.y = ry;
    p.receiveShadow = true;
    p.castShadow = true;
    root.add(p);
    return p;
  };
  // North wall (shared with the bedroom) with the doorway. Faces +z.
  const dl = DOOR.x - DOOR.w / 2;
  const dr = DOOR.x + DOOR.w / 2;
  const u = (x: number) => (x - x0) / W;
  // Named so they stay separate: they live on the default layer to block bedroom light from leaking in.
  const north = [
    wallPlane(dl - x0, h, wallMat, new THREE.Vector3((x0 + dl) / 2, h / 2, z0), 0, [u(x0), u(dl), 0, 1]),
    wallPlane(x1 - dr, h, wallMat, new THREE.Vector3((dr + x1) / 2, h / 2, z0), 0, [u(dr), u(x1), 0, 1]),
    wallPlane(DOOR.w, h - DOOR.h, wallMat, new THREE.Vector3(DOOR.x, (DOOR.h + h) / 2, z0), 0, [u(dl), u(dr), DOOR.h / h, 1]),
  ];
  north.forEach((m) => (m.name = 'north-wall'));
  // South (roll-up door wall), west, east.
  wallPlane(W, h, wallMat, new THREE.Vector3(CX, h / 2, z1), Math.PI);
  wallPlane(D, h, wallMatS, new THREE.Vector3(x0, h / 2, CZ), Math.PI / 2);
  wallPlane(D, h, wallMatS, new THREE.Vector3(x1, h / 2, CZ), -Math.PI / 2);
  // Colliders (north wall pieces sit inside the bedroom wall's thickness).
  const nz = (ROOM.z1 + z0) / 2;
  const nt = (z0 - ROOM.z1) / 2;
  phys.staticBox({ x: (dl - x0) / 2, y: h / 2, z: nt }, { x: (x0 + dl) / 2, y: h / 2, z: nz });
  phys.staticBox({ x: (x1 - dr) / 2, y: h / 2, z: nt }, { x: (dr + x1) / 2, y: h / 2, z: nz });
  phys.staticBox({ x: DOOR.w / 2, y: (h - DOOR.h) / 2, z: nt }, { x: DOOR.x, y: (h + DOOR.h) / 2, z: nz });
  phys.staticBox({ x: W / 2 + 0.2, y: h / 2, z: 0.1 }, { x: CX, y: h / 2, z: z1 + 0.1 });
  phys.staticBox({ x: 0.1, y: h / 2, z: D / 2 + 0.2 }, { x: x0 - 0.1, y: h / 2, z: CZ });
  phys.staticBox({ x: 0.1, y: h / 2, z: D / 2 + 0.2 }, { x: x1 + 0.1, y: h / 2, z: CZ });
  phys.staticBox({ x: W / 2 + 0.2, y: 0.1, z: D / 2 + 0.2 }, { x: CX, y: h + 0.1, z: CZ });

  // Door jamb lining the hole through the wall, plus trim on the garage side.
  const jamb = mat('#e8e2d4', 0.55);
  for (const [w, hh, d, x, y] of [[0.04, DOOR.h, z0 - ROOM.z1, dl - 0.02, DOOR.h / 2], [0.04, DOOR.h, z0 - ROOM.z1, dr + 0.02, DOOR.h / 2], [DOOR.w + 0.08, 0.04, z0 - ROOM.z1, DOOR.x, DOOR.h + 0.02]] as const) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), jamb);
    j.position.set(x, y, (ROOM.z1 + z0) / 2);
    add(j);
  }
  for (const [w, hh, x, y] of [[0.07, DOOR.h + 0.07, dl - 0.035, (DOOR.h + 0.07) / 2], [0.07, DOOR.h + 0.07, dr + 0.035, (DOOR.h + 0.07) / 2], [DOOR.w + 0.14, 0.07, DOOR.x, DOOR.h + 0.035]] as const) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.02), jamb);
    t.position.set(x, y, z0 + 0.01);
    add(t);
  }
  const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: signTex([{ text: '🏠 BEDROOM', size: 64, color: '#fff' }], 'rgba(30,30,30,0.9)', '#868e96'), transparent: true }));
  doorSign.position.set(DOOR.x, DOOR.h + 0.32, z0 + 0.02);
  root.add(doorSign);

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#cfccc4', 0.95));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(CX, h, CZ);
  root.add(ceil);
  // Exposed joists.
  const joistM = mat('#9c7a52', 0.8);
  for (let x = x0 + 0.6; x < x1; x += 1.2) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, D), joistM);
    j.position.set(x, h - 0.08, CZ);
    root.add(j);
  }

  // Roll-up door on the south wall, with a sliver of daylight underneath.
  const rd = rollUpDoor();
  const rollW = 4.8;
  const rollH = 2.4;
  const roll = new THREE.Mesh(new THREE.PlaneGeometry(rollW, rollH), mat('#ffffff', 0.45, 0.6, { map: rd.map, bumpMap: rd.bump, bumpScale: 2 }));
  roll.position.set(1.6, rollH / 2 + 0.03, z1 - 0.02);
  roll.rotation.y = Math.PI;
  add(roll);
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(rollW, 0.03), new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false }));
  gap.position.set(1.6, 0.015, z1 - 0.015);
  gap.rotation.y = Math.PI;
  root.add(gap);
  const railM = mat('#6c737a', 0.4, 0.8);
  for (const x of [1.6 - rollW / 2 - 0.05, 1.6 + rollW / 2 + 0.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, rollH + 0.1, 0.08), railM);
    rail.position.set(x, (rollH + 0.1) / 2, z1 - 0.05);
    add(rail);
  }
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, rollW + 0.3, 20), railM);
  housing.rotation.z = Math.PI / 2;
  housing.position.set(1.6, rollH + 0.3, z1 - 0.25);
  add(housing);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.05), mat('#222', 0.4, 0.6));
  handle.position.set(1.6, 0.35, z1 - 0.05);
  root.add(handle);

  // Windows on the east wall (the afternoon sun comes in here).
  const frameM = mat('#f1f3f5', 0.4);
  for (const z of [4.3, 9.2]) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshBasicMaterial({ color: '#cfe8ff', toneMapped: false }));
    sky.position.set(x1 - 0.01, 2.05, z);
    sky.rotation.y = -Math.PI / 2;
    root.add(sky);
    for (const [w, hh, dz, dy] of [[1.3, 0.05, 0, 0.37], [1.3, 0.05, 0, -0.37], [0.05, 0.78, 0.62, 0], [0.05, 0.78, -0.62, 0], [0.03, 0.7, 0, 0]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, hh, w), frameM);
      b.position.set(x1 - 0.03, 2.05 + dy, z + dz);
      add(b);
    }
  }

  // Fluorescent tube fixtures + lights. Few lights, one shadow caster.
  const tubes: THREE.MeshStandardMaterial[] = [];
  const housingM = mat('#e9ecef', 0.5, 0.3);
  const lights: THREE.Light[] = [];
  for (const [x, z] of [[-0.6, 4.6], [3.8, 4.6], [-0.6, 8.6], [3.8, 8.6]] as const) {
    const fx = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.22), housingM);
    fx.add(box);
    const tm = mat('#ffffff', 0.2, 0, { emissive: '#eef6ff', emissiveIntensity: 2.2 });
    tubes.push(tm);
    for (const dz of [-0.05, 0.05]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.22, 10), tm);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0, -0.04, dz);
      fx.add(tube);
    }
    for (const dx of [-0.6, 0.6]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.35, 4), railM);
      chain.position.set(dx, 0.18, 0);
      fx.add(chain);
    }
    fx.position.set(x, h - 0.38, z);
    root.add(fx);
  }
  const key = new THREE.SpotLight('#f2f7ff', 60, 11, 1.15, 0.6, 1.6);
  key.position.set(1.6, h - 0.1, 6.7);
  key.target.position.set(1.6, 0, 6.9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 6;
  root.add(key, key.target);
  lights.push(key);
  for (const [x, z] of [[-1.2, 6.2], [4.6, 5.0]] as const) {
    const p = new THREE.PointLight('#eef4ff', 5, 5.2, 1.6);
    p.position.set(x, h - 0.45, z);
    root.add(p);
    lights.push(p);
  }

  // Workbench + pegboard (west wall).
  const wood = mat('#8b6a45', 0.7);
  const steel = mat('#5c636a', 0.45, 0.7);
  const bench = new THREE.Group();
  const top = rbox(0.75, 0.06, 1.9, 0.01, wood);
  top.position.y = 0.9;
  bench.add(top);
  const shelf = rbox(0.68, 0.03, 1.8, 0.01, wood);
  shelf.position.y = 0.25;
  bench.add(shelf);
  for (const [dx, dz] of [[-0.32, -0.88], [0.32, -0.88], [-0.32, 0.88], [0.32, 0.88]] as const) {
    const leg = rbox(0.06, 0.9, 0.06, 0.01, wood);
    leg.position.set(dx, 0.45, dz);
    bench.add(leg);
  }
  const vise = new THREE.Group();
  const vb = rbox(0.16, 0.1, 0.22, 0.01, mat('#2f6db5', 0.4, 0.5));
  vb.position.y = 0.05;
  vise.add(vb);
  const vj = rbox(0.18, 0.08, 0.04, 0.005, steel);
  vj.position.set(0, 0.12, 0.08);
  vise.add(vj);
  vise.position.set(0.25, 0.93, -0.7);
  bench.add(vise);
  // Clutter on the bench: paint cans, a toolbox, a coffee mug.
  const canColors = ['#c92a2a', '#2b8a3e', '#e8590c'];
  canColors.forEach((c, i) => {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 18), mat(c, 0.5, 0.3));
    can.position.set(-0.15, 1.01, 0.2 + i * 0.19);
    bench.add(can);
  });
  const tb = rbox(0.22, 0.16, 0.45, 0.02, mat('#d9480f', 0.45, 0.3));
  tb.position.set(0.05, 1.01, -0.2);
  bench.add(tb);
  bench.position.set(x0 + 0.4, 0, 4.25);
  add(bench);
  phys.staticBox({ x: 0.38, y: 0.47, z: 0.96 }, { x: x0 + 0.4, y: 0.47, z: 4.25 });
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.9), mat('#ffffff', 0.85, 0, { map: pegboard() }));
  peg.position.set(x0 + 0.015, 1.65, 4.25);
  peg.rotation.y = Math.PI / 2;
  add(peg);
  const tool = (o: THREE.Object3D, z: number, y: number, rz = 0) => {
    o.position.set(x0 + 0.04, y, z);
    o.rotation.set(0, Math.PI / 2, rz);
    add(o);
  };
  const hammer = new THREE.Group();
  const hh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), wood);
  hammer.add(hh);
  const hd = rbox(0.12, 0.04, 0.04, 0.005, steel);
  hd.position.y = 0.15;
  hammer.add(hd);
  tool(hammer, 3.55, 1.6);
  const wrench = new THREE.Group();
  const ws = rbox(0.03, 0.26, 0.012, 0.005, steel);
  wrench.add(ws);
  const wh = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12, Math.PI * 1.5), steel);
  wh.position.y = 0.14;
  wrench.add(wh);
  tool(wrench, 3.85, 1.62);
  tool(wrench.clone(), 3.98, 1.6, 0.2);
  const saw = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.004), steel);
  saw.add(blade);
  const sh = rbox(0.12, 0.1, 0.03, 0.01, mat('#a61e4d', 0.5));
  sh.position.x = 0.27;
  saw.add(sh);
  tool(saw, 4.45, 1.85);
  for (let i = 0; i < 4; i++) {
    const sd = new THREE.Group();
    const handleM = mat(['#f59f00', '#1c7ed6', '#e03131', '#2f9e44'][i]!, 0.5);
    const hdl = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8), handleM);
    sd.add(hdl);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 6), steel);
    shaft.position.y = -0.09;
    sd.add(shaft);
    tool(sd, 4.85 + i * 0.07, 1.55);
  }
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 20), mat('#f08c00', 0.6));
  tool(coil, 5.0, 1.88);

  // Metal shelving (east wall, back corner).
  const shelving = new THREE.Group();
  for (const [dx, dz] of [[-0.22, -0.8], [0.22, -0.8], [-0.22, 0.8], [0.22, 0.8]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.0, 0.035), steel);
    post.position.set(dx, 1.0, dz);
    shelving.add(post);
  }
  const boxM = [mat('#c8a26b', 0.85), mat('#b89060', 0.85), mat('#d1b07c', 0.85)];
  for (let i = 0; i < 4; i++) {
    const y = 0.15 + i * 0.55;
    const sh2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 1.65), steel);
    sh2.position.y = y;
    shelving.add(sh2);
    for (let k = 0; k < 3; k++) {
      if ((i + k) % 4 === 3) continue;
      const bw = 0.3 + ((i * 7 + k * 3) % 4) * 0.03;
      const bh = 0.2 + ((i + k) % 3) * 0.08;
      const bx = rbox(0.4, bh, bw, 0.01, boxM[(i + k) % 3]!);
      bx.position.set(0, y + bh / 2 + 0.013, -0.55 + k * 0.55);
      shelving.add(bx);
    }
  }
  shelving.position.set(x1 - 0.3, 0, 9.55);
  add(shelving);
  phys.staticBox({ x: 0.26, y: 1.0, z: 0.85 }, { x: x1 - 0.3, y: 1.0, z: 9.55 });

  // Water heater in the corner.
  const heater = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.5, 24), mat('#e9ecef', 0.35, 0.3));
  heater.position.set(x0 + 0.38, 0.75, z1 - 0.4);
  add(heater);
  phys.staticBox({ x: 0.28, y: 0.75, z: 0.28 }, { x: x0 + 0.38, y: 0.75, z: z1 - 0.4 });

  // Bicycle leaning on the back wall.
  const bike = new THREE.Group();
  const tire = mat('#1b1b1b', 0.9);
  const frame = mat('#1971c2', 0.35, 0.5);
  for (const dx of [-0.52, 0.52]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 8, 28), tire);
    wheel.position.set(dx, 0.35, 0);
    bike.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), steel);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(dx, 0.35, 0);
    bike.add(hub);
  }
  const tubeSeg = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 8), frame);
    t.position.set((ax + bx) / 2, (ay + by) / 2, 0);
    t.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
    bike.add(t);
  };
  tubeSeg(-0.52, 0.35, -0.05, 0.35);
  tubeSeg(-0.05, 0.35, -0.15, 0.8);
  tubeSeg(-0.15, 0.8, 0.38, 0.78);
  tubeSeg(-0.05, 0.35, 0.38, 0.78);
  tubeSeg(0.38, 0.78, 0.52, 0.35);
  tubeSeg(-0.52, 0.35, -0.15, 0.8);
  const seat = rbox(0.2, 0.05, 0.09, 0.02, mat('#222', 0.7));
  seat.position.set(-0.17, 0.86, 0);
  bike.add(seat);
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), steel);
  bars.rotation.x = Math.PI / 2;
  bars.position.set(0.4, 0.95, 0);
  bike.add(bars);
  tubeSeg(0.38, 0.78, 0.4, 0.95);
  bike.position.set(-2.0, 0, z1 - 0.2);
  bike.rotation.set(0, 0, 0);
  bike.rotateX(-0.12);
  add(bike);
  phys.staticBox({ x: 0.9, y: 0.5, z: 0.12 }, { x: -2.0, y: 0.5, z: z1 - 0.2 });

  // Trash can + broom.
  const trash = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.75, 20, 1, true), mat('#495057', 0.5, 0.6, { side: THREE.DoubleSide }));
  trash.position.set(x1 - 0.35, 0.375, 3.2);
  add(trash);
  phys.staticBox({ x: 0.24, y: 0.38, z: 0.24 }, { x: x1 - 0.35, y: 0.38, z: 3.2 });
  const broom = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 8), wood);
  stick.position.y = 0.75;
  broom.add(stick);
  const bristle = rbox(0.3, 0.12, 0.06, 0.01, mat('#c9a227', 0.9));
  bristle.position.y = 0.08;
  broom.add(bristle);
  broom.position.set(x1 - 0.12, 0, 5.4);
  broom.rotation.z = 0.12;
  add(broom);

  // The factory plot: painted floor with hazard-tape edges.
  const plot = { x0: -2.05, x1: 5.75, z0: 4.75, z1: 9.0 };
  const plotFloor = new THREE.Mesh(new THREE.PlaneGeometry(plot.x1 - plot.x0, plot.z1 - plot.z0), mat('#5f6b73', 0.75, 0.05, { transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  plotFloor.rotation.x = -Math.PI / 2;
  plotFloor.position.set((plot.x0 + plot.x1) / 2, 0.002, (plot.z0 + plot.z1) / 2);
  plotFloor.receiveShadow = true;
  root.add(plotFloor);
  const tapeM = mat('#ffffff', 0.6, 0, { map: hazard(), polygonOffset: true, polygonOffsetFactor: -3 });
  const tape = (len: number, x: number, z: number, ry: number) => {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), tapeM);
    t.rotation.set(-Math.PI / 2, 0, ry);
    t.position.set(x, 0.004, z);
    t.receiveShadow = true;
    root.add(t);
  };
  tape(plot.x1 - plot.x0, (plot.x0 + plot.x1) / 2, plot.z0, 0);
  tape(plot.x1 - plot.x0, (plot.x0 + plot.x1) / 2, plot.z1, 0);
  tape(plot.z1 - plot.z0, plot.x0, (plot.z0 + plot.z1) / 2, Math.PI / 2);
  tape(plot.z1 - plot.z0, plot.x1, (plot.z0 + plot.z1) / 2, Math.PI / 2);
  const plotSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: signTex([{ text: 'SCRAP-O-MATIC WORKS', size: 54, color: '#ffd43b' }, { text: 'factory plot · step on the glowing pads', size: 30, color: '#e9ecef', bold: false }], 'rgba(20,22,28,0.92)', '#ffd43b', 768), transparent: true }),
  );
  plotSign.position.set(1.6, 2.35, z1 - 0.03);
  plotSign.rotation.y = Math.PI;
  root.add(plotSign);

  // Small clutter doesn't need to cast shadows.
  for (const o of [peg, hammer, wrench, saw, coil, broom, handle]) o.traverse((c) => (c.castShadow = false));
  mergeStatic(root);
  toGarageLayer(root);
  for (const m of north) m.layers.set(0);
  key.shadow.camera.layers.enable(GARAGE_LAYER);
  return { root, tubes, lights, plot, doorSign };
}
