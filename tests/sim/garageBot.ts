import type { Game } from '@/sim/game';
import { PADS } from '@/content/garage';
import { tycoonById } from '@/sim/tycoons';
import { botSecond, newBotGame, type BotReport } from './bot';

export interface GarageReport extends BotReport {
  /** Seconds after the Garage Key. */
  firstPad?: number;
  hotdog?: number;
  carwash?: number;
  robot?: number;
  rebirths: number[];
  /** $/s from Couch Coin Mining over the last 30 min before the key (actively played). */
  couchRate: number;
  /** $/s per garage game over the last 30 min of the run (played passively). */
  gameRates: Record<string, number>;
  lease?: number;
  /** Factory income ($/s) and total income snapshots. */
  glog: string[];
}

/**
 * Plays the Bedroom like the balance bot, buys the Garage Key, then keeps going:
 * builds factory pads greedily, empties the tank by hand every 30 s until the
 * Robo-Helper does it, installs the garage games, rebirths whenever it can and
 * finally saves up for the LAN Café Lease.
 */
export function runGarageBot(maxGarageSeconds: number, clicksPerSecond = 1.5, seed = 42): GarageReport {
  const { g, r } = newBotGame(seed);
  const out: GarageReport = { ...r, rebirths: [], glog: [], couchRate: 0, gameRates: {} };
  let t = 0;
  const couchAt: number[] = [];
  for (; t < 4 * 3600; t++) {
    couchAt[t] = g.state.tycoons.couch_coin_mining?.lifetime ?? 0;
    if (botSecond(g, out, t, clicksPerSecond)) break;
  }
  out.couchRate = ((couchAt[t]! - couchAt[t - 1800]!) / 1800) * tycoonById('couch_coin_mining').rate * g.exchangeRate();
  const hist: Record<string, number[]> = {};
  const key = t;
  let lastLife = g.state.lifetimeCash.toNumber();
  let lastFactory = 0;
  const lastT: Record<string, number> = {};
  for (const rt of g.running()) lastT[rt.id] = rt.lifetime;
  g.setFlag('garage:entered');
  for (let s = 1; s <= maxGarageSeconds; s++) {
    botSecond(g, out, key + s, clicksPerSecond);
    garageSecond(g, s);
    out.firstPad ??= g.state.garage.pads.length > 0 ? s : undefined;
    out.hotdog ??= g.state.tycoons.hot_dog_highway ? s : undefined;
    out.carwash ??= g.state.tycoons.robo_car_wash ? s : undefined;
    out.robot ??= g.garage.has('robot') ? s : undefined;
    for (const id of ['hot_dog_highway', 'robo_car_wash']) (hist[id] ??= [])[s] = g.state.tycoons[id]?.lifetime ?? 0;
    if (g.garage.canRebirth() && g.garage.rebirth()) out.rebirths.push(s);
    if (g.canBuyItem('lan_lease') && g.buyItem('lan_lease')) {
      out.lease = s;
      break;
    }
    if (s % 600 === 0) {
      const life = g.state.lifetimeCash.toNumber();
      const fac = g.garage.s.lifetime;
      out.glog.push(
        `${Math.round(s / 60)}m cash=${g.state.cash.toExponential(2)} income=${((life - lastLife) / 600).toExponential(2)}/s factory=${((fac - lastFactory) / 600).toExponential(2)}/s stars=${g.garage.s.stars} pads=${g.garage.s.pads.length} slots=${g.slotsUsed()}/${g.slots()} ` +
          g.running().map((rt) => `${rt.id.slice(0, 4)}:L${rt.level}:${((rt.lifetime - (lastT[rt.id] ?? 0)) / 600 * tycoonById(rt.id).rate * g.exchangeRate()).toExponential(1)}`).join(' '),
      );
      lastLife = life;
      for (const rt of g.running()) lastT[rt.id] = rt.lifetime;
      lastFactory = fac;
    }
  }
  out.garage = key;
  const end = out.lease ?? maxGarageSeconds;
  for (const id of ['hot_dog_highway', 'robo_car_wash'])
    out.gameRates[id] = (((hist[id]![end] ?? 0) - (hist[id]![end - 1800] ?? 0)) / 1800) * tycoonById(id).rate * g.exchangeRate();
  return out;
}

function garageSecond(g: Game, s: number): void {
  const hd = g.state.tycoons.hot_dog_highway;
  if (hd && s % 8 === 0) g.action('hot_dog_highway', 'smart');
  if (g.state.tycoons.robo_car_wash) g.action('robo_car_wash', 'reboot');
  // Walk over and step on the COLLECT pad now and then (the robot takes over later).
  if (!g.garage.has('robot') && s % 30 === 0) g.garage.collect('pad');
  g.collectAll();
  // Build pads: cheapest first, but keep enough for the next game install.
  const reserve = !g.state.tycoons.hot_dog_highway ? 300_000 * 0.5 : !g.state.tycoons.robo_car_wash ? 8_000_000 * 0.5 : 0;
  for (const p of [...PADS].sort((a, b) => a.cost - b.cost)) {
    if (g.garage.padStatus(p.id) !== 'available') continue;
    if (p.cost <= 50_000 || g.state.cash.toNumber() - p.cost >= reserve) g.garage.buyPad(p.id);
  }
}
