import { defineTycoon, lvl } from './framework';
import type { TycoonRuntime } from '@/sim/types';

export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'heatwave';
export const WEATHERS: readonly Weather[] = ['sunny', 'cloudy', 'rainy', 'heatwave'];
/** How many people walk past the stand. Rain thins the crowd but never empties it. */
export const WEATHER_MULT: Record<Weather, number> = { sunny: 1, cloudy: 0.75, rainy: 0.5, heatwave: 1.5 };
/** How much people are willing to pay in each weather (relative to a sunny day). */
export const WEATHER_PRICE: Record<Weather, number> = { sunny: 1, cloudy: 0.85, rainy: 0.7, heatwave: 1.35 };
const WEATHER_TABLE: Weather[] = ['sunny', 'sunny', 'cloudy', 'rainy', 'heatwave'];

export interface LemonState {
  cups: number;
  price: number;
  weather: Weather;
  weatherTimer: number;
  /** The weather after the current one (shown with the forecast keystone). */
  next?: Weather;
  served: number;
  /** Customers who walked away because there were no cups. */
  missed: number;
}

/** Reference price: at this price exactly half of the passers-by buy a cup. */
export function refPrice(weather: Weather, up: Record<string, number>): number {
  let p = 1.0 * WEATHER_PRICE[weather] * Math.pow(1.12, up.sugar ?? 0);
  if (weather === 'heatwave') p *= 1 + 0.08 * (up.ice ?? 0);
  return p;
}

/**
 * Share of customers who buy at `price`. A smooth power-law curve: cheap cups
 * always sell, expensive cups sell less and less, but demand never hits exactly zero.
 */
export function buyChance(price: number, ref: number): number {
  const x = Math.max(0, price) / Math.max(0.01, ref);
  return 1 / (1 + x * x * x * x);
}

/** Revenue-optimal price for the given reference (maximises p * buyChance(p)). */
export const suggestedPrice = (ref: number): number => Math.max(0.05, Math.round(ref * Math.pow(3, -0.25) * 20) / 20);

/** Passers-by per second (before game speed). */
export function customerRate(weather: Weather, up: Record<string, number>): number {
  let c = 1.2 * WEATHER_MULT[weather] * Math.pow(1.2, up.sign ?? 0);
  if (weather === 'heatwave') c *= 1 + 0.25 * (up.ice ?? 0);
  if (weather === 'rainy' || weather === 'cloudy') c *= 1 + 0.3 * (up.umbrella ?? 0);
  // Regulars show up whatever the weather.
  return c + 0.25 * (up.recipe ?? 0);
}

export const lemonSuggested = (rt: TycoonRuntime): number => {
  const s = rt.state as LemonState;
  return suggestedPrice(refPrice(s.weather, rt.upgrades));
};

export const lemonMogul = defineTycoon<LemonState>({
  id: 'lemon_mogul',
  name: 'Lemon Mogul',
  tagline: 'Pricing vs. weather. Squeeze to win.',
  icon: '🍋',
  color: '#f5d63d',
  phase: 'bedroom',
  unlockCost: 0,
  currency: 'L$',
  rate: 1,
  upgrades: [
    { id: 'pitcher', name: 'Bigger Pitcher', desc: '+1 cup per squeeze', baseCost: 4, growth: 1.4, max: 10 },
    { id: 'stand', name: 'Extra Stand', desc: '+0.4 cups/s automatically', baseCost: 8, growth: 1.3, max: 15 },
    { id: 'sign', name: 'Cardboard Sign', desc: 'x1.2 customers', baseCost: 15, growth: 1.6, max: 10 },
    { id: 'sugar', name: 'More Sugar', desc: 'Customers pay x1.12 more', baseCost: 30, growth: 1.7, max: 8 },
    { id: 'umbrella', name: 'Umbrella Stand', desc: '+30% customers when cloudy or rainy', baseCost: 25, growth: 1.8, max: 5 },
    { id: 'ice', name: 'Ice Machine', desc: 'Heatwaves: +25% customers, +8% price', baseCost: 45, growth: 1.9, max: 5 },
    { id: 'recipe', name: "Grandma's Recipe", desc: '+0.25 loyal regulars/s, rain or shine', baseCost: 60, growth: 2, max: 6 },
  ],
  actions: [
    {
      id: 'squeeze',
      label: 'Squeeze!',
      primary: true,
      run: (s, rt, ctx) => {
        s.cups += (1 + lvl(rt, 'pitcher')) * ctx.clickPower;
      },
    },
    { id: 'priceUp', label: '+5¢', grind: false, run: (s) => void (s.price = Math.min(10, round2(s.price + 0.05))) },
    { id: 'priceDown', label: '-5¢', grind: false, run: (s) => void (s.price = Math.max(0.05, round2(s.price - 0.05))) },
    { id: 'priceSuggested', label: 'Suggested', grind: false, run: (s, rt) => void (s.price = suggestedPrice(refPrice(s.weather, rt.upgrades))) },
  ],
  init: () => ({ cups: 5, price: 0.75, weather: 'sunny', weatherTimer: 40, next: 'sunny', served: 0, missed: 0 }),
  tick(s, rt, dt, ctx) {
    const t = dt * ctx.speed;
    s.weatherTimer -= dt;
    s.next ??= ctx.rng.pick(WEATHER_TABLE);
    if (s.weatherTimer <= 0) {
      s.weather = s.next;
      s.next = ctx.rng.pick(WEATHER_TABLE);
      s.weatherTimer = ctx.rng.range(30, 60);
      // Weather Forecasts keystone: the stand re-prices itself for the new weather.
      if (ctx.flag('lemon.forecast')) s.price = suggestedPrice(refPrice(s.weather, rt.upgrades));
    }
    if (!Number.isFinite(s.price) || s.price <= 0) s.price = 0.75;
    s.cups += lvl(rt, 'stand') * 0.4 * t;
    const customers = customerRate(s.weather, rt.upgrades) * t;
    const want = customers * buyChance(s.price, refPrice(s.weather, rt.upgrades));
    const sold = Math.min(want, s.cups);
    s.cups -= sold;
    s.served += sold;
    s.missed += want - sold;
    ctx.earn(sold * s.price);
  },
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
