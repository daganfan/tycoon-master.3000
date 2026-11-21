import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics, PhysObj, Top } from './physics';
import { mat, merge, placed, rbox, rgeo, shadowed } from './geo';
import { fabricSet, labelTex, rand, woodGrain } from './textures';

/**
 * Procedural bedroom furniture with compound colliders that follow the
 * visuals (so things rest on what they look like they rest on), heavy low
 * bases (hard to tip), and flat "tops" the placement solver can put props on.
 */

/** A drawer that slides out along the furniture's local +z when used. */
export interface Drawer {
  mesh: THREE.Object3D;
  /** Closed local z. */
  z0: number;
  travel: number;
  open: boolean;
  t: number;
  label: string;
}

export interface Furniture {
  obj: PhysObj;
  drawers: Drawer[];
}

type Col = { shape: 'box'; half: [number, number, number]; at: [number, number, number]; density: number; friction?: number } | { shape: 'cyl'; hh: number; r: number; at: [number, number, number]; density: number; friction?: number };

interface FurnOpts {
  kind: string;
  pos: [number, number, number];
  rotY: number;
  cols: Col[];
  tops?: Top[];
  heavy?: boolean;
  linDamp?: number;
  angDamp?: number;
  restitution?: number;
}

/** Create the body + colliders for a furniture group and track it. */
export function furnish(scene: THREE.Scene, phys: Physics, group: THREE.Object3D, o: FurnOpts): PhysObj {
  scene.add(shadowed(group));
  const R = phys.R;
  const body: RAPIER.RigidBody = phys.createBody({ pos: { x: o.pos[0], y: o.pos[1], z: o.pos[2] }, rot: new THREE.Euler(0, o.rotY, 0), linearDamping: o.linDamp ?? 1.5, angularDamping: o.angDamp ?? 2 });
  const restitution = o.restitution ?? 0.04;
  for (const c of o.cols) {
    const desc = c.shape === 'box' ? R.ColliderDesc.cuboid(...c.half) : R.ColliderDesc.cylinder(c.hh, c.r);
    desc.setTranslation(...c.at);
    phys.addCollider(body, desc, { density: c.density, friction: c.friction ?? 0.9, restitution });
  }
  const obj = phys.track(group, body, o.kind, null, { restitution, friction: 0.9, density: o.cols[0]?.density ?? 300 });
  obj.tops = o.tops;
  obj.heavy = o.heavy;
  return obj;
}

const brass = () => mat('#b9a27a', 0.3, 0.9);

/* ------------------------------------------------------------------ main desk (2 m, two monitor risers) */

export const DESK = { w: 2.0, d: 0.8, top: 0.76, riserH: 0.14, riserW: 0.56, riserD: 0.28, riserX: 0.68 } as const;

export function buildDesk(scene: THREE.Scene, phys: Physics, x: number, z: number): Furniture {
  const { w, d, top: ty } = DESK;
  const oak = woodGrain([33, 45, 50], 13, [1, 1]);
  const deskMat = mat('#ffffff', 0.45, 0, { map: oak.map, normalMap: oak.normal, normalScale: new THREE.Vector2(0.3, 0.3) });
  const g = new THREE.Group();
  const top = rbox(w, 0.045, d, 0.01, deskMat);
  top.position.y = ty;
  top.name = 'desk-top';
  g.add(top);
  const legM = mat('#26272a', 0.38, 0.7);
  const lx = w / 2 - 0.05;
  const lz = d / 2 - 0.05;
  const legs: THREE.BufferGeometry[] = [];
  for (const [px, pz] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]] as const) legs.push(placed(rgeo(0.05, ty, 0.05), px, ty / 2, pz));
  legs.push(placed(new THREE.BoxGeometry(w - 0.14, 0.05, 0.02), 0, ty - 0.06, -lz));
  legs.push(placed(new THREE.BoxGeometry(0.02, 0.05, d - 0.14), -lx, ty - 0.06, 0));
  legs.push(placed(new THREE.BoxGeometry(0.02, 0.05, d - 0.14), lx, ty - 0.06, 0));
  // Low stretcher bar: looks sturdy, keeps feet from sliding.
  legs.push(placed(new THREE.BoxGeometry(w - 0.14, 0.03, 0.03), 0, 0.12, -lz));
  g.add(new THREE.Mesh(merge(legs), legM));
  // Monitor risers on the back corners.
  const { riserH: rh, riserW: rw, riserD: rd, riserX: rx } = DESK;
  const riserTop = ty + 0.0225 + rh;
  for (const sx of [-1, 1]) {
    const riser = merge([
      placed(rgeo(rw, 0.025, rd, 0.006), 0, rh - 0.0125, 0),
      placed(rgeo(0.025, rh - 0.025, rd - 0.02, 0.004), -rw / 2 + 0.03, (rh - 0.025) / 2, 0),
      placed(rgeo(0.025, rh - 0.025, rd - 0.02, 0.004), rw / 2 - 0.03, (rh - 0.025) / 2, 0),
    ]);
    const m = new THREE.Mesh(riser, deskMat);
    m.position.set(sx * rx, ty + 0.0225, -d / 2 + rd / 2 + 0.02);
    g.add(m);
  }
  // Pencil drawer (opens).
  const drawerM = mat('#ffffff', 0.5, 0, { map: oak.map, normalMap: oak.normal });
  const drawer = new THREE.Group();
  const box = rbox(0.5, 0.08, 0.6, 0.006, drawerM);
  drawer.add(box);
  const handle = rbox(0.14, 0.012, 0.016, 0.005, mat('#b9b9b9', 0.25, 1));
  handle.position.set(0, 0, 0.305);
  drawer.add(handle);
  drawer.position.set(0.55, ty - 0.0225 - 0.042, 0.04);
  g.add(drawer);
  const tops: Top[] = [
    { kind: 'desk', x: 0, y: ty + 0.0225, z: 0, hw: w / 2 - 0.02, hd: d / 2 - 0.02, clear: 0.9 },
    ...[-1, 1].map((sx) => ({ kind: 'riser' as const, x: sx * rx, y: riserTop, z: -d / 2 + rd / 2 + 0.02, hw: rw / 2 - 0.01, hd: rd / 2 - 0.01, clear: 1.0 })),
  ];
  const cols: Col[] = [
    { shape: 'box', half: [w / 2, 0.0225, d / 2], at: [0, ty, 0], density: 260 },
    ...[[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].map(([px, pz]) => ({ shape: 'box' as const, half: [0.025, ty / 2 - 0.02, 0.025] as [number, number, number], at: [px!, ty / 2 - 0.02, pz!] as [number, number, number], density: 2200, friction: 1 })),
    ...[-1, 1].map((sx) => ({ shape: 'box' as const, half: [rw / 2, rh / 2, rd / 2] as [number, number, number], at: [sx * rx, ty + 0.0225 + rh / 2, -d / 2 + rd / 2 + 0.02] as [number, number, number], density: 120 })),
  ];
  const obj = furnish(scene, phys, g, { kind: 'desk', pos: [x, 0, z], rotY: 0, cols, tops, heavy: true });
  obj.target = 'desk';
  return { obj, drawers: [{ mesh: drawer, z0: drawer.position.z, travel: 0.32, open: false, t: 0, label: 'desk drawer' }] };
}

/* ------------------------------------------------------------------ bed (heavy, shove-only) */

/** Draped blanket over a mattress: flat top, rounded edge, hanging sides and foot, with folds. */
function blanketGeo(W: number, L: number, hang: number, footHang: number): THREE.BufferGeometry {
  const rc = 0.05;
  const a = W / 2 - rc;
  const arc = (rc * Math.PI) / 2;
  const sMax = a + arc + hang;
  const tFlat = L - rc;
  const tMax = tFlat + arc + footHang;
  const g = new THREE.PlaneGeometry(1, 1, 48, 60);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const r = rand(97);
  const phases = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  const drape = (u: number): [number, number] => {
    const au = Math.abs(u);
    if (au <= a) return [u, 0];
    const sgn = Math.sign(u);
    if (au <= a + arc) {
      const phi = (au - a) / rc;
      return [sgn * (a + rc * Math.sin(phi)), rc * (1 - Math.cos(phi))];
    }
    const dd = au - a - arc;
    return [sgn * (a + rc + 0.03 * (dd / Math.max(0.01, hang)) ** 2), rc + dd];
  };
  for (let i = 0; i < pos.count; i++) {
    const s = (uv.getX(i) * 2 - 1) * sMax;
    const t = (1 - uv.getY(i)) * tMax;
    const [x, dropS] = drape(s);
    let z: number;
    let dropT = 0;
    if (t <= tFlat) z = t;
    else if (t <= tFlat + arc) {
      const phi = (t - tFlat) / rc;
      z = tFlat + rc * Math.sin(phi);
      dropT = rc * (1 - Math.cos(phi));
    } else {
      const dd = t - tFlat - arc;
      z = tFlat + rc + 0.02 * (dd / footHang) ** 2;
      dropT = rc + dd;
    }
    const top = Math.max(0, 1 - Math.max(dropS, dropT) / 0.02);
    const lump = 0.01 + 0.009 * Math.sin(t * 7 + phases[0]!) * Math.sin(s * 5 + phases[1]!) + 0.005 * Math.sin(t * 13 + s * 4 + phases[2]!);
    const hangAmt = Math.min(1, Math.max(dropS, dropT) / 0.12);
    const fold = 0.01 * Math.sin((dropS > dropT ? t : s) * 18 + phases[3]!) * hangAmt + 0.004 * Math.sin((dropS > dropT ? t : s) * 41 + phases[4]!) * hangAmt;
    const nx = dropS > 0.02 ? Math.sign(s) : 0;
    const nz = dropT > 0.02 ? 1 : 0;
    pos.setXYZ(i, x + nx * fold, lump * top - dropS - dropT, z + nz * fold);
  }
  g.computeVertexNormals();
  uv.needsUpdate = true;
  return g;
}

/** Puffy pillow from a sphere: squared-off silhouette with pinched seams. */
function pillowGeo(W: number, H: number, D: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 32, 20);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const sx = Math.sign(x) * Math.abs(x) ** 0.45;
    const sz = Math.sign(z) * Math.abs(z) ** 0.45;
    const edge = (1 - 0.55 * sx * sx) * (1 - 0.55 * sz * sz);
    p.setXYZ(i, (sx * W) / 2, (y * H * edge) / 2, (sz * D) / 2);
  }
  g.computeVertexNormals();
  return g;
}

export function buildBed(scene: THREE.Scene, phys: Physics, x: number, z: number): Furniture {
  const bed = new THREE.Group();
  const walnut = woodGrain([24, 40, 28], 9, [1, 1]);
  const frameW = mat('#ffffff', 0.55, 0, { map: walnut.map, normalMap: walnut.normal, normalScale: new THREE.Vector2(0.4, 0.4) });
  const frame = merge([
    placed(rgeo(0.05, 0.2, 2.0), -0.5, 0.2, 0),
    placed(rgeo(0.05, 0.2, 2.0), 0.5, 0.2, 0),
    placed(rgeo(1.05, 0.2, 0.05), 0, 0.2, 0.99),
    placed(rgeo(1.0, 0.04, 1.96), 0, 0.28, 0),
    ...[[-0.5, -0.98], [0.5, -0.98], [-0.5, 0.98], [0.5, 0.98]].map(([lx, lz]) => placed(rgeo(0.06, 0.12, 0.06), lx!, 0.06, lz!)),
    placed(rgeo(1.1, 0.06, 0.07, 0.02), 0, 0.92, -1.0),
    placed(rgeo(0.07, 0.95, 0.07, 0.02), -0.53, 0.47, -1.0),
    placed(rgeo(0.07, 0.95, 0.07, 0.02), 0.53, 0.47, -1.0),
    placed(rgeo(1.0, 0.38, 0.03), 0, 0.68, -1.0),
    placed(rgeo(1.1, 0.05, 0.06, 0.02), 0, 0.5, 1.01),
    placed(rgeo(0.06, 0.52, 0.06, 0.02), -0.53, 0.26, 1.01),
    placed(rgeo(0.06, 0.52, 0.06, 0.02), 0.53, 0.26, 1.01),
  ]);
  bed.add(new THREE.Mesh(frame, frameW));
  const sheet = fabricSet('#efece4', [4, 6]);
  const mattress = rbox(0.95, 0.18, 1.92, 0.06, mat('#ffffff', 0.9, 0, { map: sheet.map, normalMap: sheet.normal }));
  mattress.position.y = 0.39;
  bed.add(mattress);
  const blanketSet = fabricSet('#3c5a8a', [5, 6]);
  const blanket = new THREE.Mesh(blanketGeo(0.97, 1.32, 0.2, 0.18), mat('#ffffff', 0.95, 0, { map: blanketSet.map, normalMap: blanketSet.normal, side: THREE.DoubleSide }));
  blanket.position.set(0, 0.495, -0.34);
  bed.add(blanket);
  const turn = rbox(0.99, 0.035, 0.16, 0.016, mat('#ffffff', 0.9, 0, { map: sheet.map, normalMap: sheet.normal }));
  turn.position.set(0, 0.5, -0.33);
  turn.rotation.x = 0.05;
  bed.add(turn);
  const pillow = new THREE.Mesh(pillowGeo(0.62, 0.16, 0.36), mat('#ffffff', 0.92, 0, { map: sheet.map, normalMap: sheet.normal }));
  pillow.position.set(0, 0.55, -0.72);
  pillow.rotation.x = -0.25;
  bed.add(pillow);
  const throwSet = fabricSet('#c4703c', [1, 1]);
  const throwPillow = new THREE.Mesh(pillowGeo(0.36, 0.13, 0.36), mat('#ffffff', 0.95, 0, { map: throwSet.map, normalMap: throwSet.normal }));
  throwPillow.position.set(0.18, 0.6, -0.6);
  throwPillow.rotation.set(-0.9, 0.3, 0.1);
  bed.add(throwPillow);
  const obj = furnish(scene, phys, bed, {
    kind: 'bed',
    pos: [x, 0, z],
    rotY: 0,
    heavy: true,
    linDamp: 2.5,
    angDamp: 4,
    cols: [
      { shape: 'box', half: [0.53, 0.24, 1.0], at: [0, 0.24, 0], density: 75, friction: 1 },
      { shape: 'box', half: [0.56, 0.47, 0.04], at: [0, 0.47, -1.0], density: 150 },
      { shape: 'box', half: [0.56, 0.26, 0.035], at: [0, 0.26, 1.01], density: 150 },
    ],
  });
  return { obj, drawers: [] };
}

/* ------------------------------------------------------------------ nightstand */

export function buildNightstand(scene: THREE.Scene, phys: Physics, x: number, z: number, rotY: number): Furniture {
  const wood = woodGrain([60, 40, 28], 21, [1, 1]);
  const m = mat('#ffffff', 0.5, 0, { map: wood.map, normalMap: wood.normal });
  const g = new THREE.Group();
  const W = 0.42;
  const H = 0.55;
  const D = 0.38;
  g.add(
    new THREE.Mesh(
      merge([
        placed(rgeo(W, 0.03, D), 0, H - 0.015, 0),
        placed(rgeo(0.02, H - 0.05, D - 0.01), -W / 2 + 0.01, (H - 0.05) / 2 + 0.02, 0),
        placed(rgeo(0.02, H - 0.05, D - 0.01), W / 2 - 0.01, (H - 0.05) / 2 + 0.02, 0),
        placed(rgeo(W - 0.02, 0.02, D - 0.02), 0, 0.03, 0),
        placed(rgeo(W - 0.02, H - 0.05, 0.012), 0, (H - 0.05) / 2 + 0.02, -D / 2 + 0.006),
        placed(rgeo(W - 0.02, 0.02, D - 0.02), 0, 0.2, 0),
      ]),
      m,
    ),
  );
  const drawer = new THREE.Group();
  drawer.add(rbox(W - 0.05, 0.2, 0.02, 0.006, m));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), brass());
  knob.position.z = 0.018;
  drawer.add(knob);
  drawer.position.set(0, 0.37, D / 2 - 0.01);
  g.add(drawer);
  // Little alarm clock on top (decoration, part of the nightstand).
  const clock = rbox(0.12, 0.07, 0.05, 0.01, mat('#222', 0.5));
  clock.position.set(0.1, H + 0.035, -0.05);
  g.add(clock);
  const digits = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.04), mat('#000', 0.5, 0, { emissive: '#ff3b3b', emissiveIntensity: 1.5, map: labelTex('07:00', '#000', '#ff4a4a', 128, 56, 36) }));
  digits.material.userData.noSkin = true;
  digits.position.set(0.1, H + 0.035, -0.024);
  g.add(digits);
  const obj = furnish(scene, phys, g, {
    kind: 'nightstand',
    pos: [x, 0, z],
    rotY,
    cols: [
      { shape: 'box', half: [W / 2, 0.1, D / 2], at: [0, 0.1, 0], density: 220 },
      { shape: 'box', half: [W / 2, (H - 0.2) / 2, D / 2], at: [0, 0.2 + (H - 0.2) / 2, 0], density: 50 },
      { shape: 'box', half: [0.06, 0.035, 0.025], at: [0.1, H + 0.035, -0.05], density: 200 },
    ],
    tops: [{ kind: 'nightstand', x: 0, y: H, z: 0, hw: W / 2 - 0.01, hd: D / 2 - 0.01, clear: 0.9 }],
  });
  return { obj, drawers: [{ mesh: drawer, z0: drawer.position.z, travel: 0.22, open: false, t: 0, label: 'nightstand drawer' }] };
}

/* ------------------------------------------------------------------ second desk (craft table) */

export function buildTable(scene: THREE.Scene, phys: Physics, x: number, z: number, rotY: number): Furniture {
  const W = 1.4;
  const D = 0.65;
  const T = 0.74;
  const wood = woodGrain([70, 60, 50], 29, [1, 1]);
  const topM = mat('#ffffff', 0.5, 0, { map: wood.map, normalMap: wood.normal });
  const legM = mat('#e9e4d8', 0.45);
  const g = new THREE.Group();
  const top = rbox(W, 0.04, D, 0.01, topM);
  top.position.y = T;
  g.add(top);
  const lx = W / 2 - 0.06;
  const lz = D / 2 - 0.06;
  g.add(
    new THREE.Mesh(
      merge([
        ...[[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].map(([px, pz]) => placed(rgeo(0.045, T - 0.02, 0.045), px!, (T - 0.02) / 2, pz!)),
        placed(new THREE.BoxGeometry(0.02, 0.04, D - 0.12), -lx, 0.18, 0),
        placed(new THREE.BoxGeometry(0.02, 0.04, D - 0.12), lx, 0.18, 0),
        placed(new THREE.BoxGeometry(W - 0.12, 0.04, 0.02), 0, 0.18, -lz),
      ]),
      legM,
    ),
  );
  // A cutting mat and a pencil cup glued in place (they are part of the table).
  const cutMat = rbox(0.45, 0.004, 0.3, 0.002, mat('#2f6b4f', 0.8));
  cutMat.position.set(-0.35, T + 0.022, 0.05);
  g.add(cutMat);
  const obj = furnish(scene, phys, g, {
    kind: 'table',
    pos: [x, 0, z],
    rotY,
    heavy: true,
    cols: [
      { shape: 'box', half: [W / 2, 0.02, D / 2], at: [0, T, 0], density: 400 },
      ...[[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].map(([px, pz]) => ({ shape: 'box' as const, half: [0.0225, (T - 0.02) / 2, 0.0225] as [number, number, number], at: [px!, (T - 0.02) / 2, pz!] as [number, number, number], density: 2500, friction: 1 })),
    ],
    tops: [{ kind: 'table', x: 0, y: T + 0.02, z: 0, hw: W / 2 - 0.02, hd: D / 2 - 0.02, clear: 0.9 }],
  });
  return { obj, drawers: [] };
}

/* ------------------------------------------------------------------ bookcase */

export const BOOKCASE = { w: 0.95, h: 1.9, d: 0.34, shelves: [0.06, 0.42, 0.8, 1.18, 1.56] } as const;

export function buildBookcase(scene: THREE.Scene, phys: Physics, x: number, z: number, rotY: number): Furniture {
  const { w: W, h: H, d: D, shelves } = BOOKCASE;
  const wood = woodGrain([40, 30, 24], 33, [1, 1]);
  const m = mat('#ffffff', 0.55, 0, { map: wood.map, normalMap: wood.normal });
  const g = new THREE.Group();
  const T = 0.022;
  const parts: THREE.BufferGeometry[] = [
    placed(rgeo(T, H, D, 0.004), -W / 2 + T / 2, H / 2, 0),
    placed(rgeo(T, H, D, 0.004), W / 2 - T / 2, H / 2, 0),
    placed(rgeo(W, T, D, 0.004), 0, H - T / 2, 0),
    placed(rgeo(W - 2 * T, 0.012, 0.012), 0, H / 2, -D / 2 + 0.006),
    placed(new THREE.BoxGeometry(W - 2 * T, H, 0.008), 0, H / 2, -D / 2 + 0.004),
    placed(rgeo(W - 2 * T, shelves[0]!, D - 0.02, 0.004), 0, shelves[0]! / 2, 0.01),
  ];
  for (const y of shelves.slice(1)) parts.push(placed(rgeo(W - 2 * T, T, D - 0.02, 0.004), 0, y - T / 2, 0.01));
  g.add(new THREE.Mesh(merge(parts), m));
  // Books: a few runs on some shelves (part of the bookcase, they have their own colliders below).
  const br = rand(311);
  const colors = ['#a23b3b', '#3b6aa2', '#e0b040', '#4b8b4b', '#7a4ba2', '#d6cdb4', '#2b2b2b', '#c46a3b', '#5a7f8f'];
  const runs: [number, number, number][] = [
    [1, -0.42, 0.42],
    [2, -0.42, -0.05],
    [3, 0.05, 0.42],
    [4, -0.42, -0.15],
  ];
  const bookParts = new Map<string, THREE.BufferGeometry[]>();
  const bookCols: Col[] = [];
  for (const [si, a, b] of runs) {
    const y = shelves[si]!;
    let cx = a;
    while (cx < b - 0.03) {
      const bw = 0.025 + br() * 0.02;
      const bh = 0.2 + br() * 0.09;
      const bd = 0.17 + br() * 0.06;
      const c = colors[Math.floor(br() * colors.length)]!;
      const arr = bookParts.get(c) ?? [];
      arr.push(placed(rgeo(bw, bh, bd, 0.003), cx + bw / 2, y + bh / 2, -D / 2 + 0.02 + bd / 2));
      bookParts.set(c, arr);
      cx += bw + 0.002;
    }
    bookCols.push({ shape: 'box', half: [(cx - a) / 2, 0.15, 0.12], at: [(a + cx) / 2, y + 0.15, -D / 2 + 0.14], density: 60 });
  }
  for (const [c, arr] of bookParts) g.add(new THREE.Mesh(merge(arr), mat(c, 0.75)));
  const cols: Col[] = [
    { shape: 'box', half: [W / 2 - T, shelves[0]! / 2, D / 2 - 0.01], at: [0, shelves[0]! / 2, 0.01], density: 2600, friction: 1 },
    { shape: 'box', half: [T / 2, H / 2, D / 2], at: [-W / 2 + T / 2, H / 2, 0], density: 500 },
    { shape: 'box', half: [T / 2, H / 2, D / 2], at: [W / 2 - T / 2, H / 2, 0], density: 500 },
    { shape: 'box', half: [W / 2 - T, H / 2, 0.005], at: [0, H / 2, -D / 2 + 0.005], density: 500 },
    { shape: 'box', half: [W / 2, T / 2, D / 2], at: [0, H - T / 2, 0], density: 500 },
    ...shelves.slice(1).map((y) => ({ shape: 'box' as const, half: [W / 2 - T, T / 2, D / 2 - 0.01] as [number, number, number], at: [0, y - T / 2, 0.01] as [number, number, number], density: 500 })),
    ...bookCols,
  ];
  const tops: Top[] = shelves.map((y, i) => ({ kind: 'shelf' as const, x: 0, y, z: 0.01, hw: W / 2 - T - 0.01, hd: D / 2 - 0.02, clear: (shelves[i + 1] ?? H) - y - T - 0.01 }));
  tops.push({ kind: 'shelf', x: 0, y: H, z: 0, hw: W / 2 - 0.02, hd: D / 2 - 0.02, clear: 0.6 });
  const obj = furnish(scene, phys, g, { kind: 'bookcase', pos: [x, 0, z], rotY, cols, tops, heavy: true, angDamp: 3 });
  return { obj, drawers: [] };
}

/* ------------------------------------------------------------------ dresser */

export function buildDresser(scene: THREE.Scene, phys: Physics, x: number, z: number, rotY: number): Furniture {
  const W = 1.1;
  const H = 0.86;
  const D = 0.48;
  const wood = woodGrain([245, 240, 230], 41, [1, 1]);
  const m = mat('#ffffff', 0.5, 0, { map: wood.map, normalMap: wood.normal, normalScale: new THREE.Vector2(0.2, 0.2) });
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      merge([
        placed(rgeo(W + 0.03, 0.03, D + 0.02, 0.008), 0, H - 0.015, 0.005),
        placed(rgeo(0.025, H - 0.1, D), -W / 2 + 0.0125, (H - 0.1) / 2 + 0.07, 0),
        placed(rgeo(0.025, H - 0.1, D), W / 2 - 0.0125, (H - 0.1) / 2 + 0.07, 0),
        placed(rgeo(W, 0.03, D), 0, 0.085, 0),
        placed(new THREE.BoxGeometry(W - 0.04, H - 0.1, 0.01), 0, (H - 0.1) / 2 + 0.07, -D / 2 + 0.005),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => placed(new THREE.CylinderGeometry(0.025, 0.018, 0.07, 12), sx! * (W / 2 - 0.05), 0.035, sz! * (D / 2 - 0.05))),
      ]),
      m,
    ),
  );
  const drawers: Drawer[] = [];
  const dh = (H - 0.15) / 3;
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Group();
    d.add(rbox(W - 0.06, dh - 0.02, 0.022, 0.006, m));
    for (const kx of [-0.25, 0.25]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), brass());
      knob.position.set(kx, 0, 0.02);
      d.add(knob);
    }
    d.position.set(0, 0.11 + dh / 2 + i * dh, D / 2 - 0.008);
    g.add(d);
    drawers.push({ mesh: d, z0: d.position.z, travel: 0.3, open: false, t: 0, label: ['bottom drawer', 'middle drawer', 'sock drawer'][i]! });
  }
  // A framed photo of Mom on top (part of the dresser).
  const photo = new THREE.Group();
  const pf = rbox(0.16, 0.2, 0.015, 0.004, mat('#6b4a2b', 0.5));
  photo.add(pf);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), mat('#ffffff', 0.6, 0, { map: labelTex('MOM\n♥', '#f3d9c0', '#7a3b3b', 128, 170, 40) }));
  pic.position.z = 0.009;
  photo.add(pic);
  photo.position.set(-0.38, H + 0.1, -0.1);
  photo.rotation.x = -0.12;
  g.add(photo);
  const obj = furnish(scene, phys, g, {
    kind: 'dresser',
    pos: [x, 0, z],
    rotY,
    heavy: true,
    cols: [
      { shape: 'box', half: [W / 2, 0.06, D / 2], at: [0, 0.06, 0], density: 900, friction: 1 },
      { shape: 'box', half: [W / 2, (H - 0.12) / 2, D / 2], at: [0, 0.12 + (H - 0.12) / 2, 0], density: 160 },
      { shape: 'box', half: [0.08, 0.1, 0.03], at: [-0.38, H + 0.1, -0.1], density: 100 },
    ],
    tops: [{ kind: 'dresser', x: 0, y: H, z: 0, hw: W / 2 - 0.01, hd: D / 2 - 0.01, clear: 0.9 }],
  });
  return { obj, drawers };
}

/* ------------------------------------------------------------------ static wall shelf */

export interface WallShelf {
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
}

/** A floating plank with two brackets. `yaw` turns the shelf's front (+z) into the room. */
export function buildWallShelf(scene: THREE.Scene, phys: Physics, s: WallShelf, books: boolean, seed: number): void {
  const wood = woodGrain([30, 30, 70], 17 + seed);
  const g = new THREE.Group();
  const board = rbox(s.w, 0.03, s.d, 0.005, mat('#ffffff', 0.5, 0, { map: wood.map, normalMap: wood.normal }));
  g.add(board);
  const metal = mat('#3a3631', 0.35, 0.8);
  const br: THREE.BufferGeometry[] = [];
  for (const bx of [-s.w / 2 + 0.1, s.w / 2 - 0.1]) {
    br.push(placed(new THREE.BoxGeometry(0.02, 0.16, 0.012), bx, -0.095, -s.d / 2 + 0.006));
    br.push(placed(new THREE.BoxGeometry(0.02, 0.012, s.d - 0.03), bx, -0.021, -0.01));
  }
  g.add(new THREE.Mesh(merge(br), metal));
  if (books) {
    const r = rand(77 + seed);
    const colors = ['#a23b3b', '#3b6aa2', '#e0b040', '#4b8b4b', '#7a4ba2', '#d6cdb4'];
    let bx = -s.w / 2 + 0.05;
    colors.forEach((c, i) => {
      const bh = 0.2 + r() * 0.06;
      const bw = 0.035 + r() * 0.015;
      const b = rbox(bw, bh, 0.15 + r() * 0.03, 0.004, mat(c, 0.75));
      const lean = i === colors.length - 1 ? -0.35 : 0;
      b.position.set(bx + (lean ? 0.03 : 0), 0.015 + bh / 2 - (lean ? 0.012 : 0), 0);
      b.rotation.z = lean;
      g.add(b);
      bx += bw + 0.008;
    });
    // The books are glued down: one static collider so props don't spawn into them.
    const half = (bx - (-s.w / 2 + 0.05)) / 2 + 0.03;
    const cxLocal = -s.w / 2 + 0.05 + half - 0.03;
    const off = new THREE.Vector3(cxLocal, 0.15, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    phys.staticBox({ x: half, y: 0.13, z: 0.09 }, { x: s.x + off.x, y: s.y + off.y, z: s.z + off.z }, 0.8, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw));
  }
  g.position.set(s.x, s.y, s.z);
  g.rotation.y = s.yaw;
  scene.add(shadowed(g));
  phys.staticBox({ x: s.w / 2, y: 0.015, z: s.d / 2 }, { x: s.x, y: s.y, z: s.z }, 0.9, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw));
}
