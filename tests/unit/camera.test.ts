import { describe, expect, it } from 'vitest';
import {
  DIST,
  MAX_MOUSE_STEP,
  PITCH,
  applyLook,
  boomStep,
  clampPitch,
  collideDist,
  facingForYaw,
  focusDistance,
  lookDir,
  nextMode,
  smoothFactor,
  wrapAngle,
  zoomDist,
  type LookState,
} from '@/world/camera';

const look = (): LookState => ({ yaw: 0, pitch: 0, dist: 2.4 });

describe('camera math', () => {
  it('toggles between first and third person', () => {
    expect(nextMode('third')).toBe('first');
    expect(nextMode('first')).toBe('third');
    expect(nextMode(nextMode('third'))).toBe('third');
  });

  it('mouse right turns right, mouse down looks down, invert flips it', () => {
    const s = look();
    applyLook(s, 100, 0, 1, false, 'third');
    expect(s.yaw).toBeLessThan(0);
    const d = lookDir(s.yaw, 0);
    expect(d.x).toBeGreaterThan(0); // facing -z, turning right goes toward +x
    const p = look();
    applyLook(p, 0, 50, 1, false, 'first');
    expect(p.pitch).toBeGreaterThan(0);
    expect(lookDir(0, p.pitch).y).toBeLessThan(0);
    const q = look();
    applyLook(q, 0, 50, 1, true, 'first');
    expect(q.pitch).toBeCloseTo(-p.pitch);
  });

  it('sensitivity scales the turn linearly', () => {
    const a = look();
    const b = look();
    applyLook(a, 40, 0, 1, false, 'third');
    applyLook(b, 40, 0, 2, false, 'third');
    expect(b.yaw).toBeCloseTo(a.yaw * 2);
  });

  it('clamps pitch per mode and re-clamps on mode change', () => {
    const s = look();
    for (let i = 0; i < 50; i++) applyLook(s, 0, 200, 1, false, 'first');
    expect(s.pitch).toBe(PITCH.first[1]);
    clampPitch(s, 'third');
    expect(s.pitch).toBe(PITCH.third[1]);
  });

  it('ignores mouse spikes and junk input', () => {
    const s = look();
    expect(applyLook(s, MAX_MOUSE_STEP + 1, 0, 1, false, 'third')).toBe(false);
    expect(applyLook(s, Number.NaN, 0, 1, false, 'third')).toBe(false);
    expect(s).toEqual(look());
  });

  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5 + 4 * Math.PI)).toBeCloseTo(0.5);
    expect(Math.abs(facingForYaw(0))).toBeCloseTo(Math.PI);
  });

  it('zoom stays within limits', () => {
    let d = 2.4;
    for (let i = 0; i < 50; i++) d = zoomDist(d, 100);
    expect(d).toBe(DIST.max);
    for (let i = 0; i < 50; i++) d = zoomDist(d, -100);
    expect(d).toBe(DIST.min);
  });

  it('collision clamps the boom in front of the blocker', () => {
    expect(collideDist(2.4, null)).toBe(2.4);
    expect(collideDist(2.4, 3)).toBe(2.4);
    expect(collideDist(2.4, 1, 0.1)).toBeCloseTo(0.9);
    expect(collideDist(2.4, 0.05, 0.1, 0.25)).toBe(0.25);
    expect(collideDist(0.1, 0.05, 0.1, 0.25)).toBe(0.1); // never longer than wanted
  });

  it('boom snaps in at once and eases back out', () => {
    expect(boomStep(2.4, 0.8, 1 / 30)).toBe(0.8);
    const out = boomStep(0.8, 2.4, 1 / 30);
    expect(out).toBeGreaterThan(0.8);
    expect(out).toBeLessThan(2.4);
  });

  it('smoothing is frame-rate independent', () => {
    // Two 1/60 s steps land where one 1/30 s step does.
    const a = 1 - (1 - smoothFactor(1 / 60, 0.05)) ** 2;
    expect(smoothFactor(1 / 30, 0.05)).toBeCloseTo(a, 10);
    expect(smoothFactor(0.1, 0)).toBe(1);
    expect(smoothFactor(-1, 0.05)).toBe(0);
  });

  it('focus distance makes the screen fill the view', () => {
    const d = focusDistance(0.6, 0.35, 60, 16 / 9, 1);
    const halfH = Math.tan(Math.PI / 6) * d;
    expect(halfH).toBeGreaterThanOrEqual(0.175 - 1e-9);
    expect(halfH * (16 / 9)).toBeGreaterThanOrEqual(0.3 - 1e-9);
  });
});
