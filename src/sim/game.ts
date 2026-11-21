import { EventBus } from '@/core/events';
import { num, type Num } from '@/core/num';
import { Rng } from '@/core/rng';
import { Stats, type StatModifier } from '@/core/stats';
import { ITEMS, itemById } from '@/content/items';
import { SKILL_NODES, nodeById } from '@/content/skilltree';
import { COSMETICS, cosmeticById } from '@/content/cosmetics';
import { QUESTS } from '@/content/quests';
import { TYCOONS, tycoonById } from './tycoons';
import { createRuntime, upgradeCost, xpForLevel } from './tycoons/framework';
import { BASE_STATS, createInitialState } from './state';
import { GarageSim, type PayoutSource } from './garage/factory';
import { SCREEN_ITEMS, screenIdsFor, type DeskState } from './desk';
import type {
  ChaosInfo, ChaosKind, CosmeticTarget, GameState, Phase, TokenCost, TokenId, TycoonCtx, TycoonDef, TycoonRuntime,
} from './types';

export interface GameEvents extends Record<string, unknown> {
  notify: { text: string; tone: 'info' | 'good' | 'warn' | 'token' };
  payout: { tycoonId: string; amount: Num };
  collected: { amount: Num; coins: number };
  token: { token: TokenId; amount: number; reason: string };
  spawn: { kind: string; tycoonId: string };
  levelUp: { tycoonId: string; level: number };
  itemBought: { id: string; count: number };
  nodeBought: { id: string };
  cosmeticsChanged: Record<string, never>;
  questDone: { id: string };
  tycoonInstalled: { id: string };
  respec: Record<string, never>;
  chaos: { kind: ChaosKind; points: number; meter: number; need: number };
  garagePad: { id: string };
  garagePayout: { amount: Num; source: PayoutSource };
  garageRebirth: { stars: number };
}

/** Base Chaos Meter points per unit of magnitude, and the cap for a single event. */
const CHAOS_BASE: Record<ChaosKind, { per: number; cap: number }> = {
  topple: { per: 16, cap: 45 },
  avalanche: { per: 1, cap: 35 },
  tower: { per: 12, cap: 40 },
  ragdoll: { per: 11, cap: 40 },
};
/** Half-life (s) of the "you did that already" fatigue. */
const CHAOS_FATIGUE_HALFLIFE = 60;
const CHAOS_LABEL: Record<ChaosKind, string> = { topple: 'Knocked it over!', avalanche: 'Coin avalanche!', tower: 'Tower of junk!', ragdoll: 'Epic wipeout!' };

const AUTO_CASHOUT_INTERVAL = 10;

export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly stats = new Stats(BASE_STATS);
  readonly rng: Rng;
  /** Phase 2: the physical factory in the garage. */
  readonly garage = new GarageSim(this);
  /** Which tycoon the player is currently focused on (runtime only). */
  focused: string | null = null;
  private ctxCache = new Map<string, TycoonCtx>();
  private autoAcc = 0;
  private macroAcc = 0;
  private cashoutAcc = 0;
  /** Mayhem bookkeeping (runtime only): last time per key, and decaying fatigue values. */
  private chaosFatigue = new Map<string, { v: number; t: number }>();
  private chaosReady = new Map<string, number>();

  constructor(public state: GameState = createInitialState()) {
    this.rng = new Rng(state.rngState);
    if (!state.tycoons.lemon_mogul) {
      const rt = createRuntime(tycoonById('lemon_mogul'), this.rng);
      state.tycoons.lemon_mogul = rt;
    }
    this.rebuildStats();
    this.syncDesk(false);
  }

  /* ---------------- stats ---------------- */

  rebuildStats(): void {
    this.stats.clearSources();
    for (const [id, count] of Object.entries(this.state.items)) {
      const def = itemById(id);
      if (!def || count <= 0) continue;
      this.stats.setSource(`item:${id}`, scaleMods(def.mods, count), def.flags ?? []);
    }
    for (const id of this.state.nodes) this.applyNode(id);
    this.applyCosmeticStats();
  }

  private applyNode(id: string): void {
    const def = nodeById(id);
    if (!def) return;
    const mods: StatModifier[] = [];
    const flags: string[] = [];
    for (const e of def.effects) {
      if ('flag' in e) flags.push(e.flag);
      else mods.push(e);
    }
    this.stats.setSource(`node:${id}`, mods, flags);
  }

  private applyCosmeticStats(): void {
    const mods: StatModifier[] = [];
    for (const eq of Object.values(this.state.cosmetics.equipped)) {
      for (const id of [eq?.skin, ...(eq?.mods ?? [])]) {
        const d = id ? cosmeticById(id) : undefined;
        if (d?.mods) mods.push(...d.mods);
      }
    }
    this.stats.setSource('cosmetics', mods);
  }

  stat(name: string): number {
    return this.stats.get(name);
  }

  flag(name: string): boolean {
    return this.stats.flag(name);
  }

  exchangeRate(): number {
    return this.stat('exchange.rate') * (1 + 0.03 * this.stat('vibe'));
  }

  /** Where the exchange rate comes from (multipliers that multiply to exchangeRate()). */
  exchangeBreakdown(): { label: string; mult: number }[] {
    const ex = (mods: StatModifier[] | undefined, n = 1) =>
      (mods ?? []).reduce((a, m) => (m.stat === 'exchange.rate' && m.op === 'mult' ? a * Math.pow(m.value, n) : a), 1);
    let skills = 1;
    for (const id of this.state.nodes) skills *= ex(nodeById(id)?.effects.filter((e): e is StatModifier => 'stat' in e));
    let gear = 1;
    for (const [id, n] of Object.entries(this.state.items)) gear *= ex(itemById(id)?.mods, n);
    const total = this.stat('exchange.rate') / (BASE_STATS['exchange.rate']! * skills * gear);
    return [
      { label: 'Starting rate', mult: BASE_STATS['exchange.rate']! },
      { label: 'Skills (Business tree…)', mult: skills },
      { label: 'Gear (eBuy items)', mult: gear },
      { label: 'Cosmetics', mult: total },
      { label: `Vibe ${formatVibe(this.stat('vibe'))} (+3% each)`, mult: 1 + 0.03 * this.stat('vibe') },
    ];
  }

  /* ---------------- tick ---------------- */

  tick(dt: number): void {
    const s = this.state;
    s.time += dt;
    this.syncDesk();
    // Nothing runs until the crusty PC has been switched on.
    const booted = s.flags.includes('booted');
    for (const rt of booted ? this.running() : []) {
      const def = tycoonById(rt.id);
      def.tick(rt.state, rt, dt, this.ctx(rt));
    }
    if (this.flag('autoclick') && this.focused) {
      this.autoAcc += dt * 3 * this.stat('os.speed');
      while (this.autoAcc >= 1) {
        this.autoAcc--;
        this.pressPrimary(this.focused, false);
      }
    }
    if (this.flag('macro')) {
      this.macroAcc += dt * this.stat('macro.rate') * this.stat('os.speed');
      while (this.macroAcc >= 1) {
        this.macroAcc--;
        for (const rt of this.running()) this.pressPrimary(rt.id, false);
      }
    }
    if (this.flag('autoCashout')) {
      this.cashoutAcc += dt;
      if (this.cashoutAcc >= AUTO_CASHOUT_INTERVAL / this.stat('os.speed')) {
        this.cashoutAcc = 0;
        for (const rt of this.running()) if (rt.money > 0) this.cashOut(rt.id);
      }
    }
    this.garage.tick(dt);
    this.checkLevels();
    this.checkQuests();
    s.rngState = this.rng.state;
  }

  running(): TycoonRuntime[] {
    return Object.values(this.state.tycoons).filter((t) => t.installed);
  }

  private ctx(rt: TycoonRuntime): TycoonCtx {
    let c = this.ctxCache.get(rt.id);
    if (!c) {
      const stat = (n: string) => this.stat(n);
      c = {
        rng: this.rng,
        get speed() {
          return stat('tycoon.speed');
        },
        get clickPower() {
          return stat('click.power');
        },
        earn: (amount: number) => {
          const r = this.state.tycoons[rt.id];
          if (!r || amount <= 0) return;
          r.money += amount;
          r.lifetime += amount;
        },
        spawn: (kind: string) => this.bus.emit('spawn', { kind, tycoonId: rt.id }),
        notify: (text: string) => this.bus.emit('notify', { text, tone: 'info' }),
        flag: (name: string) => this.flag(name),
      };
      this.ctxCache.set(rt.id, c);
    }
    return c;
  }

  private checkLevels(): void {
    for (const rt of Object.values(this.state.tycoons)) {
      while (rt.lifetime >= xpForLevel(rt.level)) {
        rt.level++;
        this.addTokens('mogul', 1, `${tycoonById(rt.id).name} reached level ${rt.level}`);
        this.bus.emit('levelUp', { tycoonId: rt.id, level: rt.level });
      }
    }
  }

  private checkQuests(): void {
    // Quests complete in order: only the current one is checked.
    for (const q of QUESTS) {
      if (this.state.quests.includes(q.id)) continue;
      if (!q.done(this.state)) break;
      this.state.quests.push(q.id);
      if (q.reward > 0) this.addCash(num(q.reward));
      this.bus.emit('questDone', { id: q.id });
      this.bus.emit('notify', { text: `✅ ${q.title}${q.reward ? ` (+$${q.reward})` : ''}`, tone: 'good' });
    }
  }

  activeQuest() {
    return QUESTS.find((q) => !this.state.quests.includes(q.id));
  }

  /* ---------------- player commands ---------------- */

  setFlag(flag: string): void {
    if (!this.state.flags.includes(flag)) this.state.flags.push(flag);
  }

  /** Run a mini-tycoon action. Manual presses count toward Grind Tokens. */
  action(tycoonId: string, actionId: string, arg?: number): boolean {
    const rt = this.state.tycoons[tycoonId];
    if (!rt?.installed) return false;
    const def = tycoonById(tycoonId);
    const a = def.actions.find((x) => x.id === actionId);
    if (!a) return false;
    a.run(rt.state, rt, this.ctx(rt), arg);
    // Lucky clicks: a manual press of the main button sometimes counts several times.
    if (a.primary && this.rng.chance(this.stat('crit.chance'))) {
      for (let i = 0; i < Math.floor(this.stat('crit.mult')); i++) a.run(rt.state, rt, this.ctx(rt), arg);
    }
    if (a.grind !== false) this.countManual();
    return true;
  }

  private pressPrimary(tycoonId: string, manual: boolean): void {
    const rt = this.state.tycoons[tycoonId];
    if (!rt?.installed) return;
    const a = tycoonById(tycoonId).actions.find((x) => x.primary);
    a?.run(rt.state, rt, this.ctx(rt));
    if (manual) this.countManual();
  }

  private countManual(): void {
    const c = this.state.counters;
    c.manual = (c.manual ?? 0) + 1;
    c.grindProgress = (c.grindProgress ?? 0) + 1;
    if (c.grindProgress >= this.grindNeeded()) {
      c.grindProgress -= this.grindNeeded();
      c.grindEarned = (c.grindEarned ?? 0) + 1;
      this.addTokens('grind', 1, 'Hustle');
    }
  }

  /** Manual actions needed for the next Grind Token (rises steeply as you earn more). */
  grindNeeded(): number {
    const earned = this.state.counters.grindEarned ?? 0;
    return Math.max(10, Math.round(this.stat('grind.threshold') * (1 + 0.12 * earned) * Math.pow(1.04, earned)));
  }

  buyTycoonUpgrade(tycoonId: string, upgradeId: string): boolean {
    const rt = this.state.tycoons[tycoonId];
    if (!rt) return false;
    const u = tycoonById(tycoonId).upgrades.find((x) => x.id === upgradeId);
    if (!u) return false;
    const level = rt.upgrades[upgradeId] ?? 0;
    if (u.max !== undefined && level >= u.max) return false;
    const cost = upgradeCost(u, level);
    if (rt.money < cost) return false;
    rt.money -= cost;
    rt.upgrades[upgradeId] = level + 1;
    return true;
  }

  cashOutValue(tycoonId: string): Num {
    const rt = this.state.tycoons[tycoonId];
    if (!rt) return num(0);
    // Keystone: coins split when they hit the floor (+25% Cash).
    const split = this.flag('coins.split') ? 1.25 : 1;
    return num(rt.money * tycoonById(tycoonId).rate * this.exchangeRate() * split);
  }

  /** True when the next cash-out is a doubled "lucky tenth" (keystone). */
  nextCashoutDoubled(): boolean {
    return this.flag('cashout.tenth') && ((this.state.counters.cashouts ?? 0) + 1) % 10 === 0;
  }

  /** Convert a game's internal money into physical Cash on the floor. */
  cashOut(tycoonId: string): Num {
    const rt = this.state.tycoons[tycoonId];
    let amount = this.cashOutValue(tycoonId);
    if (!rt || amount.lte(0)) return num(0);
    if (this.nextCashoutDoubled()) {
      amount = amount.mul(2);
      this.bus.emit('notify', { text: '🎰 Lucky tenth cash-out: doubled!', tone: 'good' });
    }
    rt.money = 0;
    this.state.floorCash = this.state.floorCash.add(amount);
    this.state.counters.cashouts = (this.state.counters.cashouts ?? 0) + 1;
    this.bus.emit('payout', { tycoonId, amount });
    return amount;
  }

  /** Physical cash picked up in the world. */
  collect(amount: Num, coins = 1): void {
    const take = amount.gt(this.state.floorCash) ? this.state.floorCash : amount;
    if (take.lte(0)) return;
    this.state.floorCash = this.state.floorCash.sub(take);
    const gained = take.mul(this.stat('pickup.mult'));
    this.addCash(gained);
    this.state.counters.coinsCollected = (this.state.counters.coinsCollected ?? 0) + coins;
    this.bus.emit('collected', { amount: gained, coins });
  }

  collectAll(): void {
    this.collect(this.state.floorCash, 1);
  }

  addCash(amount: Num): void {
    this.state.cash = this.state.cash.add(amount);
    this.state.lifetimeCash = this.state.lifetimeCash.add(amount);
  }

  addTokens(token: TokenId, amount: number, reason: string): void {
    this.state.tokens[token] += amount;
    this.bus.emit('token', { token, amount, reason });
  }

  /* ---- shop ---- */

  itemCost(id: string): Num {
    const def = itemById(id);
    if (!def) return num(Infinity);
    const owned = this.state.items[id] ?? 0;
    return num(Math.ceil(def.baseCost * Math.pow(def.growth, owned) * this.stat('shop.discount')));
  }

  /** Has the player reached this phase (bought its key)? */
  phaseOpen(phase: Phase): boolean {
    return phase === 'bedroom' || this.state.flags.includes(`phase:${phase}`);
  }

  canBuyItem(id: string): boolean {
    const def = itemById(id);
    if (!def || !this.phaseOpen(def.phase)) return false;
    return (this.state.items[id] ?? 0) < def.max && this.state.cash.gte(this.itemCost(id));
  }

  buyItem(id: string): boolean {
    if (!this.canBuyItem(id)) return false;
    const def = itemById(id)!;
    this.state.cash = this.state.cash.sub(this.itemCost(id));
    const count = (this.state.items[id] = (this.state.items[id] ?? 0) + 1);
    this.stats.setSource(`item:${id}`, scaleMods(def.mods, count), def.flags ?? []);
    if ((SCREEN_ITEMS as readonly string[]).includes(id)) {
      // A new screen: put a game that is not running on it (or the Task Manager).
      const sid = `${id}#${count - 1}`;
      const idle = Object.values(this.state.tycoons).find((t) => !t.installed);
      this.openApp(sid, idle?.id ?? 'taskmgr');
    }
    this.syncDesk();
    if (id === 'garage_key') {
      this.setFlag('phase:garage');
      this.bus.emit('notify', { text: '🔑 The Garage is open! Walk through the bedroom door.', tone: 'good' });
    }
    this.bus.emit('itemBought', { id, count });
    return true;
  }

  /* ---- screens, windows & what runs (see desk.ts) ---- */

  /** Every screen in the room: the main PC, each Second-hand Monitor and each Refurbished PC. */
  screenIds(): string[] {
    return screenIdsFor(this.state.items);
  }

  /** Windows each screen can show at once (TycoonOS 95 = 1, XP = 2, …). */
  windowsPerScreen(): number {
    return 1 + Math.max(0, Math.floor(this.stat('os.tier')));
  }

  /** Background slots: how many minimized games keep running. */
  slots(): number {
    return Math.max(0, Math.floor(this.stat('slots')));
  }

  /** Background slots in use. */
  slotsUsed(): number {
    return Math.min(this.slots(), this.state.desk.min.length);
  }

  /** Most games that can run at once: every window on every screen + background slots. */
  capacity(): number {
    return this.screenIds().length * this.windowsPerScreen() + this.slots();
  }

  /** Open windows on a screen (oldest first; the last is in front). */
  windowsOn(screenId: string): string[] {
    return (this.state.desk.screens[screenId] ??= []);
  }

  isTycoon(appId: string): boolean {
    return !!this.state.tycoons[appId];
  }

  isRunning(id: string): boolean {
    return !!this.state.tycoons[id]?.installed;
  }

  /** Where a game is right now. */
  whereIs(id: string): { screen: string } | { minimized: true; running: boolean } | null {
    for (const sid of this.screenIds()) if (this.windowsOn(sid).includes(id)) return { screen: sid };
    const i = this.state.desk.min.indexOf(id);
    if (i >= 0) return { minimized: true, running: i < this.slots() };
    return null;
  }

  /** First screen (preferring `prefer`) that has a free window. */
  freeScreen(prefer?: string): string | null {
    const ids = this.screenIds();
    const order = prefer && ids.includes(prefer) ? [prefer, ...ids.filter((i) => i !== prefer)] : ids;
    return order.find((sid) => this.windowsOn(sid).length < this.windowsPerScreen()) ?? null;
  }

  /**
   * What opening `appId` on `screenId` would do: which window gets pushed out
   * (minimized if it is a game, closed otherwise) and which running games would
   * pause because of it.
   */
  planOpen(screenId: string, appId: string): { evict: string | null; pauses: string[] } {
    const before = new Set(this.running().map((r) => r.id));
    const snapshot = JSON.stringify(this.state.desk);
    const evict = this.openUnsynced(screenId, appId);
    const after = new Set(this.computeRunning());
    this.state.desk = JSON.parse(snapshot) as DeskState;
    return { evict, pauses: [...before].filter((id) => !after.has(id)) };
  }

  /** Open an app (or bring it to the front) in a window on a screen. A game moves here from wherever it was. */
  openApp(screenId: string, appId: string): boolean {
    if (!this.screenIds().includes(screenId)) return false;
    this.openUnsynced(screenId, appId);
    this.syncDesk();
    return true;
  }

  private openUnsynced(screenId: string, appId: string): string | null {
    const desk = this.state.desk;
    const win = this.windowsOn(screenId);
    if (this.isTycoon(appId)) {
      for (const sid of Object.keys(desk.screens)) if (sid !== screenId) desk.screens[sid] = desk.screens[sid]!.filter((w) => w !== appId);
      desk.min = desk.min.filter((m) => m !== appId);
    }
    const at = win.indexOf(appId);
    if (at >= 0) {
      win.splice(at, 1);
      win.push(appId);
      return null;
    }
    let evict: string | null = null;
    while (win.length >= this.windowsPerScreen()) {
      evict = win.shift()!;
      if (this.isTycoon(evict)) desk.min.push(evict);
    }
    win.push(appId);
    return evict;
  }

  /**
   * Close a window. A closed game stops. If that frees a window, the most
   * recently minimized paused game comes back into it.
   */
  closeApp(screenId: string, appId: string): void {
    const desk = this.state.desk;
    const win = this.windowsOn(screenId);
    desk.screens[screenId] = win.filter((w) => w !== appId);
    if (this.isTycoon(appId)) desk.min = desk.min.filter((m) => m !== appId);
    this.restorePaused(screenId);
    this.syncDesk();
  }

  /** Minimize a game to the taskbar: it keeps running only if a background slot is free. */
  minimizeApp(screenId: string, appId: string): void {
    const desk = this.state.desk;
    desk.screens[screenId] = this.windowsOn(screenId).filter((w) => w !== appId);
    if (this.isTycoon(appId) && !desk.min.includes(appId)) desk.min.push(appId);
    this.syncDesk();
  }

  /** Stop a game wherever it is (Task Manager / App Store). */
  stopGame(id: string): void {
    const desk = this.state.desk;
    for (const sid of Object.keys(desk.screens)) desk.screens[sid] = desk.screens[sid]!.filter((w) => w !== id);
    desk.min = desk.min.filter((m) => m !== id);
    this.syncDesk();
  }

  private restorePaused(screenId: string): void {
    const desk = this.state.desk;
    const win = this.windowsOn(screenId);
    const paused = desk.min.slice(this.slots());
    const back = paused.at(-1);
    if (back && win.length < this.windowsPerScreen()) {
      desk.min = desk.min.filter((m) => m !== back);
      win.unshift(back);
    }
  }

  /**
   * Start (or stop) a game without pushing anything else out: opens it on a
   * screen with a free window, else minimizes it into a free background slot.
   * Returns false when everything is full.
   */
  setRunning(id: string, on: boolean): boolean {
    const rt = this.state.tycoons[id];
    if (!rt) return false;
    if (!on) {
      this.stopGame(id);
      return true;
    }
    if (rt.installed) return true;
    const sid = this.freeScreen();
    if (sid) return this.openApp(sid, id);
    if (this.state.desk.min.length < this.slots()) {
      this.state.desk.min = this.state.desk.min.filter((m) => m !== id);
      this.state.desk.min.unshift(id);
      this.syncDesk();
      return this.isRunning(id);
    }
    return false;
  }

  private computeRunning(): string[] {
    const desk = this.state.desk;
    const out: string[] = [];
    for (const sid of this.screenIds()) for (const w of desk.screens[sid] ?? []) if (this.isTycoon(w) && !out.includes(w)) out.push(w);
    for (const m of desk.min.slice(0, this.slots())) if (this.isTycoon(m) && !out.includes(m)) out.push(m);
    return out;
  }

  /** Recompute which games run; announces games that pause. */
  syncDesk(announce = true): void {
    const desk = this.state.desk;
    const cap = this.windowsPerScreen();
    for (const sid of Object.keys(desk.screens)) {
      const win = desk.screens[sid]!;
      while (win.length > cap) {
        const out = win.shift()!;
        if (this.isTycoon(out) && !desk.min.includes(out)) desk.min.push(out);
      }
    }
    desk.min = desk.min.filter((m, i) => this.isTycoon(m) && desk.min.indexOf(m) === i);
    const on = new Set(this.computeRunning());
    for (const rt of Object.values(this.state.tycoons)) {
      const now = on.has(rt.id);
      if (now === rt.installed) continue;
      rt.installed = now;
      // Only pauses are announced (starting a game is something you just did yourself).
      if (announce && !now) this.bus.emit('notify', { text: `⏸️ ${tycoonById(rt.id).name} paused: not open on any screen`, tone: 'warn' });
    }
  }

  canUnlockTycoon(id: string): boolean {
    const def = TYCOONS.find((t) => t.id === id);
    if (!def || this.state.tycoons[id] || !this.phaseOpen(def.phase)) return false;
    return this.state.cash.gte(def.unlockCost);
  }

  /** Buy a game. It starts closed: open it on a screen to make it run. */
  unlockTycoon(id: string): boolean {
    if (!this.canUnlockTycoon(id)) return false;
    const def = tycoonById(id);
    this.state.cash = this.state.cash.sub(def.unlockCost);
    const rt = createRuntime(def as TycoonDef<unknown>, this.rng);
    this.state.tycoons[id] = rt;
    this.bus.emit('tycoonInstalled', { id });
    this.bus.emit('notify', { text: `${def.icon} ${def.name} installed!`, tone: 'good' });
    return true;
  }

  /* ---- skill tree ---- */

  nodeState(id: string): 'owned' | 'available' | 'locked' | 'hidden' {
    if (this.state.nodes.includes(id)) return 'owned';
    const def = nodeById(id);
    if (!def) return 'locked';
    if (def.phaseLocked && !this.state.flags.includes(`phase:${def.phaseLocked}`)) return 'hidden';
    const reachable = def.requires.some((r) => this.state.nodes.includes(r));
    if (!reachable) return def.hidden ? 'hidden' : 'locked';
    return 'available';
  }

  canAfford(cost: TokenCost, discount = 1): boolean {
    return Object.entries(cost).every(([t, v]) => this.state.tokens[t as TokenId] >= Math.ceil(v * discount));
  }

  canBuyNode(id: string): boolean {
    const def = nodeById(id);
    return !!def && this.nodeState(id) === 'available' && this.canAfford(def.cost);
  }

  buyNode(id: string): boolean {
    if (!this.canBuyNode(id)) return false;
    const def = nodeById(id)!;
    for (const [t, v] of Object.entries(def.cost)) this.state.tokens[t as TokenId] -= v;
    this.state.nodes.push(id);
    this.applyNode(id);
    this.syncDesk();
    this.bus.emit('nodeBought', { id });
    return true;
  }

  respecCost(): Num {
    const n = this.state.nodes.length - 1;
    return num(25 * n * n);
  }

  respec(): boolean {
    const cost = this.respecCost();
    if (this.state.nodes.length <= 1 || this.state.cash.lt(cost)) return false;
    this.state.cash = this.state.cash.sub(cost);
    for (const id of this.state.nodes) {
      const def = nodeById(id);
      if (!def) continue;
      for (const [t, v] of Object.entries(def.cost)) this.state.tokens[t as TokenId] += v;
    }
    this.state.nodes = ['root'];
    this.rebuildStats();
    this.syncDesk();
    this.bus.emit('respec', {});
    return true;
  }

  /* ---- chaos ---- */

  /** Chaos Meter points needed for the next Chaos Token (grows with each one earned). */
  chaosNeeded(): number {
    const earned = this.state.counters.chaosEarned ?? 0;
    return Math.max(20, Math.round(100 * Math.pow(1.3, earned) * this.stat('chaos.need')));
  }

  private fatigue(key: string, bump: number): number {
    const now = this.state.time;
    const f = this.chaosFatigue.get(key);
    const halfLife = CHAOS_FATIGUE_HALFLIFE / Math.max(0.1, this.stat('chaos.decay'));
    const v = f ? f.v * Math.pow(0.5, (now - f.t) / halfLife) : 0;
    this.chaosFatigue.set(key, { v: v + bump, t: now });
    return v;
  }

  /**
   * Called by the physics world when mayhem happens. Adds points to the Chaos
   * Meter based on the event's magnitude, with diminishing returns for
   * repeating the same kind of event and the same object. A Chaos Token drops
   * when the meter fills. Returns the points added (0 if it didn't count).
   */
  reportChaos(kind: ChaosKind, info: ChaosInfo = {}): number {
    const obj = info.object ?? '*';
    const key = `${kind}:${obj}`;
    const now = this.state.time;
    if (now < (this.chaosReady.get(key) ?? -Infinity)) return 0;
    const base = CHAOS_BASE[kind];
    const mag = Math.max(0, info.magnitude ?? 1);
    let pts = Math.min(base.cap, base.per * mag);
    if (pts < 1) return 0;
    this.chaosReady.set(key, now + this.stat('chaos.cooldown'));
    const kindF = this.fatigue(`k:${kind}`, 1);
    const objF = obj === '*' ? 0 : this.fatigue(`o:${obj}`, 1);
    pts /= 1 + 0.45 * kindF + 0.9 * objF;
    pts *= this.stat('chaos.mult');
    if (kind === 'topple') pts *= this.stat('chaos.topple');
    if (kind === 'ragdoll') pts *= this.stat('chaos.ragdoll');
    pts = Math.round(pts * 10) / 10;
    if (pts <= 0) return 0;
    const c = this.state.counters;
    c.chaosEvents = (c.chaosEvents ?? 0) + 1;
    c.chaosMeter = (c.chaosMeter ?? 0) + pts;
    let need = this.chaosNeeded();
    while (c.chaosMeter >= need) {
      c.chaosMeter -= need;
      c.chaosEarned = (c.chaosEarned ?? 0) + 1;
      this.addTokens('chaos', 1, CHAOS_LABEL[kind]);
      need = this.chaosNeeded();
    }
    this.bus.emit('chaos', { kind, points: pts, meter: c.chaosMeter, need });
    return pts;
  }

  /* ---- cosmetics ---- */

  cosmeticCost(id: string): TokenCost {
    const def = cosmeticById(id);
    const d = this.stat('cosmetic.discount');
    const out: TokenCost = {};
    for (const [t, v] of Object.entries(def?.cost ?? {})) out[t as TokenId] = Math.ceil(v * d);
    return out;
  }

  buyCosmetic(id: string): boolean {
    const def = cosmeticById(id);
    if (!def || this.state.cosmetics.owned.includes(id)) return false;
    const cost = this.cosmeticCost(id);
    if (!this.canAfford(cost)) return false;
    for (const [t, v] of Object.entries(cost)) this.state.tokens[t as TokenId] -= v;
    this.state.cosmetics.owned.push(id);
    this.bus.emit('notify', { text: `✨ Unlocked ${def.name}`, tone: 'good' });
    return true;
  }

  /** Toggle a skin or modifier on a target. */
  equip(target: CosmeticTarget, id: string): boolean {
    const def = cosmeticById(id);
    if (!def || !this.state.cosmetics.owned.includes(id) || !def.targets.includes(target)) return false;
    const eq = (this.state.cosmetics.equipped[target] ??= { mods: [] });
    if (def.kind === 'skin') {
      eq.skin = eq.skin === id ? undefined : id;
    } else if (eq.mods.includes(id)) {
      eq.mods = eq.mods.filter((m) => m !== id);
    } else {
      if (eq.mods.length >= Math.floor(this.stat('cosmetic.slots'))) return false;
      eq.mods.push(id);
    }
    this.applyCosmeticStats();
    this.bus.emit('cosmeticsChanged', {});
    return true;
  }

  /* ---- offline ---- */

  /** Simulate time away. Returns Cash paid out to the floor. */
  applyOffline(seconds: number): { seconds: number; cash: Num } {
    const capped = Math.min(Math.max(0, seconds), this.stat('offline.cap'));
    const simulated = capped * this.stat('offline.rate');
    if (simulated < 1) return { seconds: 0, cash: num(0) };
    const step = 5;
    for (let t = 0; t < simulated; t += step) {
      for (const rt of this.running()) tycoonById(rt.id).tick(rt.state, rt, Math.min(step, simulated - t), this.ctx(rt));
    }
    let cash = this.garage.offline(simulated);
    if (this.flag('autoCashout')) for (const rt of this.running()) cash = cash.add(this.cashOut(rt.id));
    this.checkLevels();
    return { seconds: capped, cash };
  }
}

const formatVibe = (v: number): string => (Math.round(v * 100) / 100).toString();

function scaleMods(mods: StatModifier[], count: number): StatModifier[] {
  return mods.map((m) => ({
    ...m,
    value: m.op === 'add' ? m.value * count : m.op === 'mult' ? Math.pow(m.value, count) : m.value,
  }));
}

export const ALL = { ITEMS, SKILL_NODES, COSMETICS, TYCOONS, QUESTS };
