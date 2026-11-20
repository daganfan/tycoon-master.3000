import { describe, expect, it } from 'vitest';
import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { num } from '@/core/num';
import { tycoonById } from '@/sim/tycoons';
import { WEATHERS, buyChance, lemonSuggested, refPrice, suggestedPrice, type LemonState } from '@/sim/tycoons/lemonMogul';
import type { DuckState } from '@/sim/tycoons/rubberDuckWorks';
import type { SockState } from '@/sim/tycoons/sockSyndicate';
import type { CouchState } from '@/sim/tycoons/couchCoinMining';
import { SKILL_NODES } from '@/content/skilltree';

const fresh = () => {
  const g = new Game(createInitialState(3, 0));
  g.setFlag('booted');
  return g;
};

function install(g: Game, id: string): void {
  g.state.cash = num(1e12);
  for (let i = 0; i < 3; i++) g.buyItem('refurb_pc');
  if (!g.state.tycoons[id]) g.unlockTycoon(id);
  g.setRunning(id, true);
}

describe('Lemon Mogul demand', () => {
  it('demand curve is smooth, decreasing and never zero', () => {
    let prev = 1;
    for (let p = 0.05; p <= 10; p += 0.05) {
      const c = buyChance(p, 0.7);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(prev);
      prev = c;
    }
    expect(buyChance(0.05, 0.7)).toBeGreaterThan(0.99);
  });

  it('every weather yields sales at a reasonable price (rain lowers but never kills sales)', () => {
    for (const w of WEATHERS) {
      for (const price of [0.5, 0.75, 1, suggestedPrice(refPrice(w, {}))]) {
        const g = fresh();
        const rt = g.state.tycoons.lemon_mogul!;
        const s = rt.state as LemonState;
        s.weather = w;
        s.weatherTimer = 1e9;
        s.price = price;
        s.cups = 1000;
        g.tick(10);
        expect(s.served, `${w} @ ${price}`).toBeGreaterThan(0);
        expect(rt.money, `${w} @ ${price}`).toBeGreaterThan(0);
      }
    }
  });

  it('the suggested price beats nearby prices', () => {
    for (const w of WEATHERS) {
      const ref = refPrice(w, { sugar: 2 });
      const best = suggestedPrice(ref);
      const rev = (p: number) => p * buyChance(p, ref);
      expect(rev(best)).toBeGreaterThanOrEqual(rev(best * 1.3));
      expect(rev(best)).toBeGreaterThanOrEqual(rev(best * 0.7));
    }
  });

  it('rain is worse than sun but upgrades help', () => {
    const run = (w: LemonState['weather'], up: Record<string, number>) => {
      const g = fresh();
      const rt = g.state.tycoons.lemon_mogul!;
      rt.upgrades = up;
      const s = rt.state as LemonState;
      Object.assign(s, { weather: w, weatherTimer: 1e9, cups: 1e6 });
      s.price = lemonSuggested(rt);
      g.tick(60);
      return rt.money;
    };
    expect(run('rainy', {})).toBeLessThan(run('sunny', {}));
    expect(run('rainy', { umbrella: 3 })).toBeGreaterThan(run('rainy', {}));
    expect(run('heatwave', { ice: 3 })).toBeGreaterThan(run('heatwave', {}));
    expect(run('rainy', { recipe: 2 })).toBeGreaterThan(run('rainy', {}));
  });

  it('weather forecasts keystone re-prices on weather change', () => {
    const g = fresh();
    g.state.nodes.push('a8');
    g.rebuildStats();
    const rt = g.state.tycoons.lemon_mogul!;
    const s = rt.state as LemonState;
    s.price = 9;
    s.weatherTimer = 0.05;
    g.tick(0.1);
    expect(s.price).toBeCloseTo(lemonSuggested(rt), 5);
    expect(s.next).toBeDefined();
  });
});

describe('No mini-tycoon gets permanently stuck', () => {
  it('every game keeps earning over a long idle stretch with a few upgrades', () => {
    const ups: Record<string, Record<string, number>> = {
      lemon_mogul: { stand: 3 },
      rubber_duck_works: { mold: 10, belt: 6 },
      sock_syndicate: { dryer: 5, sorter: 3 },
      couch_coin_mining: { vacuum: 3 },
    };
    for (const id of Object.keys(ups)) {
      const g = fresh();
      install(g, id);
      const rt = g.state.tycoons[id]!;
      rt.upgrades = ups[id]!;
      // Two halves: income must keep coming in the second half (no permanent stall).
      for (let i = 0; i < 1800; i++) g.tick(0.5);
      const mid = rt.lifetime;
      for (let i = 0; i < 1800; i++) g.tick(0.5);
      expect(rt.lifetime, id).toBeGreaterThan(mid);
    }
  });

  it('a jammed duck belt eventually gets kicked loose', () => {
    const g = fresh();
    install(g, 'rubber_duck_works');
    const s = g.state.tycoons.rubber_duck_works!.state as DuckState;
    s.jammed = true;
    for (let i = 0; i < 700; i++) g.tick(0.1);
    expect(s.jammed).toBe(false);
  });
});

describe('New mini-tycoon upgrades', () => {
  it('quality inspector drains jam risk and jam tourism pays while jammed', () => {
    const g = fresh();
    install(g, 'rubber_duck_works');
    const rt = g.state.tycoons.rubber_duck_works!;
    const s = rt.state as DuckState;
    rt.upgrades = { inspector: 5 };
    s.jamMeter = 0.5;
    g.tick(10);
    expect(s.jamMeter).toBeLessThan(0.5);
    rt.upgrades = { mold: 5 };
    s.jammed = true;
    s.jamTimer = 0;
    const before = rt.lifetime;
    g.tick(1);
    expect(rt.lifetime).toBe(before);
    g.state.nodes.push('h12');
    g.rebuildStats();
    g.tick(1);
    expect(rt.lifetime).toBeGreaterThan(before);
  });

  it('sock darning recovers lost socks, sock bots match without hamsters', () => {
    const g = fresh();
    install(g, 'sock_syndicate');
    const rt = g.state.tycoons.sock_syndicate!;
    const s = rt.state as SockState;
    rt.upgrades = { darning: 3 };
    s.lost = 20;
    g.tick(10);
    expect(s.lost).toBeLessThan(20);
    expect(s.darned).toBeGreaterThan(0);
    rt.upgrades = { dryer: 5 };
    const pairs = s.pairs;
    g.tick(20);
    expect(s.pairs).toBe(pairs);
    g.state.nodes.push('a5');
    g.rebuildStats();
    g.tick(20);
    expect(s.pairs).toBeGreaterThan(pairs);
  });

  it('metal detector finds rares and cushion lift softens layers', () => {
    const g = fresh();
    install(g, 'couch_coin_mining');
    const rt = g.state.tycoons.couch_coin_mining!;
    const s = rt.state as CouchState;
    rt.upgrades = { detector: 5, lift: 5, vacuum: 20 };
    for (let i = 0; i < 600; i++) g.tick(0.5);
    expect(s.rares ?? 0).toBeGreaterThan(0);
    expect(s.maxHp).toBeLessThan(6 * Math.pow(1.11, s.depth));
  });

  it('upgrades are capped so income cannot snowball', () => {
    for (const id of ['lemon_mogul', 'rubber_duck_works', 'sock_syndicate', 'couch_coin_mining'])
      for (const u of tycoonById(id).upgrades) expect(u.max, `${id}.${u.id}`).toBeDefined();
  });
});

describe('Skill tree keystones and stats', () => {
  const own = (g: Game, ...ids: string[]) => {
    g.state.nodes.push(...ids);
    g.rebuildStats();
  };

  it('has ~70 nodes, hidden legacy nodes that cannot be bought yet', () => {
    expect(SKILL_NODES.length).toBeGreaterThanOrEqual(65);
    const g = fresh();
    g.state.tokens.golden = 99;
    expect(g.nodeState('l1')).toBe('hidden');
    expect(g.buyNode('l1')).toBe(false);
    g.setFlag('phase:garage');
    expect(g.buyNode('l1')).toBe(true);
  });

  it('every node effect maps to a known stat or an implemented flag', () => {
    const g = fresh();
    const known = new Set(['autoclick', 'autoCashout', 'autoUnjam', 'macro', 'coins.seekPlayer', 'coins.split', 'cashout.tenth', 'socks.autoMatch', 'lemon.forecast', 'ducks.jamPay']);
    for (const n of SKILL_NODES)
      for (const e of n.effects) {
        if ('flag' in e) expect(known.has(e.flag), `${n.id}: ${e.flag}`).toBe(true);
        else expect(g.stats.get(e.stat) !== 0 || e.op === 'add', `${n.id}: ${e.stat}`).toBe(true);
      }
  });

  it('lucky tenth doubles every 10th cash-out; coin split adds 25%', () => {
    const g = fresh();
    own(g, 'b11');
    const rt = g.state.tycoons.lemon_mogul!;
    const paid: number[] = [];
    for (let i = 0; i < 10; i++) {
      rt.money = 10;
      paid.push(g.cashOut('lemon_mogul').toNumber());
    }
    expect(paid[9]).toBeCloseTo(paid[0]! * 2);
    expect(paid[8]).toBeCloseTo(paid[0]!);
    own(g, 'c10');
    rt.money = 10;
    expect(g.cashOut('lemon_mogul').toNumber()).toBeCloseTo(paid[0]! * 1.25);
  });

  it('lucky clicks sometimes repeat the main action', () => {
    const g = fresh();
    own(g, 'h8', 'h11');
    const s = g.state.tycoons.lemon_mogul!.state as LemonState;
    s.cups = 0;
    for (let i = 0; i < 200; i++) g.action('lemon_mogul', 'squeeze');
    expect(s.cups).toBeGreaterThan(200);
  });

  it('chaos stats change meter gain', () => {
    const a = fresh();
    const b = fresh();
    own(b, 'c2', 'c7');
    expect(b.reportChaos('topple', { magnitude: 1, object: 'x' })).toBeGreaterThan(a.reportChaos('topple', { magnitude: 1, object: 'x' }) * 2);
    own(b, 'c12');
    expect(b.chaosNeeded()).toBeLessThan(a.chaosNeeded());
  });

  it('OS speed shortens the auto cash-out interval', () => {
    const g = fresh();
    own(g, 'b6', 'hw3', 'hw8');
    g.state.tycoons.lemon_mogul!.money = 50;
    for (let i = 0; i < 70; i++) g.tick(0.1);
    expect(g.state.counters.cashouts ?? 0).toBeGreaterThan(0);
  });
});
