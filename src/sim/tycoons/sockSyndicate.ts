import { defineTycoon, lvl } from './framework';

export const SOCK_COLORS = ['#e94b4b', '#4b8be9', '#3fc46a', '#f0f0f0'] as const;

export interface SockState {
  bin: number[];
  lost: number;
  pairs: number;
  arrivals: number;
  autoAcc: number;
  darnAcc?: number;
  /** Pairs stitched together from lost socks. */
  darned?: number;
}

export const binCapacity = (b: number): number => 10 + 8 * b;
export const pairPrice = (f: number): number => 1.6 * (1 + 0.3 * f);
export const lostPrice = (scent: number): number => 0.15 + 0.1 * scent;

function matchPairs(s: SockState, max: number): number {
  let made = 0;
  for (let c = 0; c < s.bin.length && made < max; c++) {
    while ((s.bin[c] ?? 0) >= 2 && made < max) {
      s.bin[c] = (s.bin[c] ?? 0) - 2;
      made++;
    }
  }
  s.pairs += made;
  return made;
}

export const sockSyndicate = defineTycoon<SockState>({
  id: 'sock_syndicate',
  name: 'Sock Syndicate',
  tagline: 'Every lost sock is a business opportunity.',
  icon: '🧦',
  color: '#b06ae0',
  phase: 'bedroom',
  unlockCost: 1200,
  currency: 'S$',
  rate: 10,
  upgrades: [
    { id: 'dryer', name: 'Industrial Dryer', desc: '+0.6 socks/s', baseCost: 10, growth: 1.3, max: 20 },
    { id: 'sorter', name: 'Sorting Hamster', desc: 'Auto-matches 0.3 pairs/s', baseCost: 40, growth: 1.32, max: 25 },
    { id: 'bin', name: 'Bigger Bin', desc: '+8 bin capacity', baseCost: 20, growth: 1.5, max: 12 },
    { id: 'fashion', name: 'Designer Labels', desc: '+30% pair price', baseCost: 60, growth: 1.7, max: 10 },
    { id: 'darning', name: 'Sock Darning', desc: 'Stitches 2 lost socks into a pair (0.2/s), sold at half price', baseCost: 50, growth: 1.8, max: 5 },
    { id: 'scent', name: 'Fresh Scent', desc: 'Lost socks sell for +S$0.10 each', baseCost: 30, growth: 1.8, max: 5 },
  ],
  actions: [
    {
      id: 'match',
      label: 'Match pairs',
      primary: true,
      run: (s, rt, ctx) => {
        const made = matchPairs(s, 2 * ctx.clickPower);
        ctx.earn(made * pairPrice(lvl(rt, 'fashion')));
      },
    },
    {
      id: 'sellLost',
      label: 'Sell lost socks',
      run: (s, rt, ctx) => {
        if (s.lost < 1) return;
        ctx.earn(s.lost * lostPrice(lvl(rt, 'scent')));
        if (s.lost >= 10) ctx.spawn('sock');
        s.lost = 0;
      },
    },
  ],
  init: () => ({ bin: [0, 0, 0, 0], lost: 0, pairs: 0, arrivals: 0, autoAcc: 0, darnAcc: 0, darned: 0 }),
  tick(s, rt, dt, ctx) {
    const t = dt * ctx.speed;
    s.arrivals += (0.6 + 0.6 * lvl(rt, 'dryer')) * t;
    const whole = Math.floor(s.arrivals);
    s.arrivals -= whole;
    if (whole > 40) {
      const each = Math.floor(whole / 4);
      for (let c = 0; c < 4; c++) s.bin[c] = (s.bin[c] ?? 0) + each;
      for (let i = 0; i < whole - each * 4; i++) bump(s, ctx.rng.int(0, 3));
    } else {
      for (let i = 0; i < whole; i++) bump(s, ctx.rng.int(0, 3));
    }
    // Keystone: matching bots triple the hamsters' output and run even without any.
    const bots = ctx.flag('socks.autoMatch') ? 1 + lvl(rt, 'sorter') * 2 : 0;
    s.autoAcc += (lvl(rt, 'sorter') + bots) * 0.3 * t;
    const auto = Math.floor(s.autoAcc);
    if (auto > 0) {
      s.autoAcc -= auto;
      ctx.earn(matchPairs(s, auto) * pairPrice(lvl(rt, 'fashion')));
    }
    const darn = lvl(rt, 'darning');
    if (darn > 0 && s.lost >= 2) {
      s.darnAcc = (s.darnAcc ?? 0) + darn * 0.2 * t;
      const n = Math.min(Math.floor(s.darnAcc), Math.floor(s.lost / 2));
      if (n > 0) {
        s.darnAcc -= n;
        s.lost -= 2 * n;
        s.darned = (s.darned ?? 0) + n;
        ctx.earn(n * pairPrice(lvl(rt, 'fashion')) * 0.5);
      }
    }
    if (ctx.flag('socks.autoMatch') && s.lost >= 20) {
      ctx.earn(s.lost * lostPrice(lvl(rt, 'scent')));
      s.lost = 0;
    }
    const cap = binCapacity(lvl(rt, 'bin'));
    let total = s.bin.reduce((a, b) => a + b, 0);
    while (total > cap) {
      const c = s.bin.indexOf(Math.max(...s.bin));
      s.bin[c] = (s.bin[c] ?? 0) - 1;
      s.lost++;
      total--;
    }
  },
});

function bump(s: SockState, c: number): void {
  s.bin[c] = (s.bin[c] ?? 0) + 1;
}
