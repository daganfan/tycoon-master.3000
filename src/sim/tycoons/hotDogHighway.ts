import { defineTycoon, lvl } from './framework';

/** Road types on the little town map. Each one gets busy at different times of day. */
export type RoadKind = 'highway' | 'downtown' | 'suburb' | 'stadium' | 'school' | 'park';

export const GRID_W = 4;
export const GRID_H = 3;
/** The town: a 4×3 grid of road tiles (row-major). */
export const ROADS: readonly RoadKind[] = [
  'suburb', 'highway', 'highway', 'stadium',
  'school', 'downtown', 'downtown', 'highway',
  'park', 'suburb', 'school', 'park',
];

export const ROAD_INFO: Record<RoadKind, { label: string; peak: string }> = {
  highway: { label: 'Highway', peak: 'rush hours 8:00 & 17:30' },
  downtown: { label: 'Downtown', peak: 'lunch 12:30' },
  suburb: { label: 'Suburb', peak: 'evenings 19:00' },
  stadium: { label: 'Stadium', peak: 'game night 21:00' },
  school: { label: 'School', peak: '8:30 & 15:00' },
  park: { label: 'Park', peak: 'afternoons' },
};

/** Real seconds per in-game hour (one day = 96 s). */
export const SECONDS_PER_HOUR = 4;

const bump = (h: number, at: number, w: number): number => {
  // Distance on a 24 h clock so peaks wrap around midnight.
  const d = Math.min(Math.abs(h - at), 24 - Math.abs(h - at));
  return Math.exp(-(d * d) / (2 * w * w));
};

/** Cars per second passing a tile at a given hour. */
export function traffic(kind: RoadKind, hour: number): number {
  switch (kind) {
    case 'highway':
      return 0.4 + 2.6 * (bump(hour, 8, 1.5) + bump(hour, 17.5, 1.5));
    case 'downtown':
      return 0.5 + 2.4 * bump(hour, 12.5, 1.8);
    case 'suburb':
      return 0.3 + 2.1 * bump(hour, 19, 2.2);
    case 'stadium':
      return 0.1 + 3.6 * bump(hour, 21, 1.2);
    case 'school':
      return 0.2 + 2.2 * (bump(hour, 8.5, 0.8) + bump(hour, 15, 0.8));
    case 'park':
      return 0.4 + 1.5 * bump(hour, 15, 3);
  }
}

export interface HotDogState {
  /** In-game clock, 0–24. */
  hour: number;
  /** Tile index of every cart. */
  carts: number[];
  /** Hot dogs ready to sell. */
  stock: number;
  sold: number;
  /** Customers who left because the carts ran out. */
  missed: number;
  /** Sales per tile over the last moment (for the view). */
  heat: number[];
}

export const maxCarts = (up: Record<string, number>): number => 1 + (up.cart ?? 0);
export const dogPrice = (up: Record<string, number>): number => 2.5 * Math.pow(1.22, up.mustard ?? 0);
/** Share of passing cars that stop for a hot dog. */
export const stopShare = (up: Record<string, number>): number => 0.6 * Math.pow(1.2, up.sign ?? 0);

/** Best tiles right now, busiest first. */
export function bestTiles(hour: number, n: number): number[] {
  return ROADS.map((k, i) => ({ i, t: traffic(k, hour) }))
    .sort((a, b) => b.t - a.t)
    .slice(0, n)
    .map((x) => x.i);
}

function placeAll(s: HotDogState, up: Record<string, number>, hour = s.hour): void {
  s.carts = bestTiles(hour, maxCarts(up));
}

export const hotDogHighway = defineTycoon<HotDogState>({
  id: 'hot_dog_highway',
  name: 'Hot Dog Highway',
  tagline: 'Park your carts where the traffic is. Traffic moves. So should you.',
  icon: '🌭',
  color: '#e8572a',
  phase: 'garage',
  unlockCost: 300_000,
  currency: 'H$',
  rate: 3.5,
  upgrades: [
    { id: 'cart', name: 'Extra Cart', desc: '+1 hot dog cart on the map', baseCost: 30, growth: 2.3, max: 5 },
    { id: 'grill', name: 'Bigger Grill', desc: '+2 hot dogs per grill', baseCost: 8, growth: 1.42, max: 10 },
    { id: 'autogrill', name: 'Auto-Grill', desc: '+2 hot dogs/s automatically', baseCost: 20, growth: 1.3, max: 25 },
    { id: 'mustard', name: 'Artisanal Mustard', desc: '+22% hot dog price', baseCost: 50, growth: 1.75, max: 10 },
    { id: 'sign', name: 'Neon Cart Signs', desc: '+20% of drivers stop', baseCost: 40, growth: 1.7, max: 10 },
    { id: 'relish', name: 'Secret Relish', desc: '+0.3 loyal customers/s per cart, any road, any time', baseCost: 120, growth: 2, max: 6 },
    { id: 'radio', name: 'Traffic Radio', desc: 'Carts drive to the busiest roads every in-game hour', baseCost: 300, growth: 1, max: 1 },
  ],
  actions: [
    {
      id: 'grill',
      label: 'Grill!',
      primary: true,
      run: (s, rt, ctx) => {
        s.stock += (2 + 2 * lvl(rt, 'grill')) * ctx.clickPower;
      },
    },
    {
      id: 'place',
      label: 'Move cart',
      grind: false,
      run: (s, rt, _ctx, arg) => {
        const tile = Math.floor(arg ?? -1);
        if (tile < 0 || tile >= ROADS.length) return;
        const at = s.carts.indexOf(tile);
        if (at >= 0) {
          if (s.carts.length > 1) s.carts.splice(at, 1);
          return;
        }
        if (s.carts.length >= maxCarts(rt.upgrades)) s.carts.shift();
        s.carts.push(tile);
      },
    },
    { id: 'smart', label: 'Smart park', grind: false, run: (s, rt) => placeAll(s, rt.upgrades) },
  ],
  init: () => ({ hour: 7, carts: [1], stock: 10, sold: 0, missed: 0, heat: ROADS.map(() => 0) }),
  tick(s, rt, dt, ctx) {
    const t = dt * ctx.speed;
    const before = Math.floor(s.hour);
    s.hour = (s.hour + dt / SECONDS_PER_HOUR) % 24;
    if (lvl(rt, 'radio') > 0 && Math.floor(s.hour) !== before) placeAll(s, rt.upgrades, s.hour + 0.5);
    // A cart bought from the upgrade list rolls out to the best free road on its own.
    while (s.carts.length < maxCarts(rt.upgrades)) {
      const free = bestTiles(s.hour, ROADS.length).find((i) => !s.carts.includes(i));
      if (free === undefined) break;
      s.carts.push(free);
    }
    s.stock += lvl(rt, 'autogrill') * 2 * t;
    const share = stopShare(rt.upgrades);
    const loyal = 0.3 * lvl(rt, 'relish');
    let want = 0;
    const demand = s.carts.map((tile) => {
      const d = (traffic(ROADS[tile]!, s.hour) * share + loyal) * t;
      want += d;
      return d;
    });
    const sold = Math.min(want, s.stock);
    const frac = want > 0 ? sold / want : 0;
    s.heat = s.heat.map((h) => h * Math.pow(0.5, dt));
    s.carts.forEach((tile, i) => (s.heat[tile] = (s.heat[tile] ?? 0) + demand[i]! * frac));
    s.stock -= sold;
    s.sold += sold;
    s.missed += want - sold;
    ctx.earn(sold * dogPrice(rt.upgrades));
  },
});
