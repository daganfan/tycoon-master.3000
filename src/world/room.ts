import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics, PhysObj } from './physics';
import { markScreenMaterial } from './render';
import { ceilingTex, clockFace, crustyPlastic, fabricSet, fringeTex, labelTex, plaster, posterTex, rand, rug, skyTex, woodFloor, woodGrain } from './textures';

export const ROOM = { hx: 3, hz: 2.5, h: 2.7 };
/** The door in the front wall (leads to the garage). */
export const DOOR = { x: 1.6, w: 0.9, h: 2.05 };

/** Window opening in the right wall (x = +hx). Centre z/y, width along z, height. */
export const WINDOW = { z: 0.6, y: 1.55, w: 1.4, h: 1.1, depth: 0.16 };

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

/** A geometry translated/rotated in place (for merging many parts into one draw call). */
function placed(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}

/** Merge parts that may or may not be indexed. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(list, false)!;
}

/** Scale the back half (z < 0) of a geometry, used for tapered CRT housings. */
function taper(g: THREE.BufferGeometry, depth: number, factor: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const t = THREE.MathUtils.clamp(-z / (depth / 2), 0, 1);
    const s = 1 - (1 - factor) * t;
    p.setXY(i, p.getX(i) * s, p.getY(i) * (1 - (1 - factor) * 0.8 * t));
  }
  g.computeVertexNormals();
  return g;
}

export interface Screen {
  mesh: THREE.Mesh;
  obj: PhysObj;
  /** Local transform of the screen plane inside the tracked body. */
  w: number;
  h: number;
}

/** A cable between two (possibly moving) anchors; rebuilt only when an end moves. */
export class Cable {
  readonly mesh: THREE.Mesh;
  private last = [new THREE.Vector3(1e9, 0, 0), new THREE.Vector3()];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  constructor(
    private readonly from: THREE.Object3D,
    private readonly fromLocal: THREE.Vector3,
    private readonly to: THREE.Object3D,
    private readonly toLocal: THREE.Vector3,
    material: THREE.Material,
    private readonly radius = 0.006,
  ) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  update(): void {
    this.from.updateWorldMatrix(true, false);
    this.to.updateWorldMatrix(true, false);
    this.a.copy(this.fromLocal).applyMatrix4(this.from.matrixWorld);
    this.b.copy(this.toLocal).applyMatrix4(this.to.matrixWorld);
    if (this.a.distanceToSquared(this.last[0]!) < 1e-4 && this.b.distanceToSquared(this.last[1]!) < 1e-4) return;
    this.last[0]!.copy(this.a);
    this.last[1]!.copy(this.b);
    const wallZ = -ROOM.hz + 0.05;
    const far = Math.abs(this.a.z - wallZ) > 1.3 || Math.abs(this.b.z - wallZ) > 1.3 || this.a.y < -0.5 || this.b.y < -0.5;
    this.mesh.visible = !far;
    if (far) return;
    const a = this.a;
    const b = this.b;
    const pts = [
      a.clone(),
      new THREE.Vector3(a.x, a.y * 0.55 + 0.02, THREE.MathUtils.lerp(a.z, wallZ, 0.7)),
      new THREE.Vector3(a.x + (b.x - a.x) * 0.1, 0.012, wallZ),
      new THREE.Vector3(a.x + (b.x - a.x) * 0.9, 0.012, wallZ),
      new THREE.Vector3(b.x, b.y * 0.55 + 0.02, THREE.MathUtils.lerp(b.z, wallZ, 0.7)),
      b.clone(),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(curve, 48, this.radius, 6, false);
  }
}

export interface RoomRefs {
  desk: PhysObj;
  pc: PhysObj;
  monitor: PhysObj;
  screen: Screen;
  chair: PhysObj;
  garageSign: THREE.Mesh;
  /** Door pivot (hinge on the -x edge); the garage module swings it open. */
  door: THREE.Group;
  deskTopY: number;
  /** Sky seen through the window (uniforms: day, dusk, intensity). */
  sky: THREE.ShaderMaterial;
  /** Window glass (for reflection tuning by time of day). */
  glass: THREE.MeshStandardMaterial;
  /** Animated details (cables, wall clock, PC LEDs). */
  update(dt: number): void;
}

const SKY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform float day;
  uniform float dusk;
  uniform float intensity;
  varying vec2 vUv;
  void main() {
    vec3 d = texture2D(dayMap, vUv).rgb;
    vec3 n = texture2D(nightMap, vUv).rgb;
    vec3 c = mix(n, d, day);
    c = mix(c, c * vec3(1.35, 0.8, 0.6) + vec3(0.12, 0.04, 0.0) * (1.0 - vUv.y), dusk);
    gl_FragColor = vec4(c * intensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Build a monitor: bezel + stand + glowing screen plane. Returns the group and the screen mesh. */
export function buildMonitor(w: number, h: number, crusty: boolean): { group: THREE.Group; screen: THREE.Mesh; half: THREE.Vector3 } {
  const g = new THREE.Group();
  const depth = crusty ? 0.32 : 0.05;
  const cy = 0.16 + h / 2;
  if (crusty) {
    const pl = crustyPlastic();
    const shell = mat('#ffffff', 0.62, 0, { map: pl.map, roughnessMap: pl.rough });
    const dark = mat('#2a2925', 0.5);
    // Front bezel ring, slightly proud of the tube face so the screen sits inset.
    const bw = w + 0.08;
    const bh = h + 0.08;
    const frame = merge([
      placed(new RoundedBoxGeometry(bw, 0.05, 0.05, 2, 0.012), 0, h / 2 + 0.025, 0),
      placed(new RoundedBoxGeometry(bw, 0.07, 0.05, 2, 0.012), 0, -h / 2 - 0.035 + 0.0, 0),
      placed(new RoundedBoxGeometry(0.045, bh, 0.05, 2, 0.012), -w / 2 - 0.0225 + 0.0, 0, 0),
      placed(new RoundedBoxGeometry(0.045, bh, 0.05, 2, 0.012), w / 2 + 0.0225, 0, 0),
    ]);
    const bezel = new THREE.Mesh(frame, shell);
    bezel.position.set(0, cy, 0.025);
    g.add(bezel);
    // Glass border around the visible image
    const glassEdge = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h + 0.02), mat('#1d1f1e', 0.15, 0.1));
    glassEdge.position.set(0, cy, 0.03);
    g.add(glassEdge);
    // Housing + tapered tube bell
    const front = rbox(bw, bh + 0.01, 0.12, 0.02, shell);
    front.position.set(0, cy, -0.04);
    g.add(front);
    const bell = new THREE.Mesh(taper(new RoundedBoxGeometry(bw - 0.02, bh - 0.02, 0.24, 3, 0.03), 0.24, 0.62), shell);
    bell.position.set(0, cy - 0.01, -0.2);
    g.add(bell);
    // Vents on top of the bell
    const slots: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) slots.push(placed(new THREE.BoxGeometry(0.24, 0.004, 0.008), 0, 0, -i * 0.016));
    const vents = new THREE.Mesh(merge(slots), dark);
    vents.position.set(0, cy + bh / 2 + 0.004, -0.005);
    g.add(vents);
    // Badge, power button, LED
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.016), mat('#ffffff', 0.4, 0.3, { map: labelTex('CRUSTCO', '#8f8a78', '#e8e2cc', 256, 52, 34) }));
    badge.position.set(-w / 2 + 0.06, cy - h / 2 - 0.035, 0.0505);
    g.add(badge);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16), shell);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(w / 2 - 0.02, cy - h / 2 - 0.035, 0.05);
    g.add(btn);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), mat('#103010', 0.3, 0, { emissive: '#3dff6e', emissiveIntensity: 4 }));
    led.position.set(w / 2 - 0.05, cy - h / 2 - 0.035, 0.05);
    led.material.userData.noSkin = true;
    g.add(led);
    // Swivel base
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 24), shell);
    neck.position.set(0, 0.08, -0.08);
    g.add(neck);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.02, 32), shell);
    foot.scale.set(1, 1, 0.75);
    foot.position.set(0, 0.01, -0.06);
    g.add(foot);
  } else {
    const bezelM = mat('#16171a', 0.45, 0.2);
    const body = rbox(w + 0.03, h + 0.03, depth, 0.008, bezelM);
    body.position.set(0, cy, 0);
    g.add(body);
    const back = rbox(w * 0.6, h * 0.6, 0.04, 0.015, bezelM);
    back.position.set(0, cy, -depth / 2 - 0.015);
    g.add(back);
    const neck = rbox(0.05, 0.16, 0.025, 0.008, mat('#2b2d31', 0.35, 0.6));
    neck.position.set(0, 0.09, -0.05);
    neck.rotation.x = -0.12;
    g.add(neck);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.115, 0.014, 32), mat('#2b2d31', 0.35, 0.6));
    foot.scale.set(1.1, 1, 0.8);
    foot.position.set(0, 0.007, -0.04);
    g.add(foot);
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.003, 10), mat('#000', 0.3, 0, { emissive: '#4da3ff', emissiveIntensity: 4 }));
    led.position.set(w / 2 - 0.01, cy - h / 2 - 0.008, depth / 2 + 0.0005);
    led.material.userData.noSkin = true;
    g.add(led);
  }
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  markScreenMaterial(screenMat);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
  screen.position.set(0, cy, (crusty ? 0.03 : depth / 2) + 0.002);
  g.add(screen);
  shadowed(g);
  screen.castShadow = false;
  const half = new THREE.Vector3((w + 0.06) / 2, (0.16 + h + 0.03) / 2, Math.max(0.1, depth / 2));
  return { group: g, screen, half };
}

/** Wall plane (centred, facing +z) with rectangular holes; UVs span 0..1 over the whole wall. */
function wallGeo(w: number, h: number, holes: { x: number; y: number; w: number; h: number }[] = []): THREE.BufferGeometry {
  if (!holes.length) return new THREE.PlaneGeometry(w, h);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.lineTo(-w / 2, -h / 2);
  for (const o of holes) {
    const p = new THREE.Path();
    p.moveTo(o.x - o.w / 2, o.y - o.h / 2);
    p.lineTo(o.x - o.w / 2, o.y + o.h / 2);
    p.lineTo(o.x + o.w / 2, o.y + o.h / 2);
    p.lineTo(o.x + o.w / 2, o.y - o.h / 2);
    p.lineTo(o.x - o.w / 2, o.y - o.h / 2);
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  return g;
}

/** Extrude a 2D profile (x = distance from wall, y = height) along local -x for `len`. */
function profileGeo(points: [number, number][], len: number): THREE.BufferGeometry {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 8 });
  g.rotateY(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  return g;
}

const BASEBOARD: [number, number][] = [
  [0, 0],
  [0.018, 0],
  [0.018, 0.1],
  [0.014, 0.112],
  [0.008, 0.118],
  [0, 0.122],
];
const CROWN: [number, number][] = [
  [0, 0],
  [0, -0.02],
  [0.012, -0.03],
  [0.03, -0.045],
  [0.05, -0.052],
  [0.07, -0.056],
  [0.085, -0.06],
  [0.09, -0.07],
  [0.1, -0.07],
  [0.1, 0],
];

/** Draped blanket over a mattress: flat top, rounded edge, hanging sides and foot, with folds. */
function blanketGeo(W: number, L: number, hang: number, footHang: number): THREE.BufferGeometry {
  const rc = 0.05;
  const a = W / 2 - rc;
  const arc = (rc * Math.PI) / 2;
  const sMax = a + arc + hang;
  const tFlat = L - rc;
  const tMax = tFlat + arc + footHang;
  const segS = 48;
  const segT = 60;
  const g = new THREE.PlaneGeometry(1, 1, segS, segT);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const r = rand(97);
  const phases = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  const drape = (u: number): [number, number] => {
    // returns [offset along axis, drop]
    const au = Math.abs(u);
    if (au <= a) return [u, 0];
    const sgn = Math.sign(u);
    if (au <= a + arc) {
      const phi = (au - a) / rc;
      return [sgn * (a + rc * Math.sin(phi)), rc * (1 - Math.cos(phi))];
    }
    const d = au - a - arc;
    return [sgn * (a + rc + 0.03 * (d / Math.max(0.01, hang)) ** 2), rc + d];
  };
  for (let i = 0; i < pos.count; i++) {
    const s = (uv.getX(i) * 2 - 1) * sMax;
    const t = (1 - uv.getY(i)) * tMax; // 0 at head end
    const [x, dropS] = drape(s);
    let z: number;
    let dropT = 0;
    if (t <= tFlat) z = t;
    else if (t <= tFlat + arc) {
      const phi = (t - tFlat) / rc;
      z = tFlat + rc * Math.sin(phi);
      dropT = rc * (1 - Math.cos(phi));
    } else {
      const d = t - tFlat - arc;
      z = tFlat + rc + 0.02 * (d / footHang) ** 2;
      dropT = rc + d;
    }
    const top = Math.max(0, 1 - Math.max(dropS, dropT) / 0.02);
    // soft lumps on top, vertical folds where it hangs
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

/** Curtain panel with vertical folds (faces +z in local space). */
function curtainGeo(w: number, h: number, folds: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, Math.max(16, folds * 6), 24);
  const p = g.attributes.position as THREE.BufferAttribute;
  const r = rand(seed);
  const ph = r() * 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const down = (h / 2 - y) / h; // 0 at rod, 1 at hem
    const amp = 0.035 + 0.02 * down;
    const z = Math.sin((x / w) * folds * Math.PI * 2 + ph + down * 0.6) * amp + Math.sin((x / w) * folds * 5.3 + ph) * 0.006;
    p.setXYZ(i, x * (1 - 0.08 * down * down), y, z + 0.04);
  }
  g.computeVertexNormals();
  return g;
}

export function buildRoom(scene: THREE.Scene, phys: Physics): RoomRefs {
  const R = phys.R;
  const { hx, hz, h } = ROOM;

  // ------------------------------------------------------------ floor
  const wood = woodFloor();
  const floorMat = mat('#ffffff', 1, 0, { map: wood.map, roughnessMap: wood.rough, normalMap: wood.normal, normalScale: new THREE.Vector2(0.7, 0.7) });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  phys.staticBox({ x: hx + 1, y: 0.1, z: hz + 1 }, { x: 0, y: -0.1, z: 0 });

  // ------------------------------------------------------------ walls + ceiling
  const pl = plaster(36, 20, 80);
  const wallMat = mat('#ffffff', 0.9, 0, { map: pl.map, normalMap: pl.normal, normalScale: new THREE.Vector2(0.35, 0.35) });
  const wall = (w: number, pos: THREE.Vector3, ry: number, holes: { x: number; y: number; w: number; h: number }[] = [], wh = h) => {
    const m = new THREE.Mesh(wallGeo(w, wh, holes), wallMat);
    m.position.copy(pos);
    m.rotation.y = ry;
    m.receiveShadow = true;
    // Walls block the sun so light only enters through the window.
    m.castShadow = true;
    scene.add(m);
  };
  wall(hx * 2, new THREE.Vector3(0, h / 2, -hz), 0);
  // Front wall with a doorway (to the garage).
  const dl = DOOR.x - DOOR.w / 2;
  const dr = DOOR.x + DOOR.w / 2;
  wall(dl + hx, new THREE.Vector3((dl - hx) / 2, h / 2, hz), Math.PI);
  wall(hx - dr, new THREE.Vector3((dr + hx) / 2, h / 2, hz), Math.PI);
  wall(DOOR.w, new THREE.Vector3(DOOR.x, (DOOR.h + h) / 2, hz), Math.PI, [], h - DOOR.h);
  wall(hz * 2, new THREE.Vector3(-hx, h / 2, 0), Math.PI / 2);
  wall(hz * 2, new THREE.Vector3(hx, h / 2, 0), -Math.PI / 2, [{ x: WINDOW.z, y: WINDOW.y - h / 2, w: WINDOW.w, h: WINDOW.h }]);
  phys.staticBox({ x: hx, y: h, z: 0.1 }, { x: 0, y: h / 2, z: -hz - 0.1 });
  phys.staticBox({ x: (dl + hx) / 2, y: h / 2, z: 0.1 }, { x: (dl - hx) / 2, y: h / 2, z: hz + 0.1 });
  phys.staticBox({ x: (hx - dr) / 2, y: h / 2, z: 0.1 }, { x: (dr + hx) / 2, y: h / 2, z: hz + 0.1 });
  phys.staticBox({ x: DOOR.w / 2, y: (h - DOOR.h) / 2, z: 0.1 }, { x: DOOR.x, y: (h + DOOR.h) / 2, z: hz + 0.1 });
  phys.staticBox({ x: 0.1, y: h, z: hz }, { x: -hx - 0.1, y: h / 2, z: 0 });
  phys.staticBox({ x: 0.1, y: h, z: hz }, { x: hx + 0.1, y: h / 2, z: 0 });
  phys.staticBox({ x: hx, y: 0.1, z: hz }, { x: 0, y: h + 0.1, z: 0 });
  const ct = ceilingTex();
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), mat('#ffffff', 0.95, 0, { map: ct.map, normalMap: ct.normal, normalScale: new THREE.Vector2(0.5, 0.5) }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  ceil.castShadow = true;
  ceil.receiveShadow = true;
  scene.add(ceil);

  // Baseboards + crown molding
  const trimM = mat('#f4f0e6', 0.45);
  // base: false = crown only (front wall has the doorway, so its baseboard is split in two)
  const walls: { len: number; x: number; z: number; ry: number; base?: boolean; crown?: boolean }[] = [
    { len: hx * 2, x: 0, z: -hz, ry: 0 },
    { len: hx * 2, x: 0, z: hz, ry: Math.PI, base: false },
    { len: dl + hx, x: (dl - hx) / 2, z: hz, ry: Math.PI, crown: false },
    { len: hx - dr, x: (dr + hx) / 2, z: hz, ry: Math.PI, crown: false },
    { len: hz * 2, x: -hx, z: 0, ry: Math.PI / 2 },
    { len: hz * 2, x: hx, z: 0, ry: -Math.PI / 2 },
  ];
  const trims: THREE.BufferGeometry[] = [];
  for (const wdef of walls) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(wdef.x, 0, wdef.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wdef.ry), new THREE.Vector3(1, 1, 1));
    if (wdef.base !== false) trims.push(profileGeo(BASEBOARD, wdef.len).applyMatrix4(m));
    if (wdef.crown !== false) trims.push(profileGeo(CROWN, wdef.len).translate(0, h, 0).applyMatrix4(m));
  }
  const trim = new THREE.Mesh(merge(trims), trimM);
  trim.receiveShadow = true;
  scene.add(trim);

  // ------------------------------------------------------------ window (right wall)
  const win = new THREE.Group();
  win.position.set(hx, WINDOW.y, WINDOW.z);
  win.rotation.y = -Math.PI / 2; // local +z points into the room, local +x = world +z
  const frameM = mat('#f7f6f0', 0.38);
  const ww = WINDOW.w;
  const wh = WINDOW.h;
  const dpt = WINDOW.depth;
  // Reveal (inside of the wall thickness)
  const reveal = merge([
    placed(new THREE.PlaneGeometry(ww, dpt), 0, wh / 2, -dpt / 2, Math.PI / 2),
    placed(new THREE.PlaneGeometry(ww, dpt), 0, -wh / 2, -dpt / 2, -Math.PI / 2),
    placed(new THREE.PlaneGeometry(dpt, wh), -ww / 2, 0, -dpt / 2, 0, Math.PI / 2),
    placed(new THREE.PlaneGeometry(dpt, wh), ww / 2, 0, -dpt / 2, 0, -Math.PI / 2),
  ]);
  const revealMesh = new THREE.Mesh(reveal, wallMat);
  revealMesh.receiveShadow = true;
  revealMesh.castShadow = true;
  win.add(revealMesh);
  // Sashes + muntins set back in the reveal
  const sashZ = -dpt + 0.05;
  const sash = merge([
    placed(new THREE.BoxGeometry(ww, 0.06, 0.05), 0, wh / 2 - 0.03, sashZ),
    placed(new THREE.BoxGeometry(ww, 0.07, 0.05), 0, -wh / 2 + 0.035, sashZ),
    placed(new THREE.BoxGeometry(0.06, wh, 0.05), -ww / 2 + 0.03, 0, sashZ),
    placed(new THREE.BoxGeometry(0.06, wh, 0.05), ww / 2 - 0.03, 0, sashZ),
    placed(new THREE.BoxGeometry(0.05, wh, 0.05), 0, 0, sashZ),
    placed(new THREE.BoxGeometry(ww, 0.04, 0.04), 0, 0.02, sashZ + 0.005),
    placed(new THREE.BoxGeometry(0.025, wh, 0.03), -ww / 4, 0, sashZ),
    placed(new THREE.BoxGeometry(0.025, wh, 0.03), ww / 4, 0, sashZ),
  ]);
  const sashMesh = new THREE.Mesh(sash, frameM);
  sashMesh.castShadow = true;
  sashMesh.receiveShadow = true;
  win.add(sashMesh);
  const glass = mat('#c8dde8', 0.04, 0, { transparent: true, opacity: 0.12, envMapIntensity: 2.2, depthWrite: false });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.04, wh - 0.04), glass);
  pane.position.z = sashZ;
  pane.renderOrder = 2;
  pane.userData.noAO = true;
  win.add(pane);
  // Casing on the wall surface + sill (stool) + apron
  const casing = merge([
    placed(new RoundedBoxGeometry(ww + 0.2, 0.08, 0.02, 2, 0.006), 0, wh / 2 + 0.04, 0.01),
    placed(new RoundedBoxGeometry(0.08, wh + 0.12, 0.02, 2, 0.006), -ww / 2 - 0.04, 0.02, 0.01),
    placed(new RoundedBoxGeometry(0.08, wh + 0.12, 0.02, 2, 0.006), ww / 2 + 0.04, 0.02, 0.01),
    placed(new RoundedBoxGeometry(ww + 0.12, 0.07, 0.02, 2, 0.006), 0, -wh / 2 - 0.075, 0.01),
  ]);
  const casingMesh = new THREE.Mesh(casing, frameM);
  win.add(casingMesh);
  const sill = rbox(ww + 0.26, 0.03, dpt + 0.07, 0.008, frameM);
  sill.position.set(0, -wh / 2 - 0.015, -dpt / 2 + 0.035);
  win.add(sill);
  scene.add(shadowed(win));
  pane.castShadow = false;
  pane.receiveShadow = false;
  // Sky + scenery outside, far enough to give parallax
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: skyTex(false) }, nightMap: { value: skyTex(true) }, day: { value: 1 }, dusk: { value: 0 }, intensity: { value: 2.2 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), skyMat);
  sky.position.set(hx + 2.4, 1.3, WINDOW.z);
  sky.rotation.y = -Math.PI / 2;
  scene.add(sky);
  // Little plant on the sill
  const potM = mat('#b5653b', 0.8);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.09, 20), potM);
  pot.position.set(hx + 0.02, WINDOW.y - wh / 2 + 0.045, WINDOW.z - 0.45);
  scene.add(shadowed(pot));
  const leafM = mat('#3f7a3a', 0.6, 0, { side: THREE.DoubleSide });
  const lr = rand(5);
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + lr();
    const tilt = 0.4 + lr() * 0.5;
    const leaf = new THREE.SphereGeometry(0.035, 10, 6).scale(0.45, 1.8, 0.12).translate(0, 0.06, 0);
    leaves.push(placed(leaf, 0, 0, 0, tilt, a, 0));
  }
  const plant = new THREE.Mesh(merge(leaves), leafM);
  plant.position.set(pot.position.x, pot.position.y + 0.04, pot.position.z);
  scene.add(shadowed(plant));

  // Curtains + rod
  const curtainSet = fabricSet('#c9b48e', [3, 4]);
  const curtainM = mat('#ffffff', 0.92, 0, { map: curtainSet.map, normalMap: curtainSet.normal, side: THREE.DoubleSide });
  const rodY = wh / 2 + 0.17;
  const curtainH = rodY - (-wh / 2 - 0.12);
  for (const side of [-1, 1]) {
    const c = new THREE.Mesh(curtainGeo(0.42, curtainH, 4, side + 5), curtainM);
    c.position.set(side * (ww / 2 + 0.06), rodY - curtainH / 2 - 0.02, 0.05);
    win.add(c);
    c.castShadow = true;
    c.receiveShadow = true;
  }
  const metal = mat('#3a3631', 0.35, 0.8);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ww + 0.5, 12), metal);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, rodY, 0.09);
  win.add(shadowed(rod));
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), metal);
    fin.position.set(side * (ww / 2 + 0.26), rodY, 0.09);
    win.add(fin);
  }

  // Radiator under the window
  const radM = mat('#f3f1ea', 0.35, 0.1);
  const fins: THREE.BufferGeometry[] = [];
  const nFins = 14;
  for (let i = 0; i < nFins; i++) fins.push(placed(new RoundedBoxGeometry(0.05, 0.5, 0.065, 2, 0.015), -0.455 + i * 0.07, 0, 0));
  fins.push(placed(new THREE.CylinderGeometry(0.018, 0.018, 0.99, 10), 0, 0.2, 0, 0, 0, Math.PI / 2));
  fins.push(placed(new THREE.CylinderGeometry(0.018, 0.018, 0.99, 10), 0, -0.2, 0, 0, 0, Math.PI / 2));
  fins.push(placed(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10), 0.5, -0.32, 0));
  fins.push(placed(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), 0.5, -0.24, 0));
  const radiator = new THREE.Mesh(merge(fins), radM);
  radiator.position.set(hx - 0.075, 0.42, WINDOW.z);
  radiator.rotation.y = -Math.PI / 2;
  scene.add(shadowed(radiator));
  phys.staticBox({ x: 0.04, y: 0.27, z: 0.5 }, { x: hx - 0.075, y: 0.42, z: WINDOW.z });

  // ------------------------------------------------------------ rug with fringe
  const rugM = mat('#ffffff', 1, 0, { map: rug(), normalMap: fabricSet('#808080', [18, 13]).normal, normalScale: new THREE.Vector2(0.5, 0.5) });
  const rugMesh = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.012, 1.6, 2, 0.005), rugM);
  rugMesh.position.set(0.3, 0.0, 0.4);
  rugMesh.receiveShadow = true;
  scene.add(rugMesh);
  const fringeM = mat('#ffffff', 1, 0, { map: fringeTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.07), fringeM);
    f.rotation.x = -Math.PI / 2;
    f.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    f.position.set(0.3 + side * (1.1 + 0.033), 0.004, 0.4);
    f.receiveShadow = true;
    scene.add(f);
  }

  // ------------------------------------------------------------ bed (static)
  const bed = new THREE.Group();
  const walnut = woodGrain([24, 40, 28], 9, [1, 1]);
  const frameW = mat('#ffffff', 0.55, 0, { map: walnut.map, normalMap: walnut.normal, normalScale: new THREE.Vector2(0.4, 0.4) });
  const sideRail = merge([
    placed(new RoundedBoxGeometry(0.05, 0.2, 2.0, 2, 0.01), -0.5, 0.2, 0),
    placed(new RoundedBoxGeometry(0.05, 0.2, 2.0, 2, 0.01), 0.5, 0.2, 0),
    placed(new RoundedBoxGeometry(1.05, 0.2, 0.05, 2, 0.01), 0, 0.2, 0.99),
    placed(new RoundedBoxGeometry(1.0, 0.04, 1.96, 2, 0.01), 0, 0.28, 0),
  ]);
  bed.add(new THREE.Mesh(sideRail, frameW));
  for (const [x, z] of [[-0.5, -0.98], [0.5, -0.98], [-0.5, 0.98], [0.5, 0.98]] as const) {
    const leg = rbox(0.06, 0.12, 0.06, 0.01, frameW);
    leg.position.set(x, 0.06, z);
    bed.add(leg);
  }
  const headboard = merge([
    placed(new RoundedBoxGeometry(1.1, 0.06, 0.07, 2, 0.02), 0, 0.92, -1.0),
    placed(new RoundedBoxGeometry(0.07, 0.95, 0.07, 2, 0.02), -0.53, 0.47, -1.0),
    placed(new RoundedBoxGeometry(0.07, 0.95, 0.07, 2, 0.02), 0.53, 0.47, -1.0),
    placed(new RoundedBoxGeometry(1.0, 0.38, 0.03, 2, 0.01), 0, 0.68, -1.0),
  ]);
  bed.add(new THREE.Mesh(headboard, frameW));
  const footboard = merge([
    placed(new RoundedBoxGeometry(1.1, 0.05, 0.06, 2, 0.02), 0, 0.5, 1.01),
    placed(new RoundedBoxGeometry(0.06, 0.52, 0.06, 2, 0.02), -0.53, 0.26, 1.01),
    placed(new RoundedBoxGeometry(0.06, 0.52, 0.06, 2, 0.02), 0.53, 0.26, 1.01),
  ]);
  bed.add(new THREE.Mesh(footboard, frameW));
  const sheet = fabricSet('#efece4', [4, 6]);
  const mattress = rbox(0.95, 0.18, 1.92, 0.06, mat('#ffffff', 0.9, 0, { map: sheet.map, normalMap: sheet.normal }));
  mattress.position.y = 0.39;
  bed.add(mattress);
  const blanketSet = fabricSet('#3c5a8a', [5, 6]);
  const blanketM = mat('#ffffff', 0.95, 0, { map: blanketSet.map, normalMap: blanketSet.normal, side: THREE.DoubleSide });
  const blanket = new THREE.Mesh(blanketGeo(0.97, 1.32, 0.2, 0.18), blanketM);
  blanket.position.set(0, 0.495, -0.34);
  bed.add(blanket);
  const turn = rbox(0.99, 0.035, 0.16, 0.016, mat('#ffffff', 0.9, 0, { map: sheet.map, normalMap: sheet.normal }));
  turn.position.set(0, 0.5, -0.33);
  turn.rotation.x = 0.05;
  bed.add(turn);
  const pillowM = mat('#ffffff', 0.92, 0, { map: sheet.map, normalMap: sheet.normal });
  const pillow = new THREE.Mesh(pillowGeo(0.62, 0.16, 0.36), pillowM);
  pillow.position.set(0, 0.55, -0.72);
  pillow.rotation.x = -0.25;
  bed.add(pillow);
  const throwSet = fabricSet('#c4703c', [1, 1]);
  const throwPillow = new THREE.Mesh(pillowGeo(0.36, 0.13, 0.36), mat('#ffffff', 0.95, 0, { map: throwSet.map, normalMap: throwSet.normal }));
  throwPillow.position.set(0.18, 0.6, -0.6);
  throwPillow.rotation.set(-0.9, 0.3, 0.1);
  bed.add(throwPillow);
  bed.position.set(-hx + 0.55, 0, 0.9);
  scene.add(shadowed(bed));
  phys.staticBox({ x: 0.5, y: 0.25, z: 1.0 }, { x: -hx + 0.55, y: 0.25, z: 0.9 });

  // ------------------------------------------------------------ desk (dynamic, heavy, can be shoved)
  const deskTopY = 0.76;
  const oak = woodGrain([33, 45, 50], 13, [1, 1]);
  const deskMat = mat('#ffffff', 0.45, 0, { map: oak.map, normalMap: oak.normal, normalScale: new THREE.Vector2(0.3, 0.3) });
  const desk = new THREE.Group();
  const top = rbox(1.6, 0.045, 0.72, 0.01, deskMat);
  top.position.y = deskTopY;
  top.name = 'desk-top';
  desk.add(top);
  const legM = mat('#26272a', 0.38, 0.7);
  for (const [x, z] of [[-0.75, -0.31], [0.75, -0.31], [-0.75, 0.31], [0.75, 0.31]] as const) {
    const leg = rbox(0.045, deskTopY, 0.045, 0.01, legM);
    leg.position.set(x, deskTopY / 2, z);
    desk.add(leg);
  }
  const rails = merge([placed(new THREE.BoxGeometry(1.46, 0.05, 0.02), 0, deskTopY - 0.06, -0.31), placed(new THREE.BoxGeometry(0.02, 0.05, 0.58), -0.75, deskTopY - 0.06, 0), placed(new THREE.BoxGeometry(0.02, 0.05, 0.58), 0.75, deskTopY - 0.06, 0)]);
  desk.add(new THREE.Mesh(rails, legM));
  // pencil drawer
  const drawerM = mat('#ffffff', 0.5, 0, { map: oak.map, normalMap: oak.normal });
  const drawer = rbox(0.5, 0.08, 0.6, 0.006, drawerM);
  drawer.position.set(0.42, deskTopY - 0.0225 - 0.042, 0.0);
  desk.add(drawer);
  const handle = rbox(0.14, 0.012, 0.016, 0.005, mat('#b9b9b9', 0.25, 1));
  handle.position.set(0.42, deskTopY - 0.065, 0.305);
  desk.add(handle);
  scene.add(shadowed(desk));
  const deskBody = phys.createBody({ pos: { x: 0, y: 0, z: -hz + 0.42 }, angularDamping: 2, linearDamping: 1.5 });
  phys.addCollider(deskBody, R.ColliderDesc.cuboid(0.8, 0.0225, 0.36).setTranslation(0, deskTopY, 0), { density: 220, friction: 0.9 });
  for (const [x, z] of [[-0.75, -0.31], [0.75, -0.31], [-0.75, 0.31], [0.75, 0.31]] as const)
    phys.addCollider(deskBody, R.ColliderDesc.cuboid(0.0225, deskTopY / 2, 0.0225).setTranslation(x, deskTopY / 2, z), { density: 800, friction: 1 });
  const deskObj = phys.track(desk, deskBody, 'desk', 'desk', { restitution: 0.05, friction: 0.9, density: 220 });

  // ------------------------------------------------------------ crusty main monitor (dynamic)
  const mon = buildMonitor(0.52, 0.36, true);
  scene.add(mon.group);
  const monBody = phys.createBody({ pos: { x: -0.1, y: deskTopY + 0.03, z: -hz + 0.42 }, angularDamping: 0.6 });
  phys.addCollider(monBody, R.ColliderDesc.cuboid(0.16, 0.01, 0.11).setTranslation(0, 0.01, -0.04), { density: 2000, friction: 0.9 });
  phys.addCollider(monBody, R.ColliderDesc.cuboid(mon.half.x, 0.21, 0.16).setTranslation(0, 0.16 + 0.18, -0.13), { density: 150, friction: 0.7 });
  const monitor = phys.track(mon.group, monBody, 'monitor', 'pc', { restitution: 0.1, friction: 0.8, density: 150 });
  // Sticky note on the bezel
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), mat('#ffffff', 0.9, 0, { map: labelTex('Rent due.\n-Mom', '#fff59d', '#333', 256, 256, 44) }));
  note.material.userData.noSkin = true;
  note.position.set(0.3, 0.5, 0.0515);
  note.rotation.z = -0.12;
  mon.group.add(note);

  // ------------------------------------------------------------ PC tower on the floor (coins come out of here)
  const pcPl = crustyPlastic();
  const towerMat = mat('#f2eee2', 0.6, 0, { map: pcPl.map, roughnessMap: pcPl.rough });
  const dark = mat('#1d1d1b', 0.5);
  dark.userData.noSkin = true;
  const tower = new THREE.Group();
  const case_ = rbox(0.2, 0.42, 0.44, 0.012, towerMat);
  case_.position.y = 0.21;
  tower.add(case_);
  const faceplate = rbox(0.196, 0.41, 0.02, 0.008, towerMat);
  faceplate.position.set(0, 0.21, 0.214);
  tower.add(faceplate);
  const bayParts: THREE.BufferGeometry[] = [];
  // two 5.25" bays (CD-ROM + blank) and a 3.5" floppy
  bayParts.push(placed(new RoundedBoxGeometry(0.16, 0.042, 0.006, 1, 0.002), 0, 0.37, 0.225));
  bayParts.push(placed(new RoundedBoxGeometry(0.16, 0.042, 0.006, 1, 0.002), 0, 0.322, 0.225));
  bayParts.push(placed(new RoundedBoxGeometry(0.1, 0.026, 0.006, 1, 0.002), 0, 0.27, 0.225));
  const bays = new THREE.Mesh(merge(bayParts), mat('#e5dfcd', 0.55));
  tower.add(bays);
  const slits: THREE.BufferGeometry[] = [];
  slits.push(placed(new THREE.BoxGeometry(0.13, 0.003, 0.004), 0, 0.362, 0.228));
  slits.push(placed(new THREE.BoxGeometry(0.012, 0.006, 0.004), 0.06, 0.358, 0.229));
  slits.push(placed(new THREE.BoxGeometry(0.08, 0.004, 0.004), 0, 0.274, 0.228));
  // front vent grille
  for (let i = 0; i < 7; i++) slits.push(placed(new THREE.BoxGeometry(0.12, 0.004, 0.004), 0, 0.05 + i * 0.012, 0.225));
  tower.add(new THREE.Mesh(merge(slits), dark));
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.01), dark);
  slot.position.set(0, 0.3, 0.2265);
  slot.scale.set(0.7, 0.3, 1);
  tower.add(slot);
  const power = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 20), mat('#cfc8b2', 0.5));
  power.rotation.x = Math.PI / 2;
  power.position.set(0, 0.19, 0.226);
  tower.add(power);
  const ledG = mat('#0a200d', 0.3, 0, { emissive: '#39ff6a', emissiveIntensity: 5 });
  const ledA = mat('#201405', 0.3, 0, { emissive: '#ffae2b', emissiveIntensity: 5 });
  ledG.userData.noSkin = true;
  ledA.userData.noSkin = true;
  const led = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 10), ledG);
  led.rotation.x = Math.PI / 2;
  led.position.set(0.05, 0.19, 0.225);
  tower.add(led);
  const hdd = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 10), ledA);
  hdd.rotation.x = Math.PI / 2;
  hdd.position.set(0.065, 0.19, 0.225);
  tower.add(hdd);
  const pcBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.014), mat('#ffffff', 0.4, 0.3, { map: labelTex('CRUSTCO 486', '#8f8a78', '#e8e2cc', 256, 60, 30) }));
  pcBadge.position.set(0, 0.13, 0.2245);
  tower.add(pcBadge);
  // rear fan grille
  const fanGrille = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.045, 24, 3), dark);
  fanGrille.position.set(0, 0.32, -0.2205);
  fanGrille.rotation.y = Math.PI;
  tower.add(fanGrille);
  scene.add(shadowed(tower));
  const towerBody = phys.createBody({ pos: { x: 0.95, y: 0, z: -hz + 0.35 }, angularDamping: 0.5 });
  phys.addCollider(towerBody, R.ColliderDesc.cuboid(0.1, 0.21, 0.22).setTranslation(0, 0.21, 0), { density: 120 });
  const pc = phys.track(tower, towerBody, 'pc', 'pc', { restitution: 0.1, friction: 0.8, density: 120 });

  // ------------------------------------------------------------ cables
  const cableM = mat('#1c1c1c', 0.55);
  cableM.userData.noSkin = true;
  const vgaM = mat('#bdb59d', 0.6);
  vgaM.userData.noSkin = true;
  const outletAnchor = new THREE.Object3D();
  outletAnchor.position.set(1.35, 0.3, -hz + 0.01);
  scene.add(outletAnchor);
  const cables = [
    new Cable(mon.group, new THREE.Vector3(0.05, 0.28, -0.3), tower, new THREE.Vector3(-0.03, 0.34, -0.22), vgaM, 0.0065),
    new Cable(outletAnchor, new THREE.Vector3(0, 0, 0.01), tower, new THREE.Vector3(0.04, 0.38, -0.22), cableM, 0.005),
    new Cable(outletAnchor, new THREE.Vector3(0.02, -0.06, 0.01), mon.group, new THREE.Vector3(-0.08, 0.24, -0.29), cableM, 0.005),
  ];
  for (const c of cables) scene.add(c.mesh);

  // ------------------------------------------------------------ office chair (dynamic)
  const chair = new THREE.Group();
  const seatSet = fabricSet('#2b2b33', [2, 2]);
  const seatM = mat('#ffffff', 0.85, 0, { map: seatSet.map, normalMap: seatSet.normal });
  const seat = rbox(0.48, 0.08, 0.46, 0.035, seatM);
  seat.position.y = 0.48;
  chair.add(seat);
  const back = rbox(0.46, 0.55, 0.07, 0.035, seatM);
  back.position.set(0, 0.8, 0.22);
  back.rotation.x = 0.08;
  chair.add(back);
  const plastic = mat('#1e1f22', 0.45, 0.1);
  const chrome = mat('#c8c8cc', 0.18, 1);
  const shell2 = rbox(0.44, 0.03, 0.42, 0.012, plastic);
  shell2.position.y = 0.43;
  chair.add(shell2);
  const spine = rbox(0.06, 0.32, 0.03, 0.01, plastic);
  spine.position.set(0, 0.55, 0.25);
  spine.rotation.x = -0.25;
  chair.add(spine);
  for (const side of [-1, 1]) {
    const post = rbox(0.03, 0.18, 0.03, 0.01, plastic);
    post.position.set(side * 0.24, 0.56, 0.02);
    chair.add(post);
    const pad = rbox(0.06, 0.025, 0.24, 0.01, plastic);
    pad.position.set(side * 0.24, 0.66, 0.0);
    chair.add(pad);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 16), chrome);
  pole.position.y = 0.27;
  chair.add(pole);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.16, 16), plastic);
  sleeve.position.y = 0.15;
  chair.add(sleeve);
  const baseParts: THREE.BufferGeometry[] = [];
  const casterParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    baseParts.push(placed(new RoundedBoxGeometry(0.28, 0.035, 0.045, 2, 0.012), Math.cos(a) * 0.14, 0.085, Math.sin(a) * 0.14, 0, -a, -0.12));
    casterParts.push(placed(new THREE.SphereGeometry(0.028, 12, 8).scale(0.7, 1, 1), Math.cos(a) * 0.28, 0.048, Math.sin(a) * 0.28, 0, -a, 0));
  }
  chair.add(new THREE.Mesh(merge(baseParts), plastic));
  chair.add(new THREE.Mesh(merge(casterParts), mat('#111214', 0.4)));
  scene.add(shadowed(chair));
  const chairBody = phys.createBody({ pos: { x: -0.1, y: 0, z: -hz + 1.15 }, angularDamping: 0.8 });
  phys.addCollider(chairBody, R.ColliderDesc.cylinder(0.02, 0.3).setTranslation(0, 0.04, 0), { density: 600, friction: 0.5 });
  phys.addCollider(chairBody, R.ColliderDesc.cuboid(0.24, 0.04, 0.23).setTranslation(0, 0.48, 0), { density: 200 });
  phys.addCollider(chairBody, R.ColliderDesc.cuboid(0.23, 0.27, 0.035).setTranslation(0, 0.8, 0.22), { density: 150 });
  phys.addCollider(chairBody, R.ColliderDesc.cylinder(0.2, 0.025).setTranslation(0, 0.24, 0), { density: 300 });
  const chairObj = phys.track(chair, chairBody, 'chair', 'props', { restitution: 0.1, friction: 0.5, density: 200 });

  // ------------------------------------------------------------ door (hinged, opens to the garage) + frame + teaser sign
  const doorM = mat('#ece6d8', 0.42);
  const doorPivot = new THREE.Group();
  doorPivot.name = 'bedroom-door';
  doorPivot.position.set(dl, 0, hz - 0.03);
  scene.add(doorPivot);
  const door = rbox(0.9, 2.05, 0.05, 0.01, doorM);
  door.position.set(DOOR.w / 2, 1.025, 0);
  doorPivot.add(shadowed(door));
  const panels: THREE.BufferGeometry[] = [];
  for (const [py, ph] of [[1.55, 0.7], [0.55, 0.75]] as const)
    for (const px of [-0.2, 0.2]) panels.push(placed(new RoundedBoxGeometry(0.3, ph, 0.012, 2, 0.005), DOOR.w / 2 + px, py, -0.028));
  doorPivot.add(shadowed(new THREE.Mesh(merge(panels), doorM)));
  const doorCasing = merge([
    placed(new RoundedBoxGeometry(0.08, 2.12, 0.025, 2, 0.006), DOOR.x - 0.49, 1.06, hz - 0.012),
    placed(new RoundedBoxGeometry(0.08, 2.12, 0.025, 2, 0.006), DOOR.x + 0.49, 1.06, hz - 0.012),
    placed(new RoundedBoxGeometry(1.06, 0.09, 0.025, 2, 0.006), DOOR.x, 2.13, hz - 0.012),
  ]);
  scene.add(shadowed(new THREE.Mesh(doorCasing, trimM)));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), mat('#c9a24a', 0.25, 1));
  knob.position.set(0.8, 1.0, -0.055);
  doorPivot.add(knob);
  const garageSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), mat('#ffffff', 0.8, 0, { map: labelTex('GARAGE →\n🔒 Key needed', '#ffeb3b', '#222', 512, 320, 54) }));
  garageSign.position.set(DOOR.w / 2, 1.55, -0.036);
  garageSign.rotation.y = Math.PI;
  doorPivot.add(garageSign);

  // Light switch + power outlet
  const plateM = mat('#f6f4ee', 0.35);
  const switchPlate = rbox(0.075, 0.12, 0.008, 0.003, plateM);
  switchPlate.position.set(1.0, 1.15, hz - 0.004);
  scene.add(switchPlate);
  const toggle = rbox(0.016, 0.03, 0.014, 0.004, plateM);
  toggle.position.set(1.0, 1.155, hz - 0.012);
  toggle.rotation.x = 0.25;
  scene.add(toggle);
  const outlet = rbox(0.075, 0.12, 0.008, 0.003, plateM);
  outlet.position.set(1.35, 0.3, -hz + 0.004);
  scene.add(outlet);
  const holes: THREE.BufferGeometry[] = [];
  for (const oy of [0.325, 0.27]) {
    holes.push(placed(new THREE.CircleGeometry(0.004, 8), 1.343, oy, -hz + 0.0085));
    holes.push(placed(new THREE.CircleGeometry(0.004, 8), 1.357, oy, -hz + 0.0085));
  }
  scene.add(new THREE.Mesh(merge(holes), dark));

  // ------------------------------------------------------------ poster, shelf, clock (static)
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), mat('#ffffff', 0.7, 0, { map: posterTex('GRIND', '#1d3557', '#ffd166') }));
  poster.position.set(-1.2, 1.7, -hz + 0.013);
  scene.add(poster);
  const pframe = rbox(0.54, 0.74, 0.015, 0.004, mat('#18181a', 0.45));
  pframe.position.set(-1.2, 1.7, -hz + 0.004);
  scene.add(shadowed(pframe));
  const shelfWood = woodGrain([30, 30, 70], 17);
  const shelf = rbox(0.9, 0.03, 0.22, 0.005, mat('#ffffff', 0.5, 0, { map: shelfWood.map, normalMap: shelfWood.normal }));
  shelf.position.set(1.2, 1.5, -hz + 0.11);
  scene.add(shadowed(shelf));
  for (const bx of [0.85, 1.55]) {
    const bracket = merge([placed(new THREE.BoxGeometry(0.02, 0.16, 0.012), bx, 1.405, -hz + 0.006), placed(new THREE.BoxGeometry(0.02, 0.012, 0.18), bx, 1.479, -hz + 0.09)]);
    scene.add(shadowed(new THREE.Mesh(bracket, metal)));
  }
  phys.staticBox({ x: 0.45, y: 0.015, z: 0.11 }, { x: 1.2, y: 1.5, z: -hz + 0.11 });
  const books = ['#a23b3b', '#3b6aa2', '#e0b040', '#4b8b4b', '#7a4ba2', '#d6cdb4'];
  const br = rand(77);
  books.forEach((c, i) => {
    const bh = 0.2 + br() * 0.06;
    const b = rbox(0.035 + br() * 0.015, bh, 0.15 + br() * 0.03, 0.004, mat(c, 0.75));
    const lean = i === books.length - 1 ? -0.35 : 0;
    b.position.set(0.82 + i * 0.048 + (lean ? 0.03 : 0), 1.515 + bh / 2 - (lean ? 0.012 : 0), -hz + 0.11);
    b.rotation.z = lean;
    scene.add(shadowed(b));
  });
  // Wall clock showing the real time
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), mat('#ffffff', 0.5, 0, { map: clockFace() }));
  clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.009, 10, 48), mat('#5a3d26', 0.45, 0.1));
  clock.add(rim);
  const handM = mat('#1a1a1a', 0.4);
  const mkHand = (len: number, w: number, z: number, m: THREE.Material) => {
    const p = new THREE.Group();
    const hnd = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.003), m);
    hnd.position.y = len / 2 - 0.015;
    p.add(hnd);
    p.position.z = z;
    clock.add(p);
    return p;
  };
  const hourH = mkHand(0.08, 0.012, 0.006, handM);
  const minH = mkHand(0.12, 0.008, 0.01, handM);
  const secH = mkHand(0.13, 0.003, 0.014, mat('#b3261e', 0.4));
  clock.position.set(-1.3, 1.95, hz - 0.02);
  clock.rotation.y = Math.PI;
  scene.add(shadowed(clock));

  let clockT = 1;
  const blinkT = { t: 0 };
  return {
    desk: deskObj,
    pc,
    monitor,
    chair: chairObj,
    screen: { mesh: mon.screen, obj: monitor, w: 0.52, h: 0.36 },
    garageSign,
    door: doorPivot,
    deskTopY,
    sky: skyMat,
    glass,
    update(dt: number) {
      for (const c of cables) c.update();
      clockT += dt;
      if (clockT >= 0.25) {
        clockT = 0;
        const d = new Date();
        const s = d.getSeconds() + d.getMilliseconds() / 1000;
        const m = d.getMinutes() + s / 60;
        const hr = (d.getHours() % 12) + m / 60;
        secH.rotation.z = -(s / 60) * Math.PI * 2;
        minH.rotation.z = -(m / 60) * Math.PI * 2;
        hourH.rotation.z = -(hr / 12) * Math.PI * 2;
      }
      // HDD activity flicker
      blinkT.t -= dt;
      if (blinkT.t <= 0) {
        blinkT.t = 0.05 + Math.random() * 0.4;
        ledA.emissiveIntensity = Math.random() < 0.5 ? 0.3 : 5;
      }
    },
  };
}
