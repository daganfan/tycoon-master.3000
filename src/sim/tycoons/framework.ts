import type { Rng } from '@/core/rng';
import type { TycoonDef, TycoonRuntime, TycoonUpgradeDef } from '@/sim/types';

export const lvl = (rt: TycoonRuntime, id: string): number => rt.upgrades[id] ?? 0;

export function upgradeCost(u: TycoonUpgradeDef, level: number): number {
  return Math.ceil(u.baseCost * Math.pow(u.growth, level) * 100) / 100;
}

/** Lifetime internal earnings needed to reach `level + 1`. */
export const xpForLevel = (level: number): number => 150 * Math.pow(4, level);

export function createRuntime<S>(def: TycoonDef<S>, rng: Rng): TycoonRuntime<S> {
  return { id: def.id, installed: false, money: 0, lifetime: 0, level: 0, upgrades: {}, state: def.init(rng) };
}

/** Helper so each game file stays type-safe without casts. */
export const defineTycoon = <S>(def: TycoonDef<S>): TycoonDef<S> => def;
