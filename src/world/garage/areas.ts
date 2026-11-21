import * as THREE from 'three';
import { GARAGE } from '@/content/garage';
import { DOOR, ROOM } from '../room';
import type { Physics } from '../physics';

/** Walkable spaces of the world (axis-aligned boxes). */
export interface Area {
  id: 'bedroom' | 'garage';
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
}

export const AREAS: Area[] = [
  { id: 'bedroom', x0: ROOM.x0, x1: ROOM.x1, z0: ROOM.z0, z1: ROOM.z1, h: ROOM.h },
  { id: 'garage', x0: GARAGE.x0, x1: GARAGE.x1, z0: GARAGE.z0, z1: GARAGE.z1, h: GARAGE.h },
];

/** The doorway between the bedroom and the garage. */
export const DOORWAY = { x0: DOOR.x - DOOR.w / 2, x1: DOOR.x + DOOR.w / 2, z0: ROOM.z1 - 0.2, z1: GARAGE.z0 + 0.2, h: DOOR.h };

export function areaAt(p: THREE.Vector3Like): Area {
  return p.z > (ROOM.z1 + GARAGE.z0) / 2 ? AREAS[1]! : AREAS[0]!;
}

/** Inside any area (with a margin), above the floor and below the ceiling. */
export function insideAny(p: THREE.Vector3Like, margin = 0.35): boolean {
  if (p.y < -0.5) return false;
  return AREAS.some((a) => p.x > a.x0 - margin && p.x < a.x1 + margin && p.z > a.z0 - margin && p.z < a.z1 + margin && p.y < a.h + 1.5);
}

const inDoorway = (p: THREE.Vector3Like, pad = 0.35): boolean =>
  p.x > DOORWAY.x0 - pad && p.x < DOORWAY.x1 + pad && p.z > DOORWAY.z0 - pad && p.z < DOORWAY.z1 + pad;

/**
 * Keep the third-person camera inside the space the player is in. Walking
 * through the doorway, the camera is squeezed into the door frame so it never
 * ends up inside a wall.
 */
export function clampCamera(cam: THREE.Vector3, target: THREE.Vector3, phys?: CameraPhys): void {
  clampToAreas(cam, target);
  // In the garage the camera also stays out of machines and walls.
  if (!phys || areaAt(target).id !== 'garage') return;
  const dir = cam.clone().sub(target);
  const len = dir.length();
  if (len < 0.05) return;
  dir.divideScalar(len);
  const hit = phys.world.castRay(new phys.R.Ray(target, dir), len, true, phys.R.QueryFilterFlags.EXCLUDE_DYNAMIC);
  if (hit) cam.copy(target).addScaledVector(dir, Math.max(0.25, hit.timeOfImpact - 0.12));
}

/** What the camera collision needs from the physics wrapper. */
export interface CameraPhys {
  R: Physics['R'];
  world: Physics['world'];
}

function clampToAreas(cam: THREE.Vector3, target: THREE.Vector3): void {
  const a = areaAt(target);
  const m = 0.15;
  if (inDoorway(target)) {
    cam.x = THREE.MathUtils.clamp(cam.x, DOORWAY.x0 + 0.1, DOORWAY.x1 - 0.1);
    cam.z = THREE.MathUtils.clamp(cam.z, AREAS[0]!.z0 + m, AREAS[1]!.z1 - m);
    cam.y = THREE.MathUtils.clamp(cam.y, 0.3, DOORWAY.h - 0.1);
    // Once fully on one side, clamp to that room as usual.
    if (cam.z < ROOM.z1 - 0.05 || cam.z > GARAGE.z0 + 0.05) {
      const b = areaAt(cam);
      cam.x = THREE.MathUtils.clamp(cam.x, b.x0 + m, b.x1 - m);
      cam.y = THREE.MathUtils.clamp(cam.y, 0.3, b.h - m);
    }
    return;
  }
  cam.x = THREE.MathUtils.clamp(cam.x, a.x0 + m, a.x1 - m);
  cam.z = THREE.MathUtils.clamp(cam.z, a.z0 + m, a.z1 - m);
  cam.y = THREE.MathUtils.clamp(cam.y, 0.3, a.h - m);
}
