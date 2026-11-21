/**
 * Pure rules behind Tidy Up and "home" spots (kept free of Three/Rapier so
 * they can be unit-tested).
 *
 * - An object's home only changes when the player deliberately places it:
 *   carried for a moment and set down gently (not thrown, not a quick click),
 *   and it then settles upright close to where it was let go. Being knocked
 *   over, shoved by something else, or rolling away never moves the home.
 * - Tidy puts things back in dependency order: big furniture (the things
 *   other things stand on) first, then the rest from the floor up.
 */

/** How the player let go of a carried object. */
export interface ReleaseInfo {
  /** Seconds the object was held. */
  heldFor: number;
  /** Speed of the object when let go (m/s). */
  speed: number;
  /** Released with the throw gesture (mouse up while swinging). */
  thrown: boolean;
  /** Shove-only furniture (desk, bed, ...). */
  heavy: boolean;
}

/** Minimum time the object must be carried for a set-down to count as placing it. */
export const MIN_HOLD = 0.4;
/** Faster than this when let go = it was thrown / dropped, not placed. */
export const PLACE_SPEED = 1.5;
/** After a set-down the object must come to rest within this time (s)… */
export const SETTLE_WINDOW = 3;
/** …and within this distance (m) of where it was let go. */
export const MAX_DRIFT = 0.35;

/** Did the player deliberately set this object down (as opposed to throwing or flicking it)? */
export function deliberatePlacement(r: ReleaseInfo): boolean {
  if (r.heldFor < MIN_HOLD) return false;
  if (r.thrown && r.speed > PLACE_SPEED * 0.6) return false;
  return r.speed <= (r.heavy ? PLACE_SPEED * 1.5 : PLACE_SPEED);
}

/** State of a pending placement, sampled each frame after the set-down. */
export interface SettleSample {
  /** Seconds since it was let go. */
  since: number;
  /** Speeds (m/s and rad/s). */
  lin: number;
  ang: number;
  upright: boolean;
  inside: boolean;
  /** Distance from the release point (m). */
  drift: number;
  /** Something else (tidy, a grab) took over in the meantime. */
  interrupted: boolean;
}

/** Should the spot it settled at become its home? `wait` = not settled yet. */
export function settleVerdict(s: SettleSample): 'wait' | 'accept' | 'reject' {
  if (s.interrupted || s.since > SETTLE_WINDOW || s.drift > MAX_DRIFT) return 'reject';
  if (s.lin > 0.05 || s.ang > 0.1) return 'wait';
  return s.upright && s.inside ? 'accept' : 'reject';
}

/** Something that Tidy Up may move. */
export interface TidyItem {
  id: string;
  /** Other things stand on it (desks, tables, shelves, dressers). */
  support: boolean;
  /** Home height (m). */
  homeY: number;
  /** Distance (m) and angle (rad) from home. */
  dist: number;
  angle: number;
}

/** Tolerances: closer than this to home = already tidy (keeps a second Tidy a no-op). */
export const TIDY_DIST = 0.03;
export const TIDY_ANGLE = 0.06;

export function needsTidy(i: Pick<TidyItem, 'dist' | 'angle'>): boolean {
  return i.dist > TIDY_DIST || i.angle > TIDY_ANGLE;
}

/** Order to put things back: supports first (lowest first), then everything else from the floor up. */
export function tidyOrder<T extends TidyItem>(items: T[]): T[] {
  return items
    .filter(needsTidy)
    .sort((a, b) => Number(b.support) - Number(a.support) || a.homeY - b.homeY || a.id.localeCompare(b.id));
}

/** Seconds between Tidy presses. */
export const TIDY_COOLDOWN = 1.5;
