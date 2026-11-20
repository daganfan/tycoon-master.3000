import { describe, expect, it } from 'vitest';
import { runBot } from './bot';

/** Pacing targets from GDD §4 / Implementation Plan §6 (Bedroom ≈ 1–2 h for an efficient player). */
describe('balance: Bedroom pacing', () => {
  const r = runBot(3 * 3600, 1.5);

  it('first skill node within 2–5 minutes', () => {
    expect(r.firstNode).toBeDefined();
    expect(r.firstNode!).toBeGreaterThan(90);
    expect(r.firstNode!).toBeLessThan(300);
  });

  it('unlocks the games in a sensible order and time', () => {
    expect(r.duck!).toBeGreaterThan(5 * 60);
    expect(r.duck!).toBeLessThan(15 * 60);
    expect(r.socks!).toBeGreaterThan(r.duck!);
    expect(r.couch!).toBeGreaterThan(r.socks!);
  });

  it('garage key takes 60–120 minutes', () => {
    expect(r.garage).toBeDefined();
    expect(r.garage!).toBeGreaterThan(60 * 60);
    expect(r.garage!).toBeLessThan(120 * 60);
  });

  it('tokens feel earned: no kind is handed out every few seconds', () => {
    const minutes = r.garage! / 60;
    for (const kind of ['grind', 'mogul', 'chaos'] as const) {
      expect(r.earned[kind], kind).toBeGreaterThan(2);
      // At most one token of a kind per ~3 minutes on average.
      expect(r.earned[kind] / minutes, kind).toBeLessThan(1 / 3);
    }
  });

  it('is robust across seeds', () => {
    for (const seed of [7, 99]) {
      const o = runBot(3 * 3600, 1.5, seed);
      expect(o.garage, `seed ${seed}`).toBeDefined();
      expect(o.garage!).toBeGreaterThan(60 * 60);
      expect(o.garage!).toBeLessThan(120 * 60);
    }
  });
});
