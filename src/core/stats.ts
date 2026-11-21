/**
 * Stats pipeline. Every upgradeable number is a named stat with a base value.
 * Sources (skill nodes, hardware, decor, modifiers) contribute modifiers:
 *   final = override ?? (base + sum(add)) * product(mult)
 * Results are cached and invalidated when any source changes.
 */
export type StatOp = 'add' | 'mult' | 'override';

export interface StatModifier {
  stat: string;
  op: StatOp;
  value: number;
}

export class Stats {
  private bases = new Map<string, number>();
  private sources = new Map<string, StatModifier[]>();
  private cache = new Map<string, number>();
  private flagSources = new Map<string, Set<string>>();

  constructor(bases: Record<string, number> = {}) {
    for (const [k, v] of Object.entries(bases)) this.bases.set(k, v);
  }

  setBase(stat: string, value: number): void {
    this.bases.set(stat, value);
    this.cache.delete(stat);
  }

  /** Replace all modifiers and flags from one source (e.g. "node:hustle_1"). */
  setSource(sourceId: string, mods: StatModifier[], flags: string[] = []): void {
    this.removeSource(sourceId);
    if (mods.length) this.sources.set(sourceId, mods);
    for (const f of flags) {
      let s = this.flagSources.get(f);
      if (!s) this.flagSources.set(f, (s = new Set()));
      s.add(sourceId);
    }
    for (const m of mods) this.cache.delete(m.stat);
  }

  removeSource(sourceId: string): void {
    const old = this.sources.get(sourceId);
    if (old) for (const m of old) this.cache.delete(m.stat);
    this.sources.delete(sourceId);
    for (const s of this.flagSources.values()) s.delete(sourceId);
  }

  hasSource(sourceId: string): boolean {
    return this.sources.has(sourceId) || [...this.flagSources.values()].some((s) => s.has(sourceId));
  }

  flag(name: string): boolean {
    return (this.flagSources.get(name)?.size ?? 0) > 0;
  }

  get(stat: string): number {
    const cached = this.cache.get(stat);
    if (cached !== undefined) return cached;
    let add = 0;
    let mult = 1;
    let override: number | undefined;
    for (const mods of this.sources.values()) {
      for (const m of mods) {
        if (m.stat !== stat) continue;
        if (m.op === 'add') add += m.value;
        else if (m.op === 'mult') mult *= m.value;
        else override = m.value;
      }
    }
    const value = override ?? ((this.bases.get(stat) ?? 0) + add) * mult;
    this.cache.set(stat, value);
    return value;
  }

  clearSources(): void {
    this.sources.clear();
    this.flagSources.clear();
    this.cache.clear();
  }
}
