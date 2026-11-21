import { describe, expect, it } from 'vitest';
import { Game } from '@/sim/game';
import { SAVE_VERSION, createInitialState } from '@/sim/state';
import { num } from '@/core/num';
import { deserialize, serialize } from '@/sim/save';
import { PADS, REBIRTH_REQUIRES, STAR_BONUS, padById, rebirthCost } from '@/content/garage';
import { ITEMS } from '@/content/items';
import { QUESTS } from '@/content/quests';
import { UPCOMING } from '@/content/upcoming';
import { TYCOONS } from '@/sim/tycoons';

const fresh = () => {
  const g = new Game(createInitialState(1, 0));
  g.setFlag('booted');
  return g;
};

/** A game that just bought the Garage Key, with some spare cash. */
const withKey = (cash = 1e12) => {
  const g = fresh();
  g.state.cash = num(2_000_000);
  expect(g.buyItem('garage_key')).toBe(true);
  g.state.cash = num(cash);
  return g;
};

const buildAll = (g: Game, ids = PADS.map((p) => p.id)) => {
  for (let guard = 0; guard < 50; guard++) for (const id of ids) if (g.garage.padStatus(id) === 'available') g.garage.buyPad(id);
};

describe('Garage: key and gating', () => {
  it('garage items, games and pads are locked until the key', () => {
    const g = fresh();
    g.state.cash = num(1e15);
    expect(g.phaseOpen('garage')).toBe(false);
    expect(g.canBuyItem('g_heater')).toBe(false);
    expect(g.canBuyItem('lan_lease')).toBe(false);
    expect(g.canUnlockTycoon('hot_dog_highway')).toBe(false);
    expect(g.garage.buyPad('furnace')).toBe(false);
    expect(g.garage.padStatus('furnace')).toBe('locked');
  });

  it('the key opens the phase (and the garage legacy nodes)', () => {
    const g = withKey();
    expect(g.state.flags).toContain('phase:garage');
    expect(g.canBuyItem('g_heater')).toBe(true);
    expect(g.canUnlockTycoon('hot_dog_highway')).toBe(true);
    expect(g.nodeState('l1')).not.toBe('hidden');
  });
});

describe('Garage: pads', () => {
  it('pads must be bought in order and cost cash', () => {
    const g = withKey(10_000);
    expect(g.garage.padStatus('belt_a')).toBe('locked');
    expect(g.garage.buyPad('belt_a')).toBe(false);
    expect(g.garage.buyPad('furnace')).toBe(true);
    expect(g.state.cash.toNumber()).toBe(10_000 - padById('furnace')!.cost);
    expect(g.garage.buyPad('furnace')).toBe(false);
    expect(g.garage.padStatus('furnace')).toBe('built');
    expect(g.garage.padStatus('belt_a')).toBe('available');
  });

  it('cannot buy a pad without enough cash', () => {
    const g = withKey(500);
    expect(g.garage.canBuyPad('furnace')).toBe(false);
    expect(g.garage.buyPad('furnace')).toBe(false);
    expect(g.state.garage.pads).toEqual([]);
  });

  it('every pad requirement exists and the whole factory can be built', () => {
    for (const p of PADS) for (const r of p.requires) expect(padById(r), `${p.id} → ${r}`).toBeDefined();
    const g = withKey();
    buildAll(g);
    expect(g.state.garage.pads.length).toBe(PADS.length);
  });

  it('emits an event per pad so the world can build it', () => {
    const g = withKey();
    const built: string[] = [];
    g.bus.on('garagePad', (e) => built.push(e.id));
    g.garage.buyPad('furnace');
    expect(built).toEqual(['furnace']);
  });
});

describe('Garage: production math', () => {
  it('a dropper earns nothing until the belt and furnace exist', () => {
    const g = withKey();
    expect(g.garage.rate()).toBe(0);
    buildAll(g, ['furnace', 'belt_a', 'drop_a1']);
    const d = padById('drop_a1')!.dropper!;
    expect(g.garage.rate()).toBeCloseTo(d.rate * d.value);
  });

  it('upgraders multiply only their own line; speed and decor multiply everything', () => {
    const g = withKey();
    buildAll(g, ['furnace', 'belt_a', 'drop_a1', 'drop_a2', 'up_paint']);
    const base = (0.5 * padById('drop_a1')!.dropper!.value + 0.5 * padById('drop_a2')!.dropper!.value) * 1.5;
    expect(g.garage.rate()).toBeCloseTo(base);
    expect(g.garage.lineMult('A')).toBe(1.5);
    expect(g.garage.lineMult('B')).toBe(1);
    buildAll(g, ['drop_a3', 'deco_rails']);
    expect(g.garage.globalMult()).toBeCloseTo(1.1);
  });

  it('rate = Σ droppers × value × Π upgraders × speed × global', () => {
    const g = withKey();
    buildAll(g);
    let expected = 0;
    for (const p of PADS.filter((x) => x.dropper)) {
      const ups = PADS.filter((u) => u.upgrader && u.line === p.line).reduce((m, u) => m * u.upgrader!.mult, 1);
      expected += p.dropper!.rate * p.dropper!.value * ups;
    }
    const speed = PADS.filter((p) => p.kind === 'speed').reduce((m, p) => m * p.mult!, 1);
    const decor = PADS.filter((p) => p.kind === 'decor').reduce((m, p) => m * p.mult!, 1);
    expect(g.garage.rate()).toBeCloseTo(expected * speed * decor, 3);
  });

  it('the sim fills the tank when the world is not running, and stops when it is (no double counting)', () => {
    const g = withKey();
    buildAll(g, ['furnace', 'belt_a', 'drop_a1']);
    for (let i = 0; i < 100; i++) g.tick(0.1);
    expect(g.state.garage.tank).toBeCloseTo(g.garage.rate() * 10, 3);
    g.garage.live = true;
    const before = g.state.garage.tank;
    for (let i = 0; i < 100; i++) g.tick(0.1);
    expect(g.state.garage.tank).toBe(before);
    g.garage.deposit(123);
    expect(g.state.garage.tank).toBe(before + 123);
  });

  it('collecting turns the tank into physical floor cash', () => {
    const g = withKey(0);
    g.state.garage.tank = 5000;
    const paid: number[] = [];
    g.bus.on('garagePayout', (e) => paid.push(e.amount.toNumber()));
    expect(g.garage.collect('pad').toNumber()).toBe(5000);
    expect(g.state.garage.tank).toBe(0);
    expect(g.state.floorCash.toNumber()).toBe(5000);
    expect(paid).toEqual([5000]);
    g.collectAll();
    expect(g.state.cash.toNumber()).toBe(5000);
    expect(g.garage.collect().toNumber()).toBe(0);
  });

  it('the Robo-Helper empties the tank on its own', () => {
    const g = withKey();
    buildAll(g, ['furnace', 'belt_a', 'drop_a1', 'drop_a2', 'up_paint', 'drop_a3', 'up_gold', 'robot']);
    for (let i = 0; i < 10 * (g.garage.robotInterval() + 1); i++) g.tick(0.1);
    expect(g.state.garage.collects).toBeGreaterThanOrEqual(1);
    expect(g.state.floorCash.gt(0)).toBe(true);
  });
});

describe('Garage: rebirth', () => {
  it('needs the finished factory and the rebirth price', () => {
    const g = withKey();
    expect(g.garage.canRebirth()).toBe(false);
    buildAll(g);
    expect(g.garage.rebirthReady()).toBe(true);
    g.state.cash = num(rebirthCost(0) - 1);
    expect(g.garage.rebirth()).toBe(false);
  });

  it('resets the pads for a permanent star, a Pixel Token and a one-off Golden Token', () => {
    const g = withKey();
    buildAll(g);
    const rate0 = g.garage.rate();
    g.state.garage.tank = 999;
    const cash = g.state.cash.toNumber();
    expect(g.garage.rebirth()).toBe(true);
    expect(g.state.cash.toNumber()).toBeCloseTo(cash - rebirthCost(0));
    expect(g.state.garage.pads).toEqual([]);
    expect(g.state.garage.tank).toBe(0);
    expect(g.state.floorCash.toNumber()).toBe(999);
    expect(g.state.garage.stars).toBe(1);
    expect(g.state.tokens.pixel).toBe(1);
    expect(g.state.tokens.golden).toBe(1);
    buildAll(g);
    expect(g.garage.rate()).toBeCloseTo(rate0 * (1 + STAR_BONUS));
    expect(g.garage.rebirth()).toBe(true);
    expect(g.state.tokens.golden).toBe(1);
    expect(g.state.tokens.pixel).toBe(2);
    expect(rebirthCost(1)).toBeGreaterThan(rebirthCost(0));
    for (const id of REBIRTH_REQUIRES) expect(padById(id)).toBeDefined();
  });
});

describe('Garage: offline and saves', () => {
  it('offline earnings fill the tank, and a robot pays them out', () => {
    const g = withKey();
    buildAll(g, ['furnace', 'belt_a', 'drop_a1']);
    const r = g.applyOffline(3600);
    expect(r.cash.toNumber()).toBe(0);
    expect(g.state.garage.tank).toBeCloseTo(g.garage.rate() * 3600 * g.stat('offline.rate'), 3);
    buildAll(g, ['drop_a2', 'up_paint', 'drop_a3', 'up_gold', 'robot']);
    const r2 = g.applyOffline(3600);
    expect(r2.cash.toNumber()).toBeGreaterThan(0);
    expect(g.state.garage.tank).toBe(0);
  });

  it('round-trips garage state', () => {
    const g = withKey();
    buildAll(g, ['furnace', 'belt_a']);
    g.state.garage.tank = 42.5;
    g.state.garage.stars = 2;
    const back = deserialize(serialize(g.state));
    expect(back.garage).toEqual(g.state.garage);
    expect(new Game(back).garage.has('belt_a')).toBe(true);
  });

  it('migrates v2 saves: adds garage state and opens the phase for key owners', () => {
    const g = fresh();
    g.state.items.garage_key = 1;
    const raw = JSON.parse(serialize(g.state)) as Record<string, unknown>;
    raw.version = 2;
    delete raw.garage;
    const back = deserialize(JSON.stringify(raw));
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.garage.pads).toEqual([]);
    expect(back.flags).toContain('phase:garage');
    const raw2 = JSON.parse(serialize(fresh().state)) as Record<string, unknown>;
    raw2.version = 2;
    delete raw2.garage;
    expect(deserialize(JSON.stringify(raw2)).flags).not.toContain('phase:garage');
  });
});

describe('Garage: content', () => {
  it('garage games are registered and no longer listed as coming soon', () => {
    for (const id of ['hot_dog_highway', 'robo_car_wash']) expect(TYCOONS.some((t) => t.id === id && t.phase === 'garage')).toBe(true);
    expect(UPCOMING.some((u) => u.name === 'Hot Dog Highway' || u.name === 'Robo Car Wash')).toBe(false);
  });

  it('has 8–12 garage items plus the LAN Café teaser, and garage quests', () => {
    const items = ITEMS.filter((i) => i.phase === 'garage' && i.id !== 'lan_lease');
    expect(items.length).toBeGreaterThanOrEqual(8);
    expect(items.length).toBeLessThanOrEqual(12);
    expect(ITEMS.find((i) => i.id === 'lan_lease')?.category).toBe('key');
    expect(QUESTS.filter((q) => q.id.startsWith('q_g_')).length).toBeGreaterThanOrEqual(5);
  });
});
