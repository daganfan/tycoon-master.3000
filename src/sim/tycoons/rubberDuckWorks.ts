import { defineTycoon, lvl } from './framework';

export interface DuckState {
  jammed: boolean;
  jamMeter: number;
  made: number;
  jamTimer: number;
}

export const duckPrice = (q: number): number => 0.6 * (1 + 0.25 * q);
export const beltMult = (b: number): number => 1 + 0.3 * b;

export const rubberDuckWorks = defineTycoon<DuckState>({
  id: 'rubber_duck_works',
  name: 'Rubber Duck Works',
  tagline: 'An assembly line where the ducks fight back.',
  icon: '🦆',
  color: '#ffcc2e',
  phase: 'bedroom',
  unlockCost: 120,
  currency: 'Q¢',
  rate: 0.8,
  upgrades: [
    { id: 'mold', name: 'Duck Mold', desc: '+0.35 ducks/s', baseCost: 10, growth: 1.32, max: 20 },
    { id: 'belt', name: 'Faster Belt', desc: '+30% speed, but more jams', baseCost: 30, growth: 1.7, max: 6 },
    { id: 'quality', name: 'Premium Rubber', desc: '+25% duck price', baseCost: 45, growth: 1.75, max: 8 },
    { id: 'antijam', name: 'Grease Gun', desc: 'Fewer jams', baseCost: 25, growth: 1.7, max: 8 },
  ],
  actions: [
    {
      id: 'squeak',
      label: 'Squeak one out',
      primary: true,
      run: (s, rt, ctx) => {
        if (s.jammed) return;
        const n = ctx.clickPower;
        s.made += n;
        ctx.earn(n * duckPrice(lvl(rt, 'quality')));
      },
    },
    {
      id: 'unjam',
      label: 'Unjam!',
      run: (s, _rt, ctx) => {
        if (!s.jammed) return;
        s.jammed = false;
        s.jamMeter = 0;
        ctx.notify('Belt unjammed. The ducks are free.');
      },
    },
  ],
  init: () => ({ jammed: false, jamMeter: 0, made: 0, jamTimer: 0 }),
  tick(s, rt, dt, ctx) {
    if (s.jammed) {
      s.jamTimer += dt;
      if (ctx.flag('autoUnjam') && s.jamTimer > 5) {
        s.jammed = false;
        s.jamMeter = 0;
      }
      return;
    }
    const belt = beltMult(lvl(rt, 'belt'));
    const produced = lvl(rt, 'mold') * 0.35 * belt * dt * ctx.speed;
    s.made += produced;
    ctx.earn(produced * duckPrice(lvl(rt, 'quality')));
    s.jamMeter += (produced * 0.015 * belt) / (1 + 0.6 * lvl(rt, 'antijam'));
    if (s.jamMeter >= 1) {
      s.jammed = true;
      s.jamTimer = 0;
      for (let i = 0; i < 3; i++) ctx.spawn('duck');
      ctx.notify('🦆 DUCK JAM! Ducks are escaping the screen!');
    }
  },
});
