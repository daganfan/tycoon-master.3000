import { describe, expect, it } from 'vitest';
import {
  RECORD_BYTES,
  decodeBodies,
  encodeBodies,
  packBodies,
  unpackBodies,
  type BodyRec,
} from '@/net/codec';
import { InterpBuffer, nlerpQuat, smoothPing } from '@/net/interp';
import {
  CODE_LENGTH,
  TokenBucket,
  cleanText,
  encode,
  inviteLink,
  joinCodeFrom,
  makeRoomCode,
  normalizeRoomCode,
  parseFromGuest,
  parseFromHost,
} from '@/net/protocol';
import { MAX_MESSAGE_CHARS, WORLD_BOUNDS } from '@/net/config';

const J = (o: unknown) => JSON.stringify(o);

describe('room codes & links', () => {
  it('makes readable codes and normalizes input', () => {
    const c = makeRoomCode();
    expect(c).toHaveLength(CODE_LENGTH);
    expect(c).not.toMatch(/[01OIL]/);
    expect(normalizeRoomCode(` ${c.slice(0, 3).toLowerCase()}-${c.slice(3)} `)).toBe(c);
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(normalizeRoomCode('ABCDE0')).toBeNull(); // ambiguous characters are never generated
  });

  it('builds invite links that keep the transport but drop other params', () => {
    const l = inviteLink('https://x.github.io/tm/?fresh&net=local#hash', 'K7XQ2M');
    expect(l).toBe('https://x.github.io/tm/?join=K7XQ2M&net=local');
    expect(joinCodeFrom(new URL(l).search)).toBe('K7XQ2M');
    expect(joinCodeFrom('?join=<script>')).toBeNull();
  });
});

describe('guest message validation', () => {
  it('accepts and sanitizes a hello', () => {
    const m = parseFromGuest(
      J({ t: 'hello', proto: 1, save: 2, name: '  Al‮ice\n\n  the   great and powerful ', color: 'red' }),
    );
    expect(m).toEqual({ t: 'hello', proto: 1, save: 2, name: 'Al ice the great', color: '#e94b4b' });
  });

  it('clamps poses into the world and normalizes quaternions', () => {
    const m = parseFromGuest(J({ t: 'pose', p: [1e9, -50, 3], q: [0, 0, 0, 2], s: 999, r: 1, e: 7 }));
    expect(m).toEqual({
      t: 'pose',
      p: [WORLD_BOUNDS.x, WORLD_BOUNDS.yMin, 3],
      q: [0, 0, 0, 1],
      s: 20,
      r: 1,
      e: 3,
    });
    expect(parseFromGuest(J({ t: 'pose', p: [0, 'x', 0], q: [0, 0, 0, 1], s: 0 }))).toBeNull();
    expect(parseFromGuest(J({ t: 'pose', p: [0, 0, 0], q: [0, 0, 0, 1], s: Number.NaN }))).toBeNull();
  });

  it('rejects junk, unknown types, oversize and messages guests may not send', () => {
    expect(parseFromGuest('not json')).toBeNull();
    expect(parseFromGuest(J([1, 2]))).toBeNull();
    expect(parseFromGuest(J({ t: 'welcome', you: 'x', state: '{}' }))).toBeNull(); // host-only
    expect(parseFromGuest(J({ t: 'kick' }))).toBeNull();
    expect(parseFromGuest('x'.repeat(MAX_MESSAGE_CHARS + 1))).toBeNull();
    expect(parseFromGuest(J({ t: 'chat', text: '   ' }))).toBeNull();
    expect((parseFromGuest(J({ t: 'chat', text: 'a'.repeat(500) })) as { text: string }).text).toHaveLength(
      140,
    );
  });

  it('validates screen input', () => {
    expect(parseFromGuest(J({ t: 'scr', i: 0, k: 'click', x: 10, y: 20 }))).toEqual({
      t: 'scr',
      i: 0,
      k: 'click',
      x: 10,
      y: 20,
    });
    expect(parseFromGuest(J({ t: 'scr', i: 0, k: 'rm -rf', x: 10, y: 20 }))).toBeNull();
    expect(parseFromGuest(J({ t: 'scr', i: -1, k: 'click', x: 10, y: 20 }))).toBeNull();
  });
});

describe('host message validation', () => {
  it('only accepts image data urls as screen frames', () => {
    expect(parseFromHost(J({ t: 'frame', i: 0, img: 'data:image/jpeg;base64,AAAA' }))).not.toBeNull();
    expect(parseFromHost(J({ t: 'frame', i: 0, img: 'javascript:alert(1)' }))).toBeNull();
  });

  it('filters malformed pose rows and roster entries', () => {
    const m = parseFromHost(J({ t: 'poses', l: [['a', 0, 1, 0, 0, 0, 0, 1, 0, 0, 0], ['b', 'x'], 5] }));
    expect(m).toEqual({ t: 'poses', l: [['a', 0, 1, 0, 0, 0, 0, 1, 0, 0, 0]] });
    const r = parseFromHost(
      J({
        t: 'roster',
        l: [{ id: 'a', name: 'Zed', color: '#00ff00', host: true, ping: 12, helped: '$5' }, { id: 3 }],
      }),
    );
    expect(r).toEqual({
      t: 'roster',
      l: [{ id: 'a', name: 'Zed', color: '#00ff00', host: true, ping: 12, helped: '$5' }],
    });
  });

  it('round-trips through encode', () => {
    const msg = { t: 'chat' as const, name: 'Al', color: '#123456', text: 'yo', sys: false };
    expect(parseFromHost(encode(msg))).toEqual(msg);
  });
});

describe('body codec', () => {
  const recs: BodyRec[] = [
    { id: 1, type: 0, x: 1.2345, y: -0.5, z: 2.9999, qx: 0, qy: 0.7071, qz: 0, qw: 0.7071 },
    { id: 4000000000, type: 3, x: -40, y: 40, z: 0, qx: 0, qy: 0, qz: 0, qw: -1 },
  ];

  it('packs 20 bytes per body and round-trips within quantization error', () => {
    expect(packBodies(recs)).toHaveLength(2 * RECORD_BYTES);
    const out = decodeBodies(encodeBodies(recs));
    expect(out[0]!.id).toBe(1);
    expect(out[0]!.x).toBeCloseTo(1.2345, 2);
    expect(out[0]!.z).toBeCloseTo(3, 2);
    expect(out[0]!.qy).toBeCloseTo(0.7071, 3);
    expect(out[1]!.id).toBe(4000000000);
    expect(out[1]!.type).toBe(3);
    expect(out[1]!.x).toBeCloseTo(-32.767, 3); // clamped to the representable range
    expect(out[1]!.qw).toBeCloseTo(1, 4); // canonical hemisphere
  });

  it('never throws on garbage', () => {
    expect(decodeBodies('!!!not base64')).toEqual([]);
    expect(unpackBodies(new Uint8Array(7))).toEqual([]);
    expect(unpackBodies(new Uint8Array(RECORD_BYTES * 3), 2)).toHaveLength(2);
  });
});

describe('interpolation', () => {
  it('blends between samples and holds the newest without overshooting', () => {
    const b = new InterpBuffer(0.1);
    expect(b.sample(0)).toBeUndefined();
    b.push({ t: 1, p: [0, 0, 0], q: [0, 0, 0, 1] });
    b.push({ t: 1.1, p: [1, 0, 0], q: [0, 0, 0, 1] });
    expect(b.sample(1.05)!.p[0]).toBeCloseTo(0.5);
    expect(b.sample(5)!.p[0]).toBe(1);
    expect(b.sample(0.5)!.p[0]).toBe(0);
  });

  it('does not smear a move over a long pause', () => {
    const b = new InterpBuffer(0.1);
    b.push({ t: 0, p: [0, 0, 0], q: [0, 0, 0, 1] });
    b.push({ t: 10, p: [1, 0, 0], q: [0, 0, 0, 1] });
    expect(b.sample(5)!.p[0]).toBe(0);
    expect(b.sample(9.95)!.p[0]).toBeCloseTo(0.5);
  });

  it('takes the short way round for quaternions', () => {
    const q = nlerpQuat([0, 0, 0, 1], [0, 0, 0, -1], 0.5);
    expect(Math.abs(q[3])).toBeCloseTo(1);
  });

  it('smooths ping', () => {
    expect(smoothPing(0, 100)).toBe(100);
    expect(smoothPing(100, 200)).toBeCloseTo(130);
  });
});

describe('rate limiting & text', () => {
  it('token bucket allows bursts then refills over time', () => {
    const b = new TokenBucket(2, 3, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(400)).toBe(false);
    expect(b.take(600)).toBe(true);
  });

  it('strips control and direction-override characters', () => {
    expect(cleanText('a\u0000b‮c\td', 50)).toBe('a b c d');
  });
});
