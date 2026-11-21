import { ACHIEVEMENTS, achievementById } from '@/content/achievements';

import type { Game } from './game';

/** Things that happen in the 3D world that the sim cares about (achievements, Mom). */
export type WorldEventKind =
  | 'tidy'
  | 'yeet'
  | 'placed'
  | 'shoved'
  | 'windowBroken'
  | 'windowRepaired'
  | 'lightSwitch'
  | 'drawer'
  | 'pcPower'
  | 'door'
  | 'curtains'
  | 'nap';

export interface WorldEvent {
  kind: WorldEventKind;
  /** Stable id / kind of the object involved. */
  object?: string;
  /** Size of the event (objects moved, metres shoved, speed...). */
  value?: number;
}

/** Counters live in state.counters under this prefix (so they persist with the save). */
const C = 'ach.';

/**
 * Achievements: listens to game and world events, keeps a few counters in the
 * save and unlocks trophies (each pays a small token reward, a Golden Token
 * for the big ones).
 */
export class Achievements {
  private switchTimes: number[] = [];
  private checkAcc = 0;

  constructor(private readonly game: Game) {
    const bus = game.bus;
    bus.on('payout', () => this.unlock('cash_money'));
    bus.on('collected', () => {
      if ((game.state.counters.coinsCollected ?? 0) >= 500) this.unlock('penny_pincher');
    });
    bus.on('itemBought', () => this.checkItems());
    bus.on('levelUp', (e) => e.level >= 10 && this.unlock('tycoon_tycoon'));
    bus.on('chaos', (e) => {
      if (e.kind === 'topple' && this.bump('topple') >= 10) this.unlock('butterfingers');
      if (e.kind === 'tower') this.unlock('tower_architect');
      if (e.kind === 'ragdoll') this.unlock('wipeout');
      if (e.kind === 'avalanche') this.unlock('make_it_rain');
    });
    bus.on('world', (e) => this.onWorld(e));
  }

  has(id: string): boolean {
    return this.game.state.achievements.includes(id);
  }

  /** Unlock once; pays the reward. Returns true if it was new. */
  unlock(id: string): boolean {
    const def = achievementById(id);
    if (!def || this.has(id)) return false;
    this.game.state.achievements.push(id);
    this.game.bus.emit('achievement', { id, name: def.name, icon: def.icon, secret: !!def.secret });
    this.game.addTokens(def.reward.token, def.reward.amount, `🏆 ${def.name}`);
    return true;
  }

  progress(): { unlocked: number; total: number } {
    return { unlocked: this.game.state.achievements.filter((id) => achievementById(id)).length, total: ACHIEVEMENTS.length };
  }

  private bump(key: string, by = 1): number {
    const c = this.game.state.counters;
    c[C + key] = (c[C + key] ?? 0) + by;
    return c[C + key]!;
  }

  private onWorld(e: WorldEvent): void {
    const now = this.game.state.time;
    switch (e.kind) {
      case 'tidy':
        if ((e.value ?? 0) > 0 && this.bump('tidy') >= 10) this.unlock('clean_freak');
        break;
      case 'placed':
        if (this.bump('placed') >= 10) this.unlock('feng_shui');
        if (e.object === 'bed' && (e.value ?? 0) > 0.5) this.unlock('interior_designer');
        break;
      case 'shoved':
        if (this.bump('shoved', e.value ?? 0) >= 3) this.unlock('heavy_lifter');
        break;
      case 'yeet':
        this.unlock('yeet');
        break;
      case 'windowBroken':
        this.bump('windows');
        this.unlock('ball_in');
        break;
      case 'lightSwitch':
        this.unlock('lights_out');
        this.switchTimes = [...this.switchTimes.filter((t) => now - t < 5), now];
        if (this.switchTimes.length >= 10) this.unlock('disco');
        break;
      case 'drawer':
        if (e.object === 'sock drawer') this.unlock('snoop');
        break;
      case 'pcPower':
        this.unlock('turn_it_off');
        break;
      case 'nap':
        this.unlock('power_nap');
        break;
      default:
        break;
    }
  }

  private checkItems(): void {
    const items = this.game.state.items;
    let total = 0;
    let decor = 0;
    for (const [id, n] of Object.entries(items)) {
      total += n;
      if (id.startsWith('jm_')) decor += n;
    }
    if (total >= 10) this.unlock('retail_therapy');
    if (decor >= 15) this.unlock('hoarder');
  }

  /** Cheap periodic checks for things that are state, not events. */
  tick(dt: number): void {
    this.checkAcc += dt;
    if (this.checkAcc < 1) return;
    this.checkAcc = 0;
    const g = this.game;
    const s = g.state;
    if (s.flags.includes('booted')) this.unlock('hello_world');
    if (g.running().length >= 3) this.unlock('multitasker');
    if (s.lifetimeCash.gte(1_000_000)) this.unlock('millionaire');
    if (s.flags.includes('garage:entered')) this.unlock('mind_the_gap');
  }
}
