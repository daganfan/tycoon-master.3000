import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics, PhysObj, SurfaceKind } from './physics';
import { ROOM, KEEP_OUT, WALL_SHELVES } from './room';

/**
 * Placement solver: finds a free spot for a new prop on a preferred kind of
 * surface (desk, riser, shelf, ...) by testing its footprint against the
 * axis-aligned boxes of every collider already in the world, then falls back
 * to the floor. The search itself is pure (boxes in, pose out) so it can be
 * unit-tested without Rapier.
 */

/** A rectangular flat area in world space: centre, yaw, half sizes, height of the top and free height above. */
export interface Surface {
  kind: SurfaceKind;
  cx: number;
  cz: number;
  yaw: number;
  hw: number;
  hd: number;
  y: number;
  clear: number;
  /** Body the surface belongs to (its own colliders don't count as obstacles above the top). */
  owner?: number;
}

export interface Spot {
  pos: THREE.Vector3;
  yaw: number;
  surface: Surface;
}

export interface FindOpts {
  /** Deterministic variety: different props start their search in different places. */
  seed?: number;
  /** Gap kept around the footprint (m). */
  margin?: number;
  /** Grid step (m). */
  step?: number;
}

const tmpBox = new THREE.Box3();
const corner = new THREE.Vector3();

/** World AABB of a footprint `size` (x/z, height y) standing at local (lx, lz) on a surface. */
export function footprintBox(s: Surface, lx: number, lz: number, size: THREE.Vector3, yawOff: number, out = new THREE.Box3()): THREE.Box3 {
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const wx = s.cx + lx * c + lz * sn;
  const wz = s.cz - lx * sn + lz * c;
  const yaw = s.yaw + yawOff;
  const ax = Math.abs(Math.cos(yaw)) * (size.x / 2) + Math.abs(Math.sin(yaw)) * (size.z / 2);
  const az = Math.abs(Math.sin(yaw)) * (size.x / 2) + Math.abs(Math.cos(yaw)) * (size.z / 2);
  out.min.set(wx - ax, s.y + 0.004, wz - az);
  out.max.set(wx + ax, s.y + Math.max(0.02, size.y), wz + az);
  return out;
}

/** World AABB of a whole surface plus the free space above it. */
function surfaceBox(s: Surface, out = new THREE.Box3()): THREE.Box3 {
  return footprintBox(s, 0, 0, new THREE.Vector3(s.hw * 2, s.clear, s.hd * 2), 0, out);
}

function frac(n: number): number {
  return n - Math.floor(n);
}

/**
 * Search the surfaces in order for the first spot where `size` fits without
 * touching any occupied box. Returns the bottom-centre position and yaw.
 */
export function findSpot(size: THREE.Vector3, surfaces: Surface[], occupied: THREE.Box3[], o: FindOpts = {}): Spot | null {
  const seed = o.seed ?? 0;
  const m = o.margin ?? 0.025;
  const step = o.step ?? 0.05;
  for (const s of surfaces) {
    if (size.y > s.clear) continue;
    const region = surfaceBox(s);
    const near = occupied.filter((b) => b.intersectsBox(region));
    for (const yawOff of [0, Math.PI / 2]) {
      const sx = (yawOff ? size.z : size.x) + 2 * m;
      const sz = (yawOff ? size.x : size.z) + 2 * m;
      if (sx > s.hw * 2 + 1e-6 || sz > s.hd * 2 + 1e-6) continue;
      const nx = Math.max(1, Math.floor((s.hw * 2 - sx) / step) + 1);
      const nz = Math.max(1, Math.floor((s.hd * 2 - sz) / step) + 1);
      const x0 = -s.hw + sx / 2;
      const z0 = -s.hd + sz / 2;
      // Anchor: floors fill along the walls (edges) first; furniture tops start from a seeded spot.
      const ax = (frac(seed * 0.618034) * 2 - 1) * s.hw * 0.85;
      const az = s.kind === 'floor' ? 0 : (frac(seed * 0.414214) * 2 - 1) * s.hd * 0.5;
      const cands: { x: number; z: number; score: number }[] = [];
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const x = nx === 1 ? 0 : x0 + i * step;
          const z = nz === 1 ? 0 : z0 + j * step;
          const score =
            s.kind === 'floor'
              ? Math.min(s.hw - Math.abs(x), s.hd - Math.abs(z)) + 0.15 * Math.abs(x - ax) / Math.max(0.1, s.hw)
              : Math.abs(x - ax) + Math.abs(z - az) * 0.5;
          cands.push({ x, z, score });
        }
      cands.sort((a, b) => a.score - b.score);
      for (const c of cands) {
        const fb = footprintBox(s, c.x, c.z, new THREE.Vector3(sx, size.y, sz), yawOff, tmpBox);
        if (near.some((b) => b.intersectsBox(fb))) continue;
        const cs = Math.cos(s.yaw);
        const sn = Math.sin(s.yaw);
        return { pos: new THREE.Vector3(s.cx + c.x * cs + c.z * sn, s.y, s.cz - c.x * sn + c.z * cs), yaw: s.yaw + yawOff, surface: s };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ world glue */

/** Preferred surfaces for each placement hint, best first; the floor is always the last resort. */
export const SURFACE_ORDER: Record<string, SurfaceKind[]> = {
  desk: ['desk', 'riser', 'table', 'nightstand', 'dresser', 'shelf', 'floor'],
  monitor: ['riser', 'desk', 'table', 'floor'],
  keyboard: ['desk', 'table', 'floor'],
  shelf: ['shelf', 'riser', 'dresser', 'nightstand', 'desk', 'table', 'floor'],
  floor: ['floor'],
};

/** Yaw of a body around world up. */
function yawOf(q: THREE.Quaternion): number {
  return new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
}

/** Floor regions: the whole floor, filled from the walls inwards (furniture blocks itself out via its colliders). */
export function floorSurfaces(): Surface[] {
  const { x0, x1, z0, z1, h } = ROOM;
  const inset = 0.06;
  return [{ kind: 'floor', cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, yaw: 0, hw: (x1 - x0) / 2 - inset, hd: (z1 - z0) / 2 - inset, y: 0, clear: h - 0.3 }];
}

/** Every surface in the world right now: furniture tops (following their bodies), wall shelves, the floor. */
export function worldSurfaces(phys: Physics): Surface[] {
  const out: Surface[] = [];
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  for (const o of phys.objs) {
    if (!o.tops) continue;
    const r = o.body.rotation();
    q.set(r.x, r.y, r.z, r.w);
    // A toppled desk offers no usable top.
    if (new THREE.Vector3(0, 1, 0).applyQuaternion(q).y < 0.97) continue;
    const t = o.body.translation();
    const yaw = yawOf(q);
    for (const top of o.tops) {
      v.set(top.x, top.y, top.z).applyQuaternion(q).add(t as THREE.Vector3);
      out.push({ kind: top.kind, cx: v.x, cz: v.z, yaw, hw: top.hw, hd: top.hd, y: v.y, clear: top.clear, owner: o.body.handle });
    }
  }
  for (const s of WALL_SHELVES) out.push({ kind: 'shelf', cx: s.x, cz: s.z, yaw: s.yaw, hw: s.w / 2 - 0.02, hd: s.d / 2 - 0.01, y: s.y + 0.015, clear: 0.5 });
  out.push(...floorSurfaces());
  return out;
}

/** Local AABB half extents of a collider shape (null for shapes we don't block on). */
function shapeHalf(c: RAPIER.Collider, R: Physics['R']): THREE.Vector3 | null {
  const t = c.shapeType();
  const S = R.ShapeType;
  if (t === S.Cuboid || t === S.RoundCuboid) {
    const h = c.halfExtents();
    return h ? new THREE.Vector3(h.x, h.y, h.z) : null;
  }
  if (t === S.Ball) {
    const r = c.radius();
    return new THREE.Vector3(r, r, r);
  }
  if (t === S.Capsule) return new THREE.Vector3(c.radius(), c.halfHeight() + c.radius(), c.radius());
  if (t === S.Cylinder || t === S.Cone || t === S.RoundCylinder) return new THREE.Vector3(c.radius(), c.halfHeight(), c.radius());
  return null;
}

/** World AABBs of every solid collider (bodies use their current pose, even before the next physics step). */
export function occupiedBoxes(phys: Physics, skip?: (o: PhysObj | undefined, c: RAPIER.Collider) => boolean): THREE.Box3[] {
  const byHandle = new Map<number, PhysObj>();
  for (const o of phys.objs) byHandle.set(o.body.handle, o);
  const out: THREE.Box3[] = [];
  const q = new THREE.Quaternion();
  const bq = new THREE.Quaternion();
  const p = new THREE.Vector3();
  phys.world.forEachCollider((c) => {
    if (c.isSensor()) return;
    const parent = c.parent();
    const owner = parent ? byHandle.get(parent.handle) : undefined;
    if (owner?.kind === 'avatar') return;
    if (skip?.(owner, c)) return;
    const half = shapeHalf(c, phys.R);
    if (!half) return;
    const local = phys.colliderLocal(c);
    if (parent && local) {
      const bt = parent.translation();
      const br = parent.rotation();
      bq.set(br.x, br.y, br.z, br.w);
      p.copy(local.pos).applyQuaternion(bq).add(bt as THREE.Vector3);
      q.copy(bq).multiply(local.quat);
    } else {
      const t = c.translation();
      const r = c.rotation();
      p.set(t.x, t.y, t.z);
      q.set(r.x, r.y, r.z, r.w);
    }
    const b = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z).applyQuaternion(q).add(p);
      b.expandByPoint(corner);
    }
    out.push(b);
  });
  for (const k of KEEP_OUT) out.push(new THREE.Box3(new THREE.Vector3(k.x0, 0, k.z0), new THREE.Vector3(k.x1, ROOM.h, k.z1)));
  return out;
}

/** Find a free spot in the live world for a prop of `size`, using the surface order for `hint`. */
export function placeInWorld(phys: Physics, hint: string, size: THREE.Vector3, seed: number): Spot {
  const order = SURFACE_ORDER[hint] ?? SURFACE_ORDER.floor!;
  const all = worldSurfaces(phys);
  // Within a kind, shelves at about eye level come first (not the bookcase's bottom shelf).
  const rank = (s: Surface) => (s.kind === 'shelf' ? Math.abs(s.y - 1.3) : 0);
  const surfaces = order.flatMap((k) => all.filter((s) => s.kind === k).sort((a, b) => rank(a) - rank(b)));
  const occupied = occupiedBoxes(phys);
  const spot = findSpot(size, surfaces, occupied, { seed });
  if (spot) return spot;
  // Packed room: stand it on top of whatever is in the middle of the floor and let physics settle it.
  const floor = floorSurfaces()[0]!;
  const x = floor.cx + (frac(seed * 0.7548) * 2 - 1) * 1.5;
  const z = floor.cz + (frac(seed * 0.5698) * 2 - 1) * 1.2;
  let top = 0;
  const col = new THREE.Box3(new THREE.Vector3(x - size.x / 2, 0, z - size.z / 2), new THREE.Vector3(x + size.x / 2, ROOM.h, z + size.z / 2));
  for (const b of occupied) if (b.intersectsBox(col) && b.max.y < ROOM.h - 0.2) top = Math.max(top, b.max.y);
  return { pos: new THREE.Vector3(x, top + 0.02, z), yaw: 0, surface: floor };
}

/** Stable small hash for seeding placement from an id. */
export function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 9973;
}
