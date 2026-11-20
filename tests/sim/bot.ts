import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { ITEMS } from '@/content/items';
import { SKILL_NODES } from '@/content/skilltree';
import { TYCOONS, tycoonById } from '@/sim/tycoons';
import { upgradeCost } from '@/sim/tycoons/framework';

export interface BotReport {
  firstNode?: number;
  duck?: number;
  socks?: number;
  couch?: number;
  garage?: number;
  log: string[];
}

/**
 * A greedy "active player" bot used for balance checks. It clicks a few times
 * per second, buys the cheapest upgrade it can afford, cashes out, picks up all
 * coins and reports occasional mayhem.
 */
export function runBot(maxSeconds: number, clicksPerSecond = 3, seed = 42): BotReport {
  const g = new Game(createInitialState(seed, 0));
  g.setFlag('booted');
  const r: BotReport = { log: [] };
  for (let t = 0; t < maxSeconds; t++) {
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
    if (t % 90 === 45) g.reportChaos((['topple', 'avalanche', 'tower', 'ragdoll'] as const)[(t / 90) % 4 | 0]!);
    for (const def of TYCOONS) if (g.canUnlockTycoon(def.id)) g.unlockTycoon(def.id);
    for (const id of Object.keys(g.state.tycoons)) g.setRunning(id, true);
    const nextUnlock = TYCOONS.find((d) => !g.state.tycoons[d.id])?.unlockCost ?? 1200000;
    const budget = g.state.cash.toNumber() - nextUnlock * 0.5;
    const items = ITEMS.filter((i) => i.id !== 'garage_key' && g.canBuyItem(i.id)).sort((a, b) => g.itemCost(a.id).cmp(g.itemCost(b.id)));
    for (const i of items) if (g.itemCost(i.id).toNumber() <= Math.max(budget, g.state.cash.toNumber() * 0.25)) g.buyItem(i.id);
    if (g.canBuyItem('garage_key')) g.buyItem('garage_key');
    for (const n of SKILL_NODES) if (g.canBuyNode(n.id) && g.buyNode(n.id)) r.firstNode ??= t;
    r.duck ??= g.state.tycoons.rubber_duck_works ? t : undefined;
    r.socks ??= g.state.tycoons.sock_syndicate ? t : undefined;
    r.couch ??= g.state.tycoons.couch_coin_mining ? t : undefined;
    if ((g.state.items.garage_key ?? 0) > 0) {
      r.garage = t;
      break;
    }
    if (t % 300 === 0) r.log.push(`${t / 60}m cash=${g.state.cash.toFixed(0)} click=${g.stat('click.power').toFixed(1)} ex=${g.exchangeRate().toFixed(2)} ` + g.running().map((rt) => `${rt.id.slice(0, 4)}:L${rt.level} life=${rt.lifetime.toFixed(0)} up=${JSON.stringify(rt.upgrades)}`).join(' | '));
  }
  return r;
}

function tuneLemon(g: Game): void {
  const s = g.state.tycoons.lemon_mogul!.state as { price: number; cups: number };
  // Sell near the revenue-optimal price when cups pile up, cheaper when short.
  if (s.cups > 20 && s.price < 1.2) g.action('lemon_mogul', 'priceUp');
  if (s.cups < 2 && s.price > 0.4) g.action('lemon_mogul', 'priceDown');
}
