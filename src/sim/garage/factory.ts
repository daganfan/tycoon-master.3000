import { num, type Num } from '@/core/num';
import {
  PADS, REBIRTH_REQUIRES, ROBOT_INTERVAL, STAR_BONUS, padById, rebirthCost, type LineId, type PadDef,
} from '@/content/garage';
import type { Game } from '../game';

/** Saved garage progress (GameState.garage). */
export interface GarageState {
  /** Pads built in the current run (reset by rebirth). */
  pads: string[];
  /** Money melted in the furnace, waiting to be collected. */
  tank: number;
  /** Rebirths done (Factory Stars). */
  stars: number;
  /** Lifetime factory earnings (all runs). */
  lifetime: number;
  /** Times the tank was emptied (by you or the robot). */
  collects: number;
  /** Seconds since the Robo-Helper last emptied the tank. */
  robotT: number;
}

export const createGarageState = (): GarageState => ({ pads: [], tank: 0, stars: 0, lifetime: 0, collects: 0, robotT: 0 });

export type PadStatus = 'built' | 'available' | 'locked';
export type PayoutSource = 'pad' | 'robot' | 'rebirth';

/**
 * The physical factory's economy. Production is modelled analytically
 * (Σ dropper rate × value × Π upgraders × speed × global bonus) so tests and
 * offline earnings work without the 3D world. While the world runs the real
 * physical items, it sets `live` and deposits each item's value itself, and
 * the analytic production is switched off to avoid double counting.
 */
export class GarageSim {
  /** Runtime only: the 3D world is producing physical scrap. */
  live = false;

  constructor(private readonly g: Game) {}

  get s(): GarageState {
    return this.g.state.garage;
  }

  unlocked(): boolean {
    return (this.g.state.items.garage_key ?? 0) > 0;
  }

  has(id: string): boolean {
    return this.s.pads.includes(id);
  }

  padStatus(id: string): PadStatus {
    if (this.has(id)) return 'built';
    const def = padById(id);
    if (!def || !this.unlocked()) return 'locked';
    return def.requires.every((r) => this.has(r)) ? 'available' : 'locked';
  }

  /** Pads you can step on right now. */
  available(): PadDef[] {
    return PADS.filter((p) => this.padStatus(p.id) === 'available');
  }

  padCost(id: string): number {
    return padById(id)?.cost ?? Infinity;
  }

  canBuyPad(id: string): boolean {
    return this.padStatus(id) === 'available' && this.g.state.cash.gte(this.padCost(id));
  }

  buyPad(id: string): boolean {
    if (!this.canBuyPad(id)) return false;
    this.g.state.cash = this.g.state.cash.sub(this.padCost(id));
    this.s.pads.push(id);
    const def = padById(id)!;
    this.g.bus.emit('garagePad', { id });
    this.g.bus.emit('notify', { text: `🔧 Built: ${def.name}`, tone: 'good' });
    return true;
  }

  /* ---------------- production math ---------------- */

  /** Multiplier on dropper rates (speed pads × grease). */
  speedMult(): number {
    let m = this.g.stat('garage.speed');
    for (const p of PADS) if (p.kind === 'speed' && this.has(p.id)) m *= p.mult ?? 1;
    return m;
  }

  /** Bonus on every item's value: Factory Stars × decor × items/skills. */
  globalMult(): number {
    let m = (1 + STAR_BONUS * this.s.stars) * this.g.stat('garage.mult');
    for (const p of PADS) if (p.kind === 'decor' && this.has(p.id)) m *= p.mult ?? 1;
    return m;
  }

  /** Product of the upgraders built on a line. */
  lineMult(line: LineId): number {
    let m = 1;
    for (const p of PADS) if (p.kind === 'upgrader' && p.line === line && this.has(p.id)) m *= p.upgrader!.mult;
    return m;
  }

  /** A line carries scrap to money only if its belt and the furnace are built. */
  lineWorks(line: LineId): boolean {
    return this.has('furnace') && PADS.some((p) => p.kind === 'belt' && p.line === line && this.has(p.id));
  }

  /** Items per second a built dropper produces. */
  dropRate(id: string): number {
    const d = padById(id)?.dropper;
    return d && this.has(id) ? d.rate * this.speedMult() : 0;
  }

  /** Value of a freshly dropped item (before upgraders). */
  itemValue(id: string): number {
    return (padById(id)?.dropper?.value ?? 0) * this.globalMult();
  }

  /** Analytic income in $/s (what the furnace receives if nothing falls off). */
  rate(): number {
    let total = 0;
    for (const p of PADS) {
      if (p.kind !== 'dropper' || !p.line || !this.has(p.id) || !this.lineWorks(p.line)) continue;
      total += this.dropRate(p.id) * this.itemValue(p.id) * this.lineMult(p.line);
    }
    return total;
  }

  robotInterval(): number {
    return ROBOT_INTERVAL * this.g.stat('garage.robot');
  }

  /* ---------------- flow ---------------- */

  tick(dt: number): void {
    if (!this.unlocked()) return;
    if (!this.live) this.addToTank(this.rate() * dt);
    if (this.has('robot')) {
      this.s.robotT += dt;
      if (this.s.robotT >= this.robotInterval()) {
        this.s.robotT = 0;
        if (this.s.tank > 0) this.collect('robot');
      }
    }
  }

  private addToTank(v: number): void {
    if (!(v > 0)) return;
    this.s.tank += v;
    this.s.lifetime += v;
  }

  /** The world's furnace melted a physical item worth `value`. */
  deposit(value: number): void {
    if (!this.unlocked()) return;
    this.addToTank(value);
    this.g.state.counters.scrapMelted = (this.g.state.counters.scrapMelted ?? 0) + 1;
  }

  /** Empty the tank: the money becomes physical cash on the floor (like a cash-out). */
  collect(source: PayoutSource = 'pad'): Num {
    const amount = num(Math.floor(this.s.tank * 100) / 100);
    if (amount.lte(0)) return num(0);
    this.s.tank = 0;
    this.s.collects++;
    this.g.state.floorCash = this.g.state.floorCash.add(amount);
    this.g.bus.emit('garagePayout', { amount, source });
    return amount;
  }

  /* ---------------- rebirth ---------------- */

  rebirthCost(): number {
    return rebirthCost(this.s.stars);
  }

  rebirthReady(): boolean {
    return this.unlocked() && REBIRTH_REQUIRES.every((id) => this.has(id));
  }

  canRebirth(): boolean {
    return this.rebirthReady() && this.g.state.cash.gte(this.rebirthCost());
  }

  /**
   * Tear the factory down for a permanent Factory Star (+75% factory income
   * each), a Pixel Token, and a Golden Token the very first time.
   */
  rebirth(): boolean {
    if (!this.canRebirth()) return false;
    this.g.state.cash = this.g.state.cash.sub(this.rebirthCost());
    if (this.s.tank > 0) this.collect('rebirth');
    this.s.pads = [];
    this.s.robotT = 0;
    this.s.stars++;
    this.g.addTokens('pixel', 1, 'Factory rebirth');
    if (this.s.stars === 1) this.g.addTokens('golden', 1, 'First factory rebirth!');
    this.g.bus.emit('garageRebirth', { stars: this.s.stars });
    this.g.bus.emit('notify', { text: `⭐ REBIRTH! Factory Star ${this.s.stars}: scrap is worth x${(1 + STAR_BONUS * this.s.stars).toFixed(2)}`, tone: 'token' });
    return true;
  }

  /* ---------------- offline ---------------- */

  /** Time away: the factory keeps melting; a Robo-Helper pays it out. Returns cash paid to the floor. */
  offline(seconds: number): Num {
    if (!this.unlocked() || seconds <= 0) return num(0);
    this.addToTank(this.rate() * seconds);
    return this.has('robot') ? this.collect('robot') : num(0);
  }
}
