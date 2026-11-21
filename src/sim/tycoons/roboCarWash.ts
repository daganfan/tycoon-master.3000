import { defineTycoon, lvl } from './framework';

export interface Bay {
  /** Seconds of washing done on the current car (0 = empty bay). */
  progress: number;
  busy: boolean;
  /** Seconds the robot has been rebelling, or -1 if it behaves. */
  rebel: number;
  /** What this robot is protesting about. */
  demand: string;
}

export interface CarWashState {
  /** Cars waiting in the lot. */
  queue: number;
  arrivals: number;
  bays: Bay[];
  washed: number;
  /** Cars that drove off because the lot was full. */
  lost: number;
  rebellions: number;
}

export const DEMANDS = ['WANTS A RAISE', 'IS UNIONIZING', 'WATCHING CAT VIDEOS', 'DEMANDS WEEKENDS', 'IS "UPDATING"', 'WROTE A MANIFESTO', 'REFUSES TO RINSE'];
/** A rebel robot gives up and goes back to work after this long (so income never stalls). */
export const REBEL_GIVE_UP = 40;

export const bayCount = (up: Record<string, number>): number => 1 + (up.bay ?? 0);
export const washTime = (up: Record<string, number>): number => 8 / (1 + 0.25 * (up.brushes ?? 0));
export const carPrice = (up: Record<string, number>): number => 12 * Math.pow(1.25, up.wax ?? 0);
export const arrivalRate = (up: Record<string, number>): number => 0.25 * Math.pow(1.2, up.billboard ?? 0);
export const lotSize = (up: Record<string, number>): number => 4 + 3 * (up.lot ?? 0);
export const rebelChance = (up: Record<string, number>): number => 0.04 / (1 + 0.6 * (up.firewall ?? 0));

const newBay = (): Bay => ({ progress: 0, busy: false, rebel: -1, demand: '' });

function finish(s: CarWashState, bay: Bay, up: Record<string, number>, ctx: { earn(n: number): void; rng: { chance(p: number): boolean; pick<T>(a: readonly T[]): T }; notify(t: string): void; spawn(k: string): void }): void {
  bay.busy = false;
  bay.progress = 0;
  s.washed++;
  ctx.earn(carPrice(up));
  if (ctx.rng.chance(rebelChance(up))) {
    bay.rebel = 0;
    bay.demand = ctx.rng.pick(DEMANDS);
    s.rebellions++;
    ctx.notify(`🤖 A wash robot ${bay.demand.toLowerCase()}! Reboot it.`);
    if (s.rebellions % 5 === 0) ctx.spawn('sock');
  }
}

function fill(s: CarWashState): void {
  for (const b of s.bays) {
    if (s.queue < 1) return;
    if (!b.busy && b.rebel < 0) {
      b.busy = true;
      b.progress = 0;
      s.queue--;
    }
  }
}

export const roboCarWash = defineTycoon<CarWashState>({
  id: 'robo_car_wash',
  name: 'Robo Car Wash',
  tagline: 'Throughput is king. The robots disagree.',
  icon: '🤖',
  color: '#2bb3e0',
  phase: 'garage',
  unlockCost: 8_000_000,
  currency: 'W$',
  rate: 17,
  upgrades: [
    { id: 'bay', name: 'Extra Wash Bay', desc: '+1 bay with its own robot', baseCost: 40, growth: 2.4, max: 5 },
    { id: 'brushes', name: 'Turbo Brushes', desc: '+25% wash speed', baseCost: 15, growth: 1.5, max: 10 },
    { id: 'billboard', name: 'Billboard', desc: '+20% cars arriving', baseCost: 25, growth: 1.45, max: 12 },
    { id: 'wax', name: 'Premium Wax', desc: '+25% price per car', baseCost: 60, growth: 1.7, max: 10 },
    { id: 'lot', name: 'Bigger Lot', desc: '+3 cars can wait in line', baseCost: 20, growth: 1.8, max: 6 },
    { id: 'firewall', name: 'Robot Firewall', desc: 'Robots rebel less often', baseCost: 50, growth: 1.9, max: 6 },
    { id: 'daemon', name: 'Reboot Daemon', desc: 'Rebel robots reboot themselves after 5 s', baseCost: 400, growth: 1, max: 1 },
  ],
  actions: [
    {
      id: 'scrub',
      label: 'Scrub!',
      primary: true,
      run: (s, rt, ctx) => {
        fill(s);
        // A manual scrub pushes every working bay along by a second (times click power).
        for (const b of s.bays) if (b.busy && b.rebel < 0) b.progress += 1.2 * ctx.clickPower;
        for (const b of s.bays) if (b.busy && b.progress >= washTime(rt.upgrades)) finish(s, b, rt.upgrades, ctx);
        fill(s);
      },
    },
    {
      id: 'reboot',
      label: 'Reboot robots',
      run: (s, _rt, ctx) => {
        let n = 0;
        for (const b of s.bays)
          if (b.rebel >= 0) {
            b.rebel = -1;
            b.demand = '';
            n++;
          }
        if (n) ctx.notify(`🔌 Rebooted ${n} robot${n > 1 ? 's' : ''}. They forgot everything.`);
      },
    },
  ],
  init: () => ({ queue: 2, arrivals: 0, bays: [newBay()], washed: 0, lost: 0, rebellions: 0 }),
  tick(s, rt, dt, ctx) {
    const up = rt.upgrades;
    const t = dt * ctx.speed;
    while (s.bays.length < bayCount(up)) s.bays.push(newBay());
    s.arrivals += arrivalRate(up) * t;
    const whole = Math.floor(s.arrivals);
    s.arrivals -= whole;
    s.queue += whole;
    const cap = lotSize(up);
    if (s.queue > cap) {
      s.lost += s.queue - cap;
      s.queue = cap;
    }
    const wt = washTime(up);
    for (const b of s.bays) {
      if (b.rebel >= 0) {
        b.rebel += dt;
        if ((lvl(rt, 'daemon') > 0 && b.rebel > 5) || b.rebel > REBEL_GIVE_UP) {
          b.rebel = -1;
          b.demand = '';
        }
        continue;
      }
      if (!b.busy) continue;
      b.progress += t;
      // Fast washes can finish several cars per tick (offline / high speed).
      let guard = 0;
      while (b.busy && b.progress >= wt && guard++ < 100) {
        const over = b.progress - wt;
        finish(s, b, up, ctx);
        if (b.rebel >= 0 || s.queue < 1) break;
        b.busy = true;
        b.progress = over;
        s.queue--;
      }
    }
    fill(s);
  },
});
