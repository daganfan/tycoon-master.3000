import { describe, expect, it } from 'vitest';
import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { num } from '@/core/num';
import { tycoonById } from '@/sim/tycoons';
import { ROADS, bestTiles, maxCarts, traffic, type HotDogState } from '@/sim/tycoons/hotDogHighway';
import { REBEL_GIVE_UP, type CarWashState } from '@/sim/tycoons/roboCarWash';
import { findValue, layerHp } from '@/sim/tycoons/couchCoinMining';

const garageGame = (id: string) => {
  const g = new Game(createInitialState(5, 0));
  g.setFlag('booted');
  g.state.cash = num(1e13);
  g.buyItem('garage_key');
  for (let i = 0; i < 3; i++) g.buyItem('refurb_pc');
  expect(g.unlockTycoon(id)).toBe(true);
  g.setRunning(id, true);
  return g;
};

const maxAll = (g: Game, id: string) => {
  const rt = g.state.tycoons[id]!;
  for (const u of tycoonById(id).upgrades) rt.upgrades[u.id] = u.max!;
};

describe('Hot Dog Highway', () => {
  it('traffic moves around the map during the day', () => {
    expect(traffic('highway', 8)).toBeGreaterThan(traffic('highway', 3) * 3);
    expect(traffic('downtown', 12.5)).toBeGreaterThan(traffic('downtown', 20) * 2);
    expect(bestTiles(8, 1)[0]).not.toBe(bestTiles(21, 1)[0]);
    for (let h = 0; h < 24; h += 0.5) for (const k of new Set(ROADS)) expect(traffic(k, h)).toBeGreaterThan(0);
  });

  it('carts on busy roads sell more than carts on quiet roads', () => {
    const sales = (tile: number, hour: number) => {
      const g = garageGame('hot_dog_highway');
      const rt = g.state.tycoons.hot_dog_highway!;
      const s = rt.state as HotDogState;
      s.carts = [tile];
      s.hour = hour;
      s.stock = 1e6;
      for (let i = 0; i < 10; i++) g.tick(0.1); // one in-game quarter hour
      return rt.lifetime;
    };
    const busy = ROADS.indexOf('highway');
    const quiet = ROADS.indexOf('stadium');
    expect(sales(busy, 8)).toBeGreaterThan(sales(quiet, 8) * 3);
  });

  it('placing carts: moving, removing and the cart cap', () => {
    const g = garageGame('hot_dog_highway');
    const rt = g.state.tycoons.hot_dog_highway!;
    const s = rt.state as HotDogState;
    expect(maxCarts(rt.upgrades)).toBe(1);
    g.action('hot_dog_highway', 'place', 5);
    expect(s.carts).toEqual([5]);
    rt.upgrades.cart = 2;
    g.tick(0.1);
    expect(s.carts.length).toBe(3);
    g.action('hot_dog_highway', 'place', 5);
    expect(s.carts).not.toContain(5);
    g.action('hot_dog_highway', 'smart');
    expect(s.carts.length).toBe(3);
    expect(new Set(s.carts).size).toBe(3);
  });

  it('grilling is the primary action; no stock means missed customers', () => {
    const g = garageGame('hot_dog_highway');
    const s = g.state.tycoons.hot_dog_highway!.state as HotDogState;
    s.stock = 0;
    for (let i = 0; i < 100; i++) g.tick(0.1);
    expect(s.missed).toBeGreaterThan(0);
    g.action('hot_dog_highway', 'grill');
    expect(s.stock).toBeGreaterThan(0);
  });
});

describe('Robo Car Wash', () => {
  it('washes queued cars and loses cars when the lot overflows', () => {
    const g = garageGame('robo_car_wash');
    const s = g.state.tycoons.robo_car_wash!.state as CarWashState;
    g.state.tycoons.robo_car_wash!.upgrades.billboard = 12;
    for (let i = 0; i < 1200; i++) g.tick(0.1);
    expect(s.washed).toBeGreaterThan(5);
    expect(s.lost).toBeGreaterThan(0);
  });

  it('scrubbing speeds up washing', () => {
    const run = (clicks: boolean) => {
      const g = garageGame('robo_car_wash');
      const s = g.state.tycoons.robo_car_wash!.state as CarWashState;
      s.queue = 4;
      for (let i = 0; i < 100; i++) {
        if (clicks && i % 3 === 0) g.action('robo_car_wash', 'scrub');
        g.tick(0.1);
      }
      return s.washed;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('rebel robots stop their bay until rebooted (or they give up)', () => {
    const g = garageGame('robo_car_wash');
    const s = g.state.tycoons.robo_car_wash!.state as CarWashState;
    s.bays[0]!.rebel = 0;
    s.bays[0]!.busy = false;
    s.queue = 3;
    for (let i = 0; i < 50; i++) g.tick(0.1);
    expect(s.washed).toBe(0);
    g.action('robo_car_wash', 'reboot');
    expect(s.bays[0]!.rebel).toBe(-1);
    s.bays[0]!.rebel = 0;
    for (let i = 0; i < (REBEL_GIVE_UP + 2) * 10; i++) g.tick(0.1);
    expect(s.bays[0]!.rebel).toBe(-1);
  });

  it('robots do rebel now and then', () => {
    const g = garageGame('robo_car_wash');
    maxAll(g, 'robo_car_wash');
    g.state.tycoons.robo_car_wash!.upgrades.firewall = 0;
    g.state.tycoons.robo_car_wash!.upgrades.daemon = 0;
    for (let i = 0; i < 3000; i++) g.tick(0.1);
    expect((g.state.tycoons.robo_car_wash!.state as CarWashState).rebellions).toBeGreaterThan(0);
  });
});

describe('Garage games balance', () => {
  /** $/s at exchange rate 1 with everything maxed and the same player (click power 17, 2 clicks/s). */
  const plateau = (id: string) => {
    const g = new Game(createInitialState(5, 0));
    g.setFlag('booted');
    g.state.cash = num(1e13);
    g.buyItem('garage_key');
    for (let i = 0; i < 3; i++) g.buyItem('refurb_pc');
    g.unlockTycoon(id);
    g.setRunning(id, true);
    const rt = g.state.tycoons[id]!;
    for (const u of tycoonById(id).upgrades) rt.upgrades[u.id] = u.max!;
    g.stats.setBase('click.power', 17);
    const prim = tycoonById(id).actions.find((a) => a.primary)!.id;
    const run = (secs: number) => {
      for (let i = 0; i < secs * 10; i++) {
        if (i % 5 === 0) g.action(id, prim);
        if (i % 80 === 0 && id === 'hot_dog_highway') g.action(id, 'smart');
        g.tick(0.1);
      }
    };
    run(1200);
    const a = rt.lifetime;
    run(1200);
    return ((rt.lifetime - a) / 1200) * tycoonById(id).rate;
  };

  it('both games are capped and earn 3–10x the Couch Coin Mining plateau', () => {
    for (const id of ['hot_dog_highway', 'robo_car_wash']) for (const u of tycoonById(id).upgrades) expect(u.max, `${id}.${u.id}`).toBeDefined();
    // Expected value of a fully upgraded couch at the depth a player reaches by the end of the
    // Bedroom (~85), played the same way (finds are too lumpy to measure by simulation).
    const up = Object.fromEntries(tycoonById('couch_coin_mining').upgrades.map((u) => [u.id, u.max!]));
    const dmgPerSec = 2 * 17 * (1 + 0.5 * up.fingers!) + up.vacuum!;
    const rareBoost = 1 + 19 * 0.03 * up.detector!;
    const couch = (dmgPerSec / layerHp(85, up.lift)) * findValue(85, up.flashlight!) * rareBoost * tycoonById('couch_coin_mining').rate;
    const hd = plateau('hot_dog_highway') / couch;
    const cw = plateau('robo_car_wash') / couch;
    expect(hd).toBeGreaterThan(3);
    expect(hd).toBeLessThan(10);
    expect(cw).toBeGreaterThan(3);
    expect(cw).toBeLessThan(10);
    expect(cw).toBeGreaterThan(hd);
  });
});
