import * as THREE from 'three';
import type { Physics, PhysObj } from '../physics';
import { ROOM, shadowed } from '../room';
import { hashId, occupiedBoxes, placeInWorld } from '../placement';
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

interface Spot {
  pos: THREE.Vector3;
  rotY: number;
  wall?: boolean;
}

const { x0, x1, z0, z1 } = ROOM;

/* Wall spots: [x, y, z, rotY] (model faces +Z, so rotY turns it to face the room). */
const WALL_SPOTS: [number, number, number, number][] = [
  [0.95, 2.0, z0, 0], [-3.0, 1.75, z0, 0], [2.95, 1.75, z0, 0], [1.75, 2.2, z0, 0],
  [x0, 1.5, -0.9, Math.PI / 2], [x0, 1.65, -3.1, Math.PI / 2], [x0, 2.15, 1.3, Math.PI / 2], [x0, 1.5, 0.35, Math.PI / 2],
  [-3.6, 1.6, z1, Math.PI], [-1.7, 1.75, z1, Math.PI], [0.25, 1.7, z1, Math.PI], [2.9, 1.6, z1, Math.PI],
  [x1, 1.7, 1.2, -Math.PI / 2], [x1, 1.65, 0.35, -Math.PI / 2], [x1, 2.05, -3.0, -Math.PI / 2], [x1, 1.7, -2.15, -Math.PI / 2],
];

function rotated<T>(arr: T[], k: number): T[] {
  const n = arr.length;
  return arr.map((_, i) => arr[(i + k) % n]!);
}

function chooseSpot(phys: Physics, kind: DecorSpotKind, key: string, size: THREE.Vector3, reserved: THREE.Vector3[]): Spot {
  const seed = hashId(key);
  const deskOk = size.y < 0.6 && size.x < 0.6 && size.z < 0.45;
  if (kind === 'wall') {
    const occupied = occupiedBoxes(phys);
    for (const [x, y, z, ry] of rotated(WALL_SPOTS, seed % WALL_SPOTS.length)) {
      if (reserved.some((q) => Math.hypot(q.x - x, q.y - y, q.z - z) < 0.6)) continue;
      const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      const p = new THREE.Vector3(x, y - size.y / 2, z).addScaledVector(n, 0.004);
      const half = Math.max(size.x, size.z) / 2;
      const box = new THREE.Box3(new THREE.Vector3(p.x - half, p.y, p.z - half), new THREE.Vector3(p.x + half, p.y + size.y, p.z + half));
      box.min.addScaledVector(n, 0.01);
      box.max.addScaledVector(n, 0.01);
      if (occupied.some((b) => b.intersectsBox(box))) continue;
      return { pos: p, rotY: ry, wall: true };
    }
  }
  const hint = kind === 'wall' || !deskOk ? 'floor' : kind;
  const s = placeInWorld(phys, hint, size, seed);
  return { pos: s.pos, rotY: s.yaw };
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
  const spot = chooseSpot(phys, kind, `${prop}#${index}`, size, reserved);
  const pos = spot.pos.clone();
  if (spot.wall) pos.addScaledVector(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), spot.rotY), -box.min.z);
  pos.y += -box.min.y + 0.004;

  const body = phys.createBody({ pos, rot: new THREE.Euler(0, spot.rotY, 0), angularDamping: 1, linearDamping: recipe.linearDamping ?? 0.25 });
  const he = { x: Math.max(0.012, size.x / 2), y: Math.max(0.012, size.y / 2), z: Math.max(0.012, size.z / 2) };
  const shape = recipe.collider ?? 'box';
  const desc =
    shape === 'ball'
      ? R.ColliderDesc.ball(Math.max(he.x, he.y, he.z))
      : shape === 'cyl'
        ? R.ColliderDesc.cylinder(he.y, Math.max(he.x, he.z))
        : R.ColliderDesc.cuboid(he.x, he.y, he.z);
  desc.setTranslation(center.x, center.y, center.z);
  if (Math.max(size.x, size.y, size.z) < 0.35) body.enableCcd(true);
  const base = { restitution: recipe.restitution ?? 0.06, friction: recipe.friction ?? 0.85, density: recipe.density ?? 400 };
  phys.addCollider(body, desc, base);

  let light: THREE.PointLight | undefined;
  if (recipe.light && lightAvailable()) {
    light = new THREE.PointLight(recipe.light.color, recipe.light.intensity, recipe.light.distance ?? 2, 2);
    light.position.set(0, recipe.light.y, 0.05);
    group.add(light);
  }
  scene.add(group);
  const obj = phys.track(group, body, prop, 'props', base);
  registerDecor(obj, fx ?? [], { light, stuck: !!spot.wall });
  return { obj, light };
}
