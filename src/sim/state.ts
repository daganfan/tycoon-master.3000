import { ZERO } from '@/core/num';
import type { GameState } from './types';

export const SAVE_VERSION = 1;

export const BASE_STATS: Record<string, number> = {
  'click.power': 1,
  'tycoon.speed': 1,
  slots: 1,
  'exchange.rate': 1,
  vibe: 0,
  'grind.threshold': 60,
  'magnet.radius': 1.5,
  'offline.cap': 2 * 3600,
  'offline.rate': 0.5,
  'shop.discount': 1,
  'chaos.mult': 1,
  'chaos.cooldown': 12,
  'coin.bounce': 0.3,
  'pickup.mult': 1,
  'cosmetic.slots': 1,
  'cosmetic.discount': 1,
  'os.tier': 0,
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
  };
}
