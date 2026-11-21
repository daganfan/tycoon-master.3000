import { describe, expect, it } from 'vitest';
import { AutoTuner, FrameStats } from '@/world/perf';

/** Drive the tuner for `secs` seconds with a frame-time model. */
function run(t: AutoTuner, secs: number, frameMs: (t: AutoTuner) => number): number {
  let changes = 0;
  let v = t.version;
  for (let time = 0; time < secs * 1000; ) {
    const ms = frameMs(t);
    t.frame(ms, -1, false);
    time += ms;
    if (t.version !== v) {
      changes++;
      v = t.version;
    }
  }
  return changes;
}

describe('FrameStats', () => {
  it('averages and counts slow frames', () => {
    const s = new FrameStats(4);
    for (const v of [10, 20, 30, 40, 50]) s.push(v);
    expect(s.avg()).toBe(35);
    expect(s.max()).toBe(50);
    expect(s.over(35)).toBe(0.5);
  });
});

describe('AutoTuner', () => {
  it('lowers render scale first, then the preset, when frames are slow', () => {
    const t = new AutoTuner();
    t.reset('high', true, 0.6);
    run(t, 20, () => 40);
    expect(t.level).toBe('low');
    expect(t.scale).toBeCloseTo(0.6);
  });

  it('a manual preset only changes render scale', () => {
    const t = new AutoTuner();
    t.reset('medium', false, 0.6);
    run(t, 20, () => 40);
    expect(t.level).toBe('medium');
    expect(t.scale).toBeCloseTo(0.6);
  });

  it('settles instead of oscillating at the edge of the budget', () => {
    const t = new AutoTuner();
    t.reset('medium', true, 0.6);
    // Fast below 85% scale, too slow above it.
    const changes = run(t, 600, (x) => (x.scale > 0.85 + 1e-6 ? 22 : 15));
    // A handful of probes with exponential back-off over ten minutes, not a flip-flop every few seconds.
    expect(changes).toBeLessThan(16);
    expect(t.scale).toBeLessThanOrEqual(0.9);
  });

  it('climbs back up when there is headroom', () => {
    const t = new AutoTuner();
    t.reset('medium', true, 0.6);
    run(t, 120, () => 8);
    expect(t.level).toBe('high');
  });
});
