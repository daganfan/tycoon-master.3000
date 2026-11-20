import * as THREE from 'three';
import type { Physics, PhysObj } from '../physics';
import { ROOM, shadowed } from '../room';
import { decorById, DECOR_PREFIX } from '@/content/decor';
import { DECOR_RECIPES } from './recipes';
import { GEAR_RECIPES } from './gear';
import { lightAvailable, registerDecor } from './runtime';
import type { DecorSpotKind, Recipe } from './types';

/**
 * Data-driven prop factory: builds a recipe, derives a collider from its
 * bounding box, picks a free spawn spot (desk / shelf / floor / wall, with a
 * random-scatter fallback) and registers its behaviours.
 */

export interface RecipeProp {
  obj: PhysObj;
  light?: THREE.PointLight;
}

export function recipeFor(prop: string): Recipe | undefined {
  if (prop.startsWith(DECOR_PREFIX)) return DECOR_RECIPES[prop.slice(DECOR_PREFIX.length)];
  return GEAR_RECIPES[prop];
}

export function hasRecipe(prop: string): boolean {
  return !!recipeFor(prop);
}

/** Build just the model (no physics). Used by tests and previews. */
export function buildModel(recipe: Recipe, variant = 0): { group: THREE.Group; fx: ReturnType<Recipe['build']>; box: THREE.Box3 } {
  const group = new THREE.Group();
  const fx = recipe.build(group, variant);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  return { group, fx, box };
}

const footprint = new WeakMap<PhysObj, number>();

interface Spot {
  pos: THREE.Vector3;
  rotY: number;
  wall?: boolean;
}

const { hx, hz } = ROOM;

/* Desk-relative spots (x, z offsets from the desk body origin). */
const DESK_SPOTS: [number, number][] = [
  [-0.7, 0.25], [0.7, 0.25], [-0.72, -0.2], [0.72, -0.22], [0.38, -0.24], [-0.48, -0.24], [0.42, 0.24], [-0.45, 0.24],
  [0.2, 0.27], [0.58, 0.02], [-0.6, 0.02], [0.25, -0.05], [-0.4, 0.05],
];
const SHELF_SPOTS: [number, number][] = [[1.13, -hz + 0.11], [1.27, -hz + 0.11], [1.42, -hz + 0.11], [1.57, -hz + 0.11]];
const SHELF_Y = 1.515;
const FLOOR_SPOTS: [number, number][] = [
  [-1.3, -2.15], [-1.65, -2.2], [1.55, -2.15], [2.0, -2.15], [-2.65, -1.7], [-2.65, -1.15], [-2.2, -0.45],
  [2.65, -0.75], [2.65, 0.6], [2.65, 1.05], [-1.5, 2.15], [-0.9, 2.2], [-0.3, 2.2], [0.3, 2.15], [1.0, 2.1],
  [-1.2, 0.6], [1.5, 0.4], [-1.0, -0.6], [1.4, -0.8], [1.9, 1.2], [-0.6, 1.4], [0.9, 1.4], [2.1, -1.6], [-1.6, -1.3],
];
/* Wall spots: [x, y, z, rotY] (model faces +Z, so rotY turns it to face the room). */
const WALL_SPOTS: [number, number, number, number][] = [
  [-2.35, 1.6, -hz, 0], [-1.85, 1.95, -hz, 0], [-0.6, 1.95, -hz, 0], [0.6, 1.95, -hz, 0], [2.3, 1.65, -hz, 0], [1.2, 2.1, -hz, 0],
  [-hx, 1.45, 0.35, Math.PI / 2], [-hx, 1.45, 1.4, Math.PI / 2], [-hx, 1.6, -2.0, Math.PI / 2], [-hx, 1.7, -0.6, Math.PI / 2],
  [-2.2, 1.6, hz, Math.PI], [-1.3, 1.6, hz, Math.PI], [0.45, 1.6, hz, Math.PI], [2.55, 1.6, hz, Math.PI],
  [hx, 1.75, -2.0, -Math.PI / 2], [hx, 1.8, -0.75, -Math.PI / 2], [hx, 1.7, 1.9, -Math.PI / 2], [-hx, 2.15, 0.9, Math.PI / 2],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function free(phys: Physics, p: THREE.Vector3, r: number, height: number, reserved: THREE.Vector3[], ignoreReserved = false, pad = 0.18): boolean {
  for (const o of phys.objs) {
    if (o.kind === 'desk' || o.kind === 'avatar') continue;
    const t = o.body.translation();
    if (t.y > p.y + height + 0.05 || t.y < p.y - 0.45) continue;
    const or = footprint.get(o) ?? 0.15;
    if (Math.hypot(t.x - p.x, t.z - p.z) < r + or) return false;
  }
  if (!ignoreReserved) for (const q of reserved) if (Math.abs(q.y - p.y) < 0.5 && Math.hypot(q.x - p.x, q.z - p.z) < r + pad) return false;
  return true;
}

function deskFrame(phys: Physics): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const d = phys.objs.find((o) => o.kind === 'desk');
  if (!d) return { pos: new THREE.Vector3(0, 0, -hz + 0.42), quat: new THREE.Quaternion() };
  const t = d.body.translation();
  const q = d.body.rotation();
  return { pos: new THREE.Vector3(t.x, t.y, t.z), quat: new THREE.Quaternion(q.x, q.y, q.z, q.w) };
}

function rotated<T>(arr: T[], k: number): T[] {
  const n = arr.length;
  return arr.map((_, i) => arr[(i + k) % n]!);
}

function chooseSpot(phys: Physics, kind: DecorSpotKind, key: string, size: THREE.Vector3, deskY: number, reserved: THREE.Vector3[]): Spot {
  const r = Math.max(size.x, size.z) / 2;
  const h = hash(key);
  const order: DecorSpotKind[] = kind === 'wall' ? ['wall', 'floor'] : kind === 'desk' ? ['desk', 'shelf', 'floor'] : kind === 'shelf' ? ['shelf', 'desk', 'floor'] : ['floor'];
  const small = size.y < 0.4 && size.x < 0.26 && size.z < 0.22;
  const deskOk = size.y < 0.6 && size.x < 0.5 && size.z < 0.4;
  for (const k of order) {
    if (k === 'desk' && deskOk) {
      const { pos, quat } = deskFrame(phys);
      const yaw = new THREE.Euler().setFromQuaternion(quat, 'YXZ').y;
      for (const [x, z] of rotated(DESK_SPOTS, h % DESK_SPOTS.length)) {
        const p = new THREE.Vector3(x, 0, z).applyQuaternion(quat).add(pos);
        p.y = pos.y + deskY + 0.023;
        if (free(phys, p, r, size.y, reserved)) return { pos: p, rotY: yaw + ((h % 7) - 3) * 0.12 };
      }
    }
    if (k === 'shelf' && small) {
      for (const [x, z] of SHELF_SPOTS) {
        const p = new THREE.Vector3(x, SHELF_Y, z + Math.max(0, size.z / 2 - 0.1));
        if (free(phys, p, Math.min(r, 0.07), size.y, reserved, false, 0.04)) return { pos: p, rotY: 0 };
      }
    }
    if (k === 'wall') {
      for (const [x, y, z, ry] of rotated(WALL_SPOTS, h % WALL_SPOTS.length)) {
        const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        const p = new THREE.Vector3(x, y - size.y / 2, z).addScaledVector(n, 0.004);
        let ok = true;
        for (const o of phys.objs) {
          const t = o.body.translation();
          if (Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) < Math.max(size.x, size.y) / 2 + (footprint.get(o) ?? 0.15)) ok = false;
        }
        for (const q of reserved) if (Math.hypot(q.x - x, q.y - y, q.z - z) < 0.5) ok = false;
        if (ok) return { pos: p, rotY: ry, wall: true };
      }
    }
    if (k === 'floor') {
      for (const [x, z] of rotated(FLOOR_SPOTS, h % FLOOR_SPOTS.length)) {
        const p = new THREE.Vector3(THREE.MathUtils.clamp(x, -hx + r + 0.05, hx - r - 0.05), 0, THREE.MathUtils.clamp(z, -hz + r + 0.05, hz - r - 0.05));
        if (free(phys, p, r, size.y, reserved)) return { pos: p, rotY: Math.atan2(-p.x, -p.z) * 0.3 + ((h % 5) - 2) * 0.2 };
      }
    }
  }
  // Random scatter: inside the room, away from walls, the bed and the desk.
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() * 2 - 1) * (hx - r - 0.15);
    const z = (Math.random() * 2 - 1) * (hz - r - 0.15);
    if (x - r < -hx + 1.15 && z + r > -0.2 && z - r < 2.0) continue; // bed
    if (Math.abs(x) < 0.9 + r && z - r < -1.6) continue; // desk
    if (x + r > 1.05 && x - r < 2.15 && z + r > 1.7) continue; // door
    const p = new THREE.Vector3(x, 0, z);
    if (free(phys, p, r, size.y, reserved, true)) return { pos: p, rotY: Math.random() * Math.PI * 2 };
  }
  // Room is packed: drop it from above somewhere in the middle and let physics sort it out.
  return { pos: new THREE.Vector3((Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.2) * 2), rotY: Math.random() * Math.PI * 2 };
}

/** Build a recipe prop (decor or gear), add it to the scene and the physics world. */
export function createRecipeProp(prop: string, index: number, scene: THREE.Scene, phys: Physics, deskY: number, reserved: THREE.Vector3[]): RecipeProp | null {
  const recipe = recipeFor(prop);
  if (!recipe) return null;
  const R = phys.R;
  const decor = prop.startsWith(DECOR_PREFIX) ? decorById(prop.slice(DECOR_PREFIX.length)) : undefined;
  const { group, fx, box } = buildModel(recipe, index);
  shadowed(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const kind = decor?.spot ?? recipe.spot ?? 'floor';
  const spot = chooseSpot(phys, kind, `${prop}#${index}`, size, deskY, reserved);
  const pos = spot.pos.clone();
  if (spot.wall) pos.addScaledVector(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), spot.rotY), -box.min.z);
  pos.y += -box.min.y + 0.01;

  const body = phys.createBody({ pos, rot: new THREE.Euler(0, spot.rotY, 0), angularDamping: 0.6, linearDamping: recipe.linearDamping ?? 0.08 });
  const he = { x: Math.max(0.012, size.x / 2), y: Math.max(0.012, size.y / 2), z: Math.max(0.012, size.z / 2) };
  const shape = recipe.collider ?? 'box';
  const desc =
    shape === 'ball'
      ? R.ColliderDesc.ball(Math.max(he.x, he.y, he.z))
      : shape === 'cyl'
        ? R.ColliderDesc.cylinder(he.y, Math.max(he.x, he.z))
        : R.ColliderDesc.cuboid(he.x, he.y, he.z);
  desc.setTranslation(center.x, center.y, center.z);
  if (size.x < 0.08 || size.z < 0.08) body.enableCcd(true);
  const base = { restitution: recipe.restitution ?? 0.2, friction: recipe.friction ?? 0.7, density: recipe.density ?? 400 };
  phys.addCollider(body, desc, base);

  let light: THREE.PointLight | undefined;
  if (recipe.light && lightAvailable()) {
    light = new THREE.PointLight(recipe.light.color, recipe.light.intensity, recipe.light.distance ?? 2, 2);
    light.position.set(0, recipe.light.y, 0.05);
    group.add(light);
  }
  scene.add(group);
  const obj = phys.track(group, body, prop, 'props', base);
  footprint.set(obj, Math.max(0.06, Math.max(size.x, size.z) / 2));
  registerDecor(obj, fx ?? [], { light, stuck: !!spot.wall });
  return { obj, light };
}
