import { describe, expect, it } from 'vitest';
import { Stats } from '@/core/stats';
import { Rng } from '@/core/rng';
import { EventBus } from '@/core/events';
import { FixedLoop } from '@/core/loop';
import { formatNum, num } from '@/core/num';

describe('Stats', () => {
  it('combines base, add, mult and override', () => {
    const s = new Stats({ click: 1 });
    expect(s.get('click')).toBe(1);
    s.setSource('a', [{ stat: 'click', op: 'add', value: 2 }]);
    s.setSource('b', [{ stat: 'click', op: 'mult', value: 2 }]);
    expect(s.get('click')).toBe(6);
    s.setSource('c', [{ stat: 'click', op: 'override', value: 42 }]);
    expect(s.get('click')).toBe(42);
    s.removeSource('c');
    expect(s.get('click')).toBe(6);
  });

  it('replacing a source invalidates the cache', () => {
    const s = new Stats({ x: 1 });
    s.setSource('a', [{ stat: 'x', op: 'add', value: 1 }]);
    expect(s.get('x')).toBe(2);
    s.setSource('a', [{ stat: 'x', op: 'add', value: 5 }]);
    expect(s.get('x')).toBe(6);
  });

  it('tracks flags per source', () => {
    const s = new Stats();
    s.setSource('k', [], ['coins.bounceTowardPlayer']);
    expect(s.flag('coins.bounceTowardPlayer')).toBe(true);
    s.removeSource('k');
    expect(s.flag('coins.bounceTowardPlayer')).toBe(false);
  });
});

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('resumes from saved state', () => {
    const a = new Rng(7);
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });
});

describe('EventBus', () => {
  it('delivers and unsubscribes', () => {
    const bus = new EventBus<{ ping: number }>();
    const got: number[] = [];
    const off = bus.on('ping', (n) => got.push(n));
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    expect(got).toEqual([1]);
  });
});

describe('FixedLoop', () => {
  it('runs fixed steps and drops excessive backlog', () => {
    let steps = 0;
    const loop = new FixedLoop(0.1, () => steps++, () => {}, 8);
    loop.advance(0.35);
    expect(steps).toBe(3);
    loop.advance(10);
    expect(steps).toBe(11);
  });
});

describe('formatNum', () => {
  it('formats small, suffixed and huge numbers', () => {
    expect(formatNum(12)).toBe('12');
    expect(formatNum(1234)).toBe('1.23K');
    expect(formatNum(num('1e9'))).toBe('1.00B');
    expect(formatNum(num('1e400'))).toBe('1.00e400');
  });
});
