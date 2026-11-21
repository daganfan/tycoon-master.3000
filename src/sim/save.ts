import { num } from '@/core/num';
import type { GameState } from './types';
import { SAVE_VERSION, createInitialState } from './state';
import { createGarageState } from './garage/factory';
import { createDesk, deskFromRunning, type DeskState } from './desk';

type RawSave = Record<string, unknown> & { version: number };

/** Ordered migrations: index i upgrades version i+1 → i+2. */
const MIGRATIONS: ((s: RawSave) => RawSave)[] = [
  // v1 → v2: prop layout persistence; old per-kind chaos cooldowns are dropped (chaos meter replaces them).
  (s) => {
    const counters = { ...((s.counters as Record<string, number> | undefined) ?? {}) };
    for (const k of Object.keys(counters)) if (k.startsWith('cd_')) delete counters[k];
    return { ...s, counters, layout: {}, version: 2 };
  },
  // v2 → v3: the Garage (phase 2). Players who already own the key walk straight in.
  (s) => {
    const flags = [...((s.flags as string[] | undefined) ?? [])];
    const items = (s.items as Record<string, number> | undefined) ?? {};
    if ((items.garage_key ?? 0) > 0 && !flags.includes('phase:garage')) flags.push('phase:garage');
    return { ...s, flags, garage: createGarageState(), version: 3 };
  },
  // v3 → v4: games only run while open in a window on a screen. Games that were
  // running in a slot are laid out one per window (main PC first), the rest minimized.
  (s) => {
    if (s.desk) return { ...s, version: 4 };
    const tycoons = (s.tycoons as Record<string, { installed?: boolean }> | undefined) ?? {};
    const running = Object.entries(tycoons).filter(([, t]) => t.installed).map(([id]) => id);
    const items = (s.items as Record<string, number> | undefined) ?? {};
    const perScreen = 1 + ((items.os_xp ?? 0) > 0 ? 1 : 0);
    return { ...s, desk: deskFromRunning(running, items, perScreen), version: 4 };
  },
];

export function serialize(state: GameState, now = Date.now()): string {
  return JSON.stringify({
    ...state,
    lastSaved: now,
    cash: state.cash.toString(),
    lifetimeCash: state.lifetimeCash.toString(),
    floorCash: state.floorCash.toString(),
  });
}

export function deserialize(text: string): GameState {
  let raw = JSON.parse(text) as RawSave;
  if (typeof raw.version !== 'number') throw new Error('Save has no version');
  if (raw.version > SAVE_VERSION) throw new Error(`Save is from a newer version (${raw.version})`);
  while (raw.version < SAVE_VERSION) {
    const m = MIGRATIONS[raw.version - 1];
    if (!m) throw new Error(`No migration from v${raw.version}`);
    raw = m(raw);
  }
  const base = createInitialState();
  const s = { ...base, ...raw } as unknown as GameState & { cash: unknown; lifetimeCash: unknown; floorCash: unknown };
  s.cash = num(String(s.cash ?? 0));
  s.lifetimeCash = num(String(s.lifetimeCash ?? 0));
  s.floorCash = num(String(s.floorCash ?? 0));
  s.tokens = { ...base.tokens, ...s.tokens };
  s.settings = { ...base.settings, ...s.settings };
  s.layout = s.layout ?? {};
  s.garage = { ...createGarageState(), ...s.garage, pads: [...(s.garage?.pads ?? [])] };
  const desk = (s.desk as DeskState | undefined) ?? createDesk();
  s.desk = { screens: { ...desk.screens }, min: [...(desk.min ?? [])] };
  s.cosmetics = { owned: s.cosmetics?.owned ?? [], equipped: s.cosmetics?.equipped ?? {} };
  return s;
}

export const exportSave = (state: GameState): string => btoa(unescape(encodeURIComponent(serialize(state))));
export const importSave = (code: string): GameState => deserialize(decodeURIComponent(escape(atob(code.trim()))));

/** Storage backend: IndexedDB in the browser, an in-memory map in tests. */
export interface SaveStore {
  get(slot: string): Promise<string | undefined>;
  set(slot: string, text: string): Promise<void>;
}

export class MemoryStore implements SaveStore {
  data = new Map<string, string>();
  async get(slot: string) {
    return this.data.get(slot);
  }
  async set(slot: string, text: string) {
    this.data.set(slot, text);
  }
}

export class IdbStore implements SaveStore {
  private db: Promise<IDBDatabase>;
  constructor(name = 'tycoon-master-3000') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('saves');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('saves', mode).objectStore('saves'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async get(slot: string) {
    return (await this.tx('readonly', (s) => s.get(slot))) as string | undefined;
  }
  async set(slot: string, text: string) {
    await this.tx('readwrite', (s) => s.put(text, slot));
  }
}

/** Writes the main slot and rotates the previous save into a backup. */
export async function writeSave(store: SaveStore, state: GameState): Promise<void> {
  const prev = await store.get('main');
  if (prev) await store.set('backup', prev);
  await store.set('main', serialize(state));
}

export async function readSave(store: SaveStore): Promise<GameState | undefined> {
  for (const slot of ['main', 'backup']) {
    const text = await store.get(slot);
    if (!text) continue;
    try {
      return deserialize(text);
    } catch (e) {
      console.warn(`Save slot ${slot} unreadable`, e);
    }
  }
  return undefined;
}
