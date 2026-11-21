import { describe, expect, it } from 'vitest';
import { Game } from '@/sim/game';
import { BASE_EXCHANGE, SAVE_VERSION, createInitialState } from '@/sim/state';
import { num } from '@/core/num';
import { MemoryStore, deserialize, exportSave, importSave, readSave, serialize, writeSave } from '@/sim/save';

const fresh = () => {
  const g = new Game(createInitialState(1, 0));
  g.setFlag('booted');
  return g;
};

describe('Game basics', () => {
  it('starts with Lemon Mogul open on the main screen and no background slots', () => {
    const g = fresh();
    expect(g.state.tycoons.lemon_mogul?.installed).toBe(true);
    expect(g.windowsOn('main')).toEqual(['lemon_mogul']);
    expect(g.screenIds()).toEqual(['main']);
    expect(g.windowsPerScreen()).toBe(1);
    expect(g.slots()).toBe(0);
    expect(g.capacity()).toBe(1);
  });

  it('starts with a low exchange rate', () => {
    const g = fresh();
    expect(g.exchangeRate()).toBeLessThan(0.5);
    expect(g.exchangeRate()).toBeGreaterThan(0.2);
    const product = g.exchangeBreakdown().reduce((a, e) => a * e.mult, 1);
    expect(product).toBeCloseTo(g.exchangeRate());
  });

  it('earns internal money, cashes out to the floor, and collects', () => {
    const g = fresh();
    for (let i = 0; i < 10; i++) g.action('lemon_mogul', 'squeeze');
    for (let i = 0; i < 300; i++) g.tick(0.1);
    const rt = g.state.tycoons.lemon_mogul!;
    expect(rt.money).toBeGreaterThan(0);
    const paid = g.cashOut('lemon_mogul');
    expect(paid.gt(0)).toBe(true);
    expect(rt.money).toBe(0);
    expect(g.state.floorCash.eq(paid)).toBe(true);
    g.collectAll();
    expect(g.state.cash.gte(paid)).toBe(true);
    expect(g.state.floorCash.eq(0)).toBe(true);
  });

  it('price nudges do not count toward Grind Tokens', () => {
    const g = fresh();
    for (let i = 0; i < 50; i++) g.action('lemon_mogul', i % 2 ? 'priceUp' : 'priceDown');
    expect(g.state.counters.grindProgress ?? 0).toBe(0);
  });

  it('awards Grind Tokens for manual actions', () => {
    const g = fresh();
    const need = g.grindNeeded();
    for (let i = 0; i < need; i++) g.action('lemon_mogul', 'squeeze');
    expect(g.state.tokens.grind).toBe(1);
    expect(g.grindNeeded()).toBeGreaterThan(need);
  });

  it('awards Mogul Tokens on level up', () => {
    const g = fresh();
    g.state.tycoons.lemon_mogul!.lifetime = 1000;
    g.tick(0.1);
    expect(g.state.tokens.mogul).toBeGreaterThan(0);
  });
});

describe('Shop and stats', () => {
  it('buying items raises cost and applies modifiers', () => {
    const g = fresh();
    g.state.cash = num(10000);
    const before = g.itemCost('used_monitor');
    expect(g.buyItem('used_monitor')).toBe(true);
    expect(g.itemCost('used_monitor').gt(before)).toBe(true);
    // A monitor is a screen, not a speed buff.
    expect(g.stat('tycoon.speed')).toBeCloseTo(1);
    expect(g.screenIds()).toEqual(['main', 'used_monitor#0']);
    g.buyItem('refurb_pc');
    expect(g.screenIds()).toEqual(['main', 'used_monitor#0', 'refurb_pc#0']);
    expect(g.slots()).toBe(1);
    g.buyItem('desk_fan');
    expect(g.stat('tycoon.speed')).toBeCloseTo(1.1);
  });

  it('respects item max', () => {
    const g = fresh();
    g.state.cash = num(1e9);
    expect(g.buyItem('os_xp')).toBe(true);
    expect(g.buyItem('os_xp')).toBe(false);
  });
});

describe('Skill tree', () => {
  it('requires a neighbour and tokens', () => {
    const g = fresh();
    expect(g.nodeState('h2')).toBe('locked');
    expect(g.canBuyNode('h1')).toBe(false);
    g.state.tokens.grind = 5;
    expect(g.buyNode('h1')).toBe(true);
    expect(g.stat('click.power')).toBe(2);
    expect(g.nodeState('h2')).toBe('available');
  });

  it('hides keystones until a neighbour is owned', () => {
    const g = fresh();
    expect(g.nodeState('h5')).toBe('hidden');
  });

  it('respec refunds tokens', () => {
    const g = fresh();
    g.state.tokens.grind = 3;
    g.buyNode('h1');
    g.buyNode('h2');
    g.state.cash = num(1e6);
    expect(g.respec()).toBe(true);
    expect(g.state.tokens.grind).toBe(3);
    expect(g.stat('click.power')).toBe(1);
  });
});

describe('Tycoons', () => {
  it('unlocks and respects screen capacity', () => {
    const g = fresh();
    g.state.cash = num(1e6);
    expect(g.unlockTycoon('rubber_duck_works')).toBe(true);
    expect(g.state.tycoons.rubber_duck_works?.installed).toBe(false); // bought, not open
    expect(g.setRunning('rubber_duck_works', true)).toBe(false); // the only window shows Lemon Mogul
    g.buyItem('used_monitor'); // a new screen picks up the idle game
    expect(g.windowsOn('used_monitor#0')).toEqual(['rubber_duck_works']);
    expect(g.isRunning('rubber_duck_works')).toBe(true);
  });

  it('duck belt jams and spawns physical ducks', () => {
    const g = fresh();
    g.state.cash = num(1e6);
    g.buyItem('refurb_pc');
    g.unlockTycoon('rubber_duck_works');
    g.setRunning('rubber_duck_works', true);
    g.state.tycoons.rubber_duck_works!.upgrades = { mold: 20, belt: 6 };
    const spawned: string[] = [];
    g.bus.on('spawn', (e) => spawned.push(e.kind));
    for (let i = 0; i < 600; i++) g.tick(0.1);
    expect(spawned).toContain('duck');
    expect((g.state.tycoons.rubber_duck_works!.state as { jammed: boolean }).jammed).toBe(true);
    g.action('rubber_duck_works', 'unjam');
    expect((g.state.tycoons.rubber_duck_works!.state as { jammed: boolean }).jammed).toBe(false);
  });
});

describe('Chaos and cosmetics', () => {
  it('chaos events fill a meter with cooldowns and diminishing returns', () => {
    const g = fresh();
    const first = g.reportChaos('topple', { magnitude: 1, object: 'chair' });
    expect(first).toBeGreaterThan(0);
    expect(g.reportChaos('topple', { magnitude: 1, object: 'chair' })).toBe(0); // cooldown
    expect(g.state.tokens.chaos).toBe(0); // one topple is not a token
    for (let i = 0; i < 120; i++) g.tick(0.1);
    const again = g.reportChaos('topple', { magnitude: 1, object: 'chair' });
    expect(again).toBeGreaterThan(0);
    expect(again).toBeLessThan(first); // same object again: diminishing returns
    const other = g.reportChaos('avalanche', { magnitude: 30 });
    expect(other).toBeGreaterThan(again);
  });

  it('awards a Chaos Token when the meter fills and the meter grows', () => {
    const g = fresh();
    const need = g.chaosNeeded();
    let t = 0;
    const objs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    while (g.state.tokens.chaos === 0 && t < 200) {
      g.reportChaos('topple', { magnitude: 2, object: objs[t % objs.length] });
      for (let i = 0; i < 100; i++) g.tick(0.1);
      t++;
    }
    expect(g.state.tokens.chaos).toBe(1);
    expect(g.chaosNeeded()).toBeGreaterThan(need);
  });

  it('spamming the same event gives almost nothing', () => {
    const g = fresh();
    let total = 0;
    for (let i = 0; i < 60; i++) {
      total += g.reportChaos('ragdoll', { magnitude: 2 });
      for (let k = 0; k < 110; k++) g.tick(0.1); // just past the cooldown
    }
    // 60 identical falls in ~11 minutes should not be worth more than a few tokens.
    expect(total).toBeLessThan(g.chaosNeeded() * 4);
    expect(g.reportChaos('ragdoll', { magnitude: 0 })).toBe(0);
  });

  it('buys and equips modifiers within slot limits', () => {
    const g = fresh();
    g.state.tokens.chaos = 20;
    g.state.tokens.mogul = 5;
    expect(g.buyCosmetic('mod_bouncy')).toBe(true);
    expect(g.buyCosmetic('mod_gold')).toBe(true);
    expect(g.equip('props', 'mod_bouncy')).toBe(true);
    expect(g.equip('props', 'mod_gold')).toBe(false); // only one slot
    g.equip('props', 'mod_bouncy');
    expect(g.equip('props', 'mod_gold')).toBe(true);
    expect(g.stat('exchange.rate')).toBeCloseTo(BASE_EXCHANGE * 1.02);
  });
});

describe('Offline earnings', () => {
  it('simulates capped time away', () => {
    const g = fresh();
    g.state.tycoons.lemon_mogul!.upgrades = { stand: 5, sign: 3 };
    const r = g.applyOffline(10 * 3600);
    expect(r.seconds).toBe(2 * 3600);
    expect(g.state.tycoons.lemon_mogul!.money).toBeGreaterThan(0);
  });
});

describe('Save / load', () => {
  it('round-trips state including big numbers', () => {
    const g = fresh();
    g.state.cash = num('1e500');
    g.state.tokens.chaos = 7;
    g.state.nodes.push('h1');
    const back = deserialize(serialize(g.state));
    expect(back.cash.eq(num('1e500'))).toBe(true);
    expect(back.tokens.chaos).toBe(7);
    expect(back.nodes).toContain('h1');
    const g2 = new Game(back);
    expect(g2.stat('click.power')).toBe(2);
  });

  it('export/import codes work', () => {
    const g = fresh();
    g.state.cash = num(123);
    expect(importSave(exportSave(g.state)).cash.eq(123)).toBe(true);
  });

  it('rejects newer versions and falls back to backup', async () => {
    expect(() => deserialize(JSON.stringify({ version: 999 }))).toThrow();
    const store = new MemoryStore();
    const g = fresh();
    await writeSave(store, g.state);
    g.state.cash = num(5);
    await writeSave(store, g.state);
    store.data.set('main', '{broken');
    const loaded = await readSave(store);
    expect(loaded?.cash.eq(0)).toBe(true);
  });
});

describe('Save migration', () => {
  it('migrates v1 saves to v2 with an empty layout', () => {
    const g = fresh();
    const raw = JSON.parse(serialize(g.state)) as Record<string, unknown>;
    raw.version = 1;
    delete raw.layout;
    raw.counters = { cd_topple: 99, manual: 5 };
    const back = deserialize(JSON.stringify(raw));
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.layout).toEqual({});
    expect(back.counters.cd_topple).toBeUndefined();
    expect(back.counters.manual).toBe(5);
  });

  it('round-trips prop layout', () => {
    const g = fresh();
    g.state.layout['used_monitor#0'] = { p: [1, 2, 3], q: [0, 0, 0, 1], hp: [1, 0.8, 3], hq: [0, 0, 0, 1] };
    const back = deserialize(serialize(g.state));
    expect(back.layout['used_monitor#0']?.p).toEqual([1, 2, 3]);
  });
});
