import { describe, expect, it } from 'vitest';
import { runGarageBot } from './garageBot';

/** Phase 2 pacing targets (GDD §4: Garage ≈ 3 h). Times are seconds after the Garage Key. */
describe('balance: Garage pacing', () => {
  const runs = [42, 7, 99].map((seed) => ({ seed, r: runGarageBot(5 * 3600, 1.5, seed) }));

  it('the first pad and Hot Dog Highway come quickly', () => {
    for (const { seed, r } of runs) {
      expect(r.firstPad, `seed ${seed}`).toBeLessThan(60);
      expect(r.hotdog!, `seed ${seed}`).toBeLessThan(15 * 60);
      expect(r.robot!, `seed ${seed}`).toBeLessThan(40 * 60);
    }
  });

  it('first factory rebirth 40–90 minutes after the key', () => {
    for (const { seed, r } of runs) {
      expect(r.rebirths.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(r.rebirths[0]!, `seed ${seed}`).toBeGreaterThan(40 * 60);
      expect(r.rebirths[0]!, `seed ${seed}`).toBeLessThan(90 * 60);
    }
  });

  it('the LAN Café Lease (phase 3 teaser) takes 2–3.5 hours', () => {
    for (const { seed, r } of runs) {
      expect(r.lease, `seed ${seed}`).toBeDefined();
      expect(r.lease!, `seed ${seed}`).toBeGreaterThan(2 * 3600);
      expect(r.lease!, `seed ${seed}`).toBeLessThan(3.5 * 3600);
      expect(r.carwash!, `seed ${seed}`).toBeLessThan(r.rebirths[0]!);
    }
  });

});
