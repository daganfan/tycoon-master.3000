import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Tiny modelling kit for procedural decor: PBR material presets and
 * primitive helpers that return positioned meshes. Models are authored with
 * the origin at the bottom centre, +Y up, facing +Z.
 */

type V3 = readonly [number, number, number];
type MatOpts = Partial<THREE.MeshPhysicalMaterialParameters>;

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o);

/** Material presets. Every call returns a fresh material (cosmetics patch them per object). */
export const M = {
  plastic: (color: string, o: MatOpts = {}) => phys({ color, roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, ...o }),
  matte: (color: string, o: MatOpts = {}) => std({ color, roughness: 0.85, metalness: 0, ...o }),
  rubber: (color: string) => std({ color, roughness: 0.55, metalness: 0 }),
  metal: (color: string, roughness = 0.35) => std({ color, roughness, metalness: 1 }),
  chrome: () => std({ color: '#e8eaee', roughness: 0.08, metalness: 1 }),
  gold: (roughness = 0.18) => std({ color: '#f2c14e', roughness, metalness: 1 }),
  brass: () => std({ color: '#c9a24a', roughness: 0.3, metalness: 1 }),
  ceramic: (color: string) => phys({ color, roughness: 0.22, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
  wood: (color = '#8a5a34', roughness = 0.62) => std({ color, roughness, metalness: 0 }),
  fabric: (color: string) => phys({ color, roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4) }),
  paper: (color: string) => std({ color, roughness: 0.9, metalness: 0 }),
  stone: (color: string) => std({ color, roughness: 0.75, metalness: 0, flatShading: false }),
  marble: () => phys({ color: '#f1efe9', roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  leaf: (color = '#3f8f4a') => std({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }),
  glass: (color = '#ffffff', o: MatOpts = {}) => {
    const m = phys({ color, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.01, ior: 1.45, ...o });
    m.userData.noSkin = true;
    return m;
  },
  water: (color = '#6fc3ff') => {
    const m = phys({ color, roughness: 0.08, metalness: 0, transmission: 0.85, thickness: 0.15, ior: 1.33 });
    m.userData.noSkin = true;
    return m;
  },
  glow: (color: string, intensity = 1.6) => {
    const m = std({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0 });
    m.userData.noSkin = true;
    return m;
  },
  screen: (color: string) => {
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    return m;
  },
};

function place<T extends THREE.Object3D>(o: T, pos: V3 = [0, 0, 0], rot?: V3): T {
  o.position.set(pos[0], pos[1], pos[2]);
  if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
  return o;
}

/** Position any object in place and return it. */
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Box with optional rounded corners. Positioned by its centre. */
export function box(w: number, h: number, d: number, m: THREE.Material, pos?: V3, rot?: V3, r = 0): THREE.Mesh {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  return place(new THREE.Mesh(g, m), pos, rot);
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, pos?: V3, rot?: V3, seg = 28, open = false): THREE.Mesh {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m), pos, rot);
}

export function sph(r: number, m: THREE.Material, pos?: V3, scale?: V3, seg = 24): THREE.Mesh {
  const mesh = place(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))), m), pos);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  return mesh;
}

export function cone(r: number, h: number, m: THREE.Material, pos?: V3, rot?: V3, seg = 28): THREE.Mesh {
  return place(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m), pos, rot);
}

export function torus(R: number, t: number, m: THREE.Material, pos?: V3, rot?: V3, arc = Math.PI * 2): THREE.Mesh {
  return place(new THREE.Mesh(new THREE.TorusGeometry(R, t, 12, 40, arc), m), pos, rot);
}

export function capsule(r: number, len: number, m: THREE.Material, pos?: V3, rot?: V3): THREE.Mesh {
  return place(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), m), pos, rot);
}

/** Lathe from [radius, y] pairs (bottom to top). Great for vases, pins and cups. */
export function lathe(pts: [number, number][], m: THREE.Material, pos?: V3, seg = 40): THREE.Mesh {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
  return place(new THREE.Mesh(g, m), pos);
}

/** Smooth tube along a Catmull-Rom path. */
export function tube(pts: V3[], radius: number, m: THREE.Material, seg = 32): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 10, false), m);
}

/** Flat extruded shape from 2D points (x,y), thickness along Z. */
export function slab(pts: [number, number][], depth: number, m: THREE.Material, pos?: V3, rot?: V3, bevel = 0.004): THREE.Mesh {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  return place(new THREE.Mesh(g, m), pos, rot);
}

/** Heart / star / ring style shape helpers for slabs. */
export function heartPts(s: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([(x / 17) * s, (y / 17) * s]);
  }
  return out;
}

export function starPts(outer: number, inner: number, n = 5): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? inner : outer;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** A pivot group (for parts that spin, bob or sway) placed at `pos`. */
export function pivot(pos: V3 = [0, 0, 0], ...children: THREE.Object3D[]): THREE.Group {
  const g = place(new THREE.Group(), pos);
  g.add(...children);
  return g;
}

/** Pair of googly eyes facing +Z. */
export function googly(r: number, gap: number, pos: V3): THREE.Group {
  const g = pivot(pos);
  const white = M.plastic('#ffffff', { roughness: 0.2 });
  const black = M.plastic('#111111', { roughness: 0.2 });
  for (const s of [-1, 1]) {
    g.add(sph(r, white, [s * gap, 0, 0], [1, 1, 0.5], 16));
    g.add(sph(r * 0.5, black, [s * gap + r * 0.15, -r * 0.2, r * 0.38], [1, 1, 0.4], 12));
  }
  return g;
}

/** Simple procedural canvas label, if a DOM canvas exists (skipped in node tests). */
export function labelMap(text: string, bg: string, fg: string, w = 256, h = 128, font = 'bold 64px sans-serif'): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * h * 0.4));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
