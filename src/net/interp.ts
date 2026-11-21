/**
 * Snapshot interpolation for remote things (bodies, avatars). Samples are stamped
 * with local receive time; rendering happens slightly in the past (INTERP_DELAY)
 * and blends between the two samples around that time. No extrapolation: when
 * samples run out we hold the newest one, which never overshoots into walls.
 */

export interface Sample {
  t: number;
  p: [number, number, number];
  q: [number, number, number, number];
}

const MAX_SAMPLES = 10;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Normalized lerp along the shortest arc (good enough for 60-100 ms gaps). */
export function nlerpQuat(a: Sample['q'], b: Sample['q'], t: number): Sample['q'] {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  const x = lerp(a[0], b[0] * s, t);
  const y = lerp(a[1], b[1] * s, t);
  const z = lerp(a[2], b[2] * s, t);
  const w = lerp(a[3], b[3] * s, t);
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

export class InterpBuffer {
  readonly samples: Sample[] = [];

  constructor(readonly interval = 1 / 12) {}

  get latest(): Sample | undefined {
    return this.samples[this.samples.length - 1];
  }

  push(s: Sample): void {
    const last = this.latest;
    if (last && s.t <= last.t) {
      // Same-time update (or clock hiccup): replace the newest sample.
      this.samples[this.samples.length - 1] = { ...s, t: last.t };
      return;
    }
    // After a pause (object was asleep and not sent), hold the old pose until just
    // before the new sample, so the move doesn't get smeared over the whole pause.
    if (last && s.t - last.t > this.interval * 2.5)
      this.samples.push({ t: s.t - this.interval, p: last.p, q: last.q });
    this.samples.push(s);
    while (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** Pose at render time `t`; undefined until the first sample. */
  sample(t: number): Sample | undefined {
    const ss = this.samples;
    if (!ss.length) return undefined;
    if (t <= ss[0]!.t) return ss[0];
    for (let i = ss.length - 1; i > 0; i--) {
      const a = ss[i - 1]!;
      const b = ss[i]!;
      if (t >= a.t) {
        if (t >= b.t) return b;
        const k = (t - a.t) / (b.t - a.t);
        return {
          t,
          p: [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)],
          q: nlerpQuat(a.q, b.q, k),
        };
      }
    }
    return ss[ss.length - 1];
  }

  /** Teleport: forget history. */
  reset(s?: Sample): void {
    this.samples.length = 0;
    if (s) this.samples.push(s);
  }
}

/**
 * Exponentially smoothed round-trip time, used for the ping column.
 */
export function smoothPing(prev: number, sample: number): number {
  if (!(prev > 0)) return sample;
  return prev * 0.7 + sample * 0.3;
}
