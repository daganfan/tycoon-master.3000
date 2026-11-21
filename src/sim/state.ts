import { ZERO } from '@/core/num';
import type { GameState } from './types';
import { createGarageState } from './garage/factory';

export const SAVE_VERSION = 3;

export const BASE_STATS: Record<string, number> = {
  'click.power': 1,
  'tycoon.speed': 1,
  slots: 1,
  'exchange.rate': 1,
  vibe: 0,
  'grind.threshold': 240,
  'magnet.radius': 1.5,
  'offline.cap': 2 * 3600,
  'offline.rate': 0.5,
  'shop.discount': 1,
  /** Multiplier on Chaos Meter points. */
  'chaos.mult': 1,
  /** Seconds before the same kind of mayhem with the same object counts again. */
  'chaos.cooldown': 10,
  /** Multiplier on how fast "you did that already" fatigue wears off. */
  'chaos.decay': 1,
  /** Multiplier on the meter size needed per Chaos Token. */
  'chaos.need': 1,
  'chaos.topple': 1,
  'chaos.ragdoll': 1,
  'crit.chance': 0,
  'crit.mult': 1,
  'macro.rate': 1,
  'os.speed': 1,
  'coin.bounce': 0.3,
  'pickup.mult': 1,
  'cosmetic.slots': 1,
  'cosmetic.discount': 1,
  'os.tier': 0,
  /** Factory: item value multiplier, dropper speed multiplier, Robo-Helper interval multiplier. */
  'garage.mult': 1,
  'garage.speed': 1,
  'garage.robot': 1,
};

export function createInitialState(seed = Date.now() >>> 0, now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    rngState: seed,
    time: 0,
    lastSaved: now,
    cash: ZERO,
    lifetimeCash: ZERO,
    floorCash: ZERO,
    tokens: { grind: 0, mogul: 0, chaos: 0, pixel: 0, golden: 0 },
    nodes: ['root'],
    items: {},
    tycoons: {},
    cosmetics: { owned: [], equipped: {} },
    counters: {},
    quests: [],
    flags: [],
    settings: { comfort: 1, volume: 0.6, wallpaper: 0, reducedMotion: false, quality: 'auto' },
    layout: {},
    garage: createGarageState(),
  };
}
