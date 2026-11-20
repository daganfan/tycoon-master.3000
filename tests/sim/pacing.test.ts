import { describe, expect, it } from 'vitest';
import { runBot } from './bot';

/** Pacing targets from GDD §4 / Implementation Plan §6 (Bedroom ≈ 1–1.5 h for an efficient player). */
describe('balance: Bedroom pacing', () => {
  const r = runBot(3 * 3600, 1.5);

  it('first skill node within 3 minutes', () => {
    expect(r.firstNode).toBeDefined();
    expect(r.firstNode!).toBeLessThan(180);
  });

  it('unlocks the games in a sensible order and time', () => {
    expect(r.duck!).toBeGreaterThan(5 * 60);
    expect(r.duck!).toBeLessThan(15 * 60);
    expect(r.socks!).toBeGreaterThan(r.duck!);
    expect(r.couch!).toBeGreaterThan(r.socks!);
  });

  it('garage key takes 45–120 minutes', () => {
    expect(r.garage).toBeDefined();
    expect(r.garage!).toBeGreaterThan(45 * 60);
    expect(r.garage!).toBeLessThan(120 * 60);
  });
});
