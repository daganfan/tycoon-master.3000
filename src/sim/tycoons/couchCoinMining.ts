import { defineTycoon, lvl } from './framework';

const FINDS = ['a coin', 'a french fry', 'a TV remote', 'a hair tie', 'a LEGO brick', 'a mystery crumb',
  'a bottle cap', 'a guitar pick', 'an ancient receipt', 'a tiny dinosaur', 'a lost earring', 'a golden ticket'];

export interface CouchState {
  depth: number;
  hp: number;
  maxHp: number;
  lastFind: string;
  finds: number;
  rares?: number;
}

export const layerHp = (depth: number, lift = 0): number => 6 * Math.pow(1.11, depth) * Math.pow(0.92, lift);
const RARE = ['a vintage arcade token', 'a diamond-ish ring', 'a sealed trading card', 'a gold-plated spork'];
export const findValue = (depth: number, flash: number): number => 0.2 * Math.pow(1.115, depth) * (1 + 0.15 * flash);

export const couchCoinMining = defineTycoon<CouchState>({
  id: 'couch_coin_mining',
  name: 'Couch Coin Mining',
  tagline: 'Dig deeper into the cushions. Find treasure. Find crumbs.',
  icon: '🛋️',
  color: '#c0773a',
  phase: 'bedroom',
  unlockCost: 20000,
  currency: 'C¢',
  rate: 4,
  upgrades: [
    { id: 'fingers', name: 'Nimble Fingers', desc: '+0.5 dig power', baseCost: 8, growth: 1.45, max: 10 },
    { id: 'vacuum', name: 'Handheld Vacuum', desc: '+1 auto-dig/s', baseCost: 15, growth: 1.3, max: 25 },
    { id: 'flashlight', name: 'Flashlight', desc: '+15% find value', baseCost: 50, growth: 1.7, max: 10 },
    { id: 'detector', name: 'Metal Detector', desc: '+3% chance per layer of a rare find worth x20', baseCost: 80, growth: 2, max: 5 },
    { id: 'lift', name: 'Cushion Lift', desc: 'Layers are 8% softer', baseCost: 40, growth: 1.9, max: 5 },
  ],
  actions: [
    {
      id: 'dig',
      label: 'Dig!',
      primary: true,
      run: (s, rt, ctx) => {
        s.hp -= (1 + 0.5 * lvl(rt, 'fingers')) * ctx.clickPower;
        resolve(s, rt.upgrades, ctx);
      },
    },
  ],
  init: () => ({ depth: 0, hp: layerHp(0), maxHp: layerHp(0), lastFind: 'nothing yet', finds: 0 }),
  tick(s, rt, dt, ctx) {
    s.hp -= lvl(rt, 'vacuum') * dt * ctx.speed;
    resolve(s, rt.upgrades, ctx);
  },
});

function resolve(
  s: CouchState,
  up: Record<string, number>,
  ctx: { earn(n: number): void; rng: { pick<T>(a: readonly T[]): T; chance(p: number): boolean }; spawn(k: string): void },
): void {
  let guard = 0;
  while (s.hp <= 0 && guard++ < 1000) {
    const rare = ctx.rng.chance(0.03 * (up.detector ?? 0));
    ctx.earn(findValue(s.depth, up.flashlight ?? 0) * (rare ? 20 : 1));
    s.finds++;
    s.depth++;
    s.lastFind = rare ? `✨ ${ctx.rng.pick(RARE)}!` : ctx.rng.pick(FINDS);
    if (rare) s.rares = (s.rares ?? 0) + 1;
    if (s.depth % 25 === 0) ctx.spawn('remote');
    const over = -s.hp;
    s.maxHp = layerHp(s.depth, up.lift ?? 0);
    s.hp = s.maxHp - over;
  }
}
