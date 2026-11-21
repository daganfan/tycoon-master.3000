import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { ITEMS } from '@/content/items';
import { SKILL_NODES } from '@/content/skilltree';
import { TYCOONS, tycoonById } from '@/sim/tycoons';
import { upgradeCost } from '@/sim/tycoons/framework';
import { lemonSuggested } from '@/sim/tycoons/lemonMogul';

export interface BotReport {
  firstNode?: number;
  duck?: number;
  socks?: number;
  couch?: number;
  garage?: number;
  /** Tokens earned over the whole run, per kind. */
  earned: { grind: number; mogul: number; chaos: number };
  log: string[];
}

/**
 * A greedy "active player" bot used for balance checks. It clicks a few times
 * per second, buys the cheapest upgrade it can afford, cashes out, picks up all
 * coins and causes occasional, realistic mayhem through the Chaos Meter.
 */
export function runBot(maxSeconds: number, clicksPerSecond = 3, seed = 42): BotReport {
  const { g, r } = newBotGame(seed);
  for (let t = 0; t < maxSeconds; t++) {
    if (botSecond(g, r, t, clicksPerSecond)) break;
  }
  return r;
}

export function newBotGame(seed: number): { g: Game; r: BotReport } {
  const g = new Game(createInitialState(seed, 0));
  g.setFlag('booted');
  const r: BotReport = { log: [], earned: { grind: 0, mogul: 0, chaos: 0 } };
  g.bus.on('token', (e) => {
    if (e.token === 'grind' || e.token === 'mogul' || e.token === 'chaos') r.earned[e.token] += e.amount;
  });
  return { g, r };
}

/** One simulated second of the Bedroom bot. Returns true once the Garage Key is bought. */
export function botSecond(g: Game, r: BotReport, t: number, clicksPerSecond: number): boolean {
  {
    const newest = Object.keys(g.state.tycoons).at(-1)!;
    g.focused = newest;
    for (const rt of g.running()) {
      const def = tycoonById(rt.id);
      if (rt.id === newest) for (let c = 0; c < clicksPerSecond; c++) g.action(rt.id, def.actions.find((a) => a.primary)!.id);
      if (rt.id === 'rubber_duck_works') g.action(rt.id, 'unjam');
      if (rt.id === 'sock_syndicate' && t % 30 === 0) g.action(rt.id, 'sellLost');
      if (rt.id === 'lemon_mogul') tuneLemon(g);
    }
    for (let k = 0; k < 10; k++) g.tick(0.1);
    // Spend inside games, keeping some money to cash out.
    for (const rt of g.running()) {
      const def = tycoonById(rt.id);
      for (let guard = 0; guard < 20; guard++) {
        const opts = def.upgrades
          .filter((u) => u.max === undefined || (rt.upgrades[u.id] ?? 0) < u.max)
          .map((u) => ({ u, cost: upgradeCost(u, rt.upgrades[u.id] ?? 0) }))
          .sort((a, b) => a.cost - b.cost);
        const best = opts[0];
        if (!best || best.cost > rt.money * 0.6) break;
        g.buyTycoonUpgrade(rt.id, best.u.id);
      }
      if (t % 20 === 0) g.cashOut(rt.id);
    }
    g.collectAll();
    simulateMayhem(g, t);
    for (const def of TYCOONS) if (g.canUnlockTycoon(def.id)) g.unlockTycoon(def.id);
    for (const id of Object.keys(g.state.tycoons)) g.setRunning(id, true);
    // A game that is bought but has no screen to run on: get another screen first.
    if (Object.values(g.state.tycoons).some((rt) => !rt.installed))
      for (const screen of ['used_monitor', 'refurb_pc']) if (g.canBuyItem(screen) && g.buyItem(screen)) break;
    const nextUnlock = TYCOONS.find((d) => !g.state.tycoons[d.id] && g.phaseOpen(d.phase))?.unlockCost ?? 2000000;
    const budget = g.state.cash.toNumber() - nextUnlock * 0.5;
    const items = ITEMS.filter((i) => i.category !== 'key' && g.canBuyItem(i.id)).sort((a, b) => g.itemCost(a.id).cmp(g.itemCost(b.id)));
    for (const i of items) if (g.itemCost(i.id).toNumber() <= Math.max(budget, g.state.cash.toNumber() * 0.25)) g.buyItem(i.id);
    if (g.canBuyItem('garage_key')) g.buyItem('garage_key');
    for (const n of SKILL_NODES) if (g.canBuyNode(n.id) && g.buyNode(n.id)) r.firstNode ??= t;
    r.duck ??= g.state.tycoons.rubber_duck_works ? t : undefined;
    r.socks ??= g.state.tycoons.sock_syndicate ? t : undefined;
    r.couch ??= g.state.tycoons.couch_coin_mining ? t : undefined;
    if ((g.state.items.garage_key ?? 0) > 0) {
      r.garage = t;
      return true;
    }
    if (t % 300 === 0) r.log.push(`${t / 60}m tok=${JSON.stringify(g.state.tokens)} nodes=${g.state.nodes.length} cash=${g.state.cash.toFixed(0)} click=${g.stat('click.power').toFixed(1)} ex=${g.exchangeRate().toFixed(2)} ` + g.running().map((rt) => `${rt.id.slice(0, 4)}:L${rt.level} life=${rt.lifetime.toFixed(0)} up=${JSON.stringify(rt.upgrades)}`).join(' | '));
  }
  return false;
}

const MAYHEM_OBJECTS = ['chair', 'monitor', 'pc', 'desk', 'cardboard_boxes#0', 'used_monitor#0', 'lava_lamp#0', 'desk_fan#0'];

/**
 * A realistic amount of physics mayhem for a player who mostly plays the games:
 * knocks something over every ~40s (cycling through what is in the room),
 * takes a real fall now and then, and causes a coin avalanche after big cash-outs.
 * Everything goes through the Chaos Meter, so diminishing returns apply.
 */
function simulateMayhem(g: Game, t: number): void {
  if (t % 40 === 20) {
    const objs = MAYHEM_OBJECTS.filter((o) => !o.includes('#') || (g.state.items[o.split('#')[0]!] ?? 0) > 0);
    g.reportChaos('topple', { magnitude: 1.2, object: objs[(t / 40) % objs.length | 0]! });
  }
  if (t % 150 === 75) g.reportChaos('ragdoll', { magnitude: 1.7 });
  if (t % 120 === 60 && g.state.lifetimeCash.gt(50)) g.reportChaos('avalanche', { magnitude: 20 });
  if (t % 300 === 150 && (g.state.items.cardboard_boxes ?? 0) >= 3) g.reportChaos('tower', { magnitude: 1.4, object: `cardboard_boxes#${(t / 300) % 3 | 0}` });
}

function tuneLemon(g: Game): void {
  const rt = g.state.tycoons.lemon_mogul!;
  const s = rt.state as { price: number; cups: number };
  // Follow the suggested price; go a bit higher when cups pile up, cheaper when short.
  const target = lemonSuggested(rt) * (s.cups > 20 ? 1.15 : s.cups < 2 ? 0.8 : 1);
  if (s.price < target - 0.04) g.action('lemon_mogul', 'priceUp');
  else if (s.price > target + 0.04) g.action('lemon_mogul', 'priceDown');
}
