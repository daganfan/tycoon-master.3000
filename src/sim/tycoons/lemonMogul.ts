import { defineTycoon, lvl } from './framework';

export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'heatwave';
export const WEATHER_MULT: Record<Weather, number> = { sunny: 1, cloudy: 0.7, rainy: 0.35, heatwave: 1.6 };

export interface LemonState {
  cups: number;
  price: number;
  weather: Weather;
  weatherTimer: number;
  served: number;
  /** Customers who walked away because there were no cups. */
  missed: number;
}

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
    { id: 'sugar', name: 'More Sugar', desc: 'Customers tolerate x1.12 higher prices', baseCost: 30, growth: 1.7, max: 8 },
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
    { id: 'priceUp', label: '+5¢', run: (s) => void (s.price = Math.min(10, round2(s.price + 0.05))) },
    { id: 'priceDown', label: '-5¢', run: (s) => void (s.price = Math.max(0.05, round2(s.price - 0.05))) },
  ],
  init: () => ({ cups: 5, price: 0.75, weather: 'sunny', weatherTimer: 40, served: 0, missed: 0 }),
  tick(s, rt, dt, ctx) {
    const t = dt * ctx.speed;
    s.weatherTimer -= dt;
    if (s.weatherTimer <= 0) {
      s.weather = ctx.rng.pick<Weather>(['sunny', 'sunny', 'cloudy', 'rainy', 'heatwave']);
      s.weatherTimer = ctx.rng.range(30, 60);
    }
    s.cups += lvl(rt, 'stand') * 0.4 * t;
    const w = WEATHER_MULT[s.weather];
    const customers = 1.2 * w * Math.pow(1.2, lvl(rt, 'sign')) * t;
    const tolerance = w * Math.pow(1.12, lvl(rt, 'sugar'));
    const buyChance = Math.max(0, Math.min(1, 1.5 * tolerance - s.price) / Math.max(1, 1.5 * tolerance));
    const want = customers * buyChance;
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
