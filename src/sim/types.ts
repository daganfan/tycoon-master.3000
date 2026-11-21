import type { Num } from '@/core/num';
import type { Rng } from '@/core/rng';
import type { StatModifier } from '@/core/stats';
import type { GarageState } from './garage/factory';

export const TOKENS = ['grind', 'mogul', 'chaos', 'pixel', 'golden'] as const;
export type TokenId = (typeof TOKENS)[number];
export type TokenCost = Partial<Record<TokenId, number>>;

export type Phase = 'bedroom' | 'garage' | 'lancafe' | 'studio' | 'tower' | 'recursion';
export type ChaosKind = 'topple' | 'avalanche' | 'tower' | 'ragdoll';
export type CosmeticTarget = 'avatar' | 'pc' | 'desk' | 'coins' | 'props' | 'screen';

/* ---------- Mini-tycoons ---------- */

export interface TycoonUpgradeDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number;
  growth: number;
  max?: number;
}

export interface TycoonCtx {
  rng: Rng;
  /** Multiplier on simulated time (hardware speed). */
  speed: number;
  clickPower: number;
  earn(amount: number): void;
  /** Ask the outer world to spawn a physical object (e.g. a jammed duck). */
  spawn(kind: string): void;
  notify(text: string): void;
  flag(name: string): boolean;
}

export interface TycoonActionDef<S> {
  id: string;
  label: string;
  /** The primary action is what auto-clickers and macros press. */
  primary?: boolean;
  /** Set to false for fiddly actions (price nudges) that should not count toward Grind Tokens. */
  grind?: boolean;
  run(s: S, rt: TycoonRuntime<S>, ctx: TycoonCtx, arg?: number): void;
}

export interface TycoonDef<S = unknown> {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  phase: Phase;
  /** Cash price in the App Store. 0 = preinstalled. */
  unlockCost: number;
  /** Internal currency symbol shown inside the game. */
  currency: string;
  /** Internal money → Cash conversion before stat multipliers. */
  rate: number;
  upgrades: TycoonUpgradeDef[];
  actions: TycoonActionDef<S>[];
  init(rng: Rng): S;
  tick(s: S, rt: TycoonRuntime<S>, dt: number, ctx: TycoonCtx): void;
}

export interface TycoonRuntime<S = unknown> {
  id: string;
  installed: boolean;
  money: number;
  lifetime: number;
  level: number;
  upgrades: Record<string, number>;
  state: S;
}

/* ---------- Shop / skill tree / cosmetics ---------- */

export type ItemCategory = 'hardware' | 'furniture' | 'decor' | 'utility' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  category: ItemCategory;
  icon: string;
  baseCost: number;
  growth: number;
  max: number;
  /** Modifiers per unit owned (add scales linearly, mult compounds). */
  mods: StatModifier[];
  flags?: string[];
  /** Which prop the world spawns for each unit. */
  prop?: string;
  phase: Phase;
  /** Only for sale while this state flag is set (services like the Window Guy). */
  needsFlag?: string;
}

export type NodeEffect = StatModifier | { flag: string };

export interface SkillNodeDef {
  id: string;
  name: string;
  desc: string;
  branch: 'root' | 'hustle' | 'business' | 'automation' | 'hardware' | 'chaos' | 'style' | 'legacy';
  pos: { x: number; y: number };
  cost: TokenCost;
  /** Purchasable when ANY of these is owned. */
  requires: string[];
  effects: NodeEffect[];
  keystone?: boolean;
  hidden?: boolean;
  /** Legacy placeholders: invisible and unpurchasable until this phase is reached (`phase:<id>` state flag). */
  phaseLocked?: Phase;
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'glitched';

export interface PhysicsPatch {
  mass?: number;
  restitution?: number;
  friction?: number;
  gravityScale?: number;
  scale?: number;
}

export interface CosmeticDef {
  id: string;
  name: string;
  desc: string;
  kind: 'skin' | 'modifier';
  targets: CosmeticTarget[];
  rarity: Rarity;
  cost: TokenCost;
  visual: { color?: string; metalness?: number; roughness?: number; emissive?: string; wobble?: number; theme?: string };
  physics?: PhysicsPatch;
  mods?: StatModifier[];
}

export interface QuestDef {
  id: string;
  title: string;
  text: string;
  reward: number;
  done(state: GameState): boolean;
}

/* ---------- Game state ---------- */

export interface Equipped {
  skin?: string;
  mods: string[];
}

export interface Settings {
  comfort: number;
  volume: number;
  wallpaper: number;
  reducedMotion: boolean;
  /** Graphics preset: auto | low | medium | high | ultra. */
  quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
}

/** Saved pose of a physical prop: current position/rotation and its "home" (where it was last placed). */
export interface PropPose {
  p: [number, number, number];
  q: [number, number, number, number];
  hp?: [number, number, number];
  hq?: [number, number, number, number];
}

/** Extra info the world sends along with a mayhem event. */
export interface ChaosInfo {
  /** Size of the event: topple ≈ object heft (0.5–3), avalanche = fast coins, tower = height (m), ragdoll = drop (m). */
  magnitude?: number;
  /** Stable id of the object involved (for diminishing returns). */
  object?: string;
}

export interface GameState {
  version: number;
  rngState: number;
  time: number;
  lastSaved: number;
  cash: Num;
  lifetimeCash: Num;
  /** Cash that was paid out as physical coins but not picked up yet. */
  floorCash: Num;
  tokens: Record<TokenId, number>;
  nodes: string[];
  items: Record<string, number>;
  tycoons: Record<string, TycoonRuntime>;
  cosmetics: { owned: string[]; equipped: Partial<Record<CosmeticTarget, Equipped>> };
  counters: Record<string, number>;
  quests: string[];
  flags: string[];
  settings: Settings;
  /** Prop placements keyed by stable id (`desk`, `used_monitor#0`, ...). */
  layout: Record<string, PropPose>;
  /** Phase 2 factory progress. */
  garage: GarageState;
  /** Unlocked achievement ids. */
  achievements: string[];
}
