import { MAX_CHAT, MAX_MESSAGE_CHARS, MAX_NAME, PLAYER_COLORS, WORLD_BOUNDS } from './config';

/**
 * Wire protocol. Every message is a small JSON object with a `t` tag. Nothing a
 * peer sends is trusted: `parseFromGuest` / `parseFromHost` validate shape,
 * types and ranges and return a clean copy (or null to drop the message).
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** Emotes: 0 none, 1 wave, 2 dance, 3 flop. */
export type Emote = 0 | 1 | 2 | 3;

export interface Pose {
  p: Vec3;
  q: Quat;
  /** Horizontal speed (drives the walk cycle). */
  s: number;
  /** 1 while ragdolling (flopped). */
  r: 0 | 1;
  e: Emote;
}

export type ScreenInputKind = 'focus' | 'blur' | 'move' | 'click' | 'wheel';

/* ---------------- guest → host ---------------- */
export type GuestMsg =
  | { t: 'hello'; proto: number; save: number; name: string; color: string }
  | ({ t: 'pose' } & Pose)
  | { t: 'chat'; text: string }
  | { t: 'scr'; i: number; k: ScreenInputKind; x: number; y: number }
  | { t: 'pong'; n: number }
  | { t: 'bye' };

/* ---------------- host → guest ---------------- */
export interface RosterEntry {
  id: string;
  name: string;
  color: string;
  host: boolean;
  ping: number;
  /** Cash this player picked up for the host (pre-formatted). */
  helped: string;
}

export type HostMsg =
  | { t: 'welcome'; you: string; host: string; state: string; control: boolean }
  | { t: 'reject'; reason: string }
  | { t: 'state'; state: string; control: boolean }
  /** Body snapshot: `d` = base64 packed records (see codec.ts); `reg` maps new ids; keyframes list everything. */
  | { t: 'bodies'; kf: boolean; d: string; reg: RegEntry[]; gone: number[] }
  | { t: 'poses'; l: PoseRow[] }
  | { t: 'roster'; l: RosterEntry[] }
  | { t: 'chat'; name: string; color: string; text: string; sys: boolean }
  | { t: 'toast'; text: string }
  | { t: 'frame'; i: number; img: string }
  | { t: 'ping'; n: number }
  | { t: 'kick' }
  | { t: 'bye' };

/** [netId, stable id ('' for toys), kind]. */
export type RegEntry = [number, string, string];
/** [playerId, x, y, z, qx, qy, qz, qw, speed, ragdoll, emote]. */
export type PoseRow = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/* ---------------- helpers ---------------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Strip control / bidi characters and collapse whitespace. */
export function cleanText(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const noCtl = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ');
  return noCtl.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanName(s: unknown): string {
  const n = typeof s === 'string' ? cleanText(s, MAX_NAME) : '';
  return n || 'Guest';
}

export function cleanColor(s: unknown): string {
  return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : PLAYER_COLORS[0]!;
}

function vec(v: unknown, n: 3 | 4): number[] | null {
  if (!Array.isArray(v) || v.length !== n || !v.every(num)) return null;
  return v as number[];
}

export function clampPos(p: Vec3): Vec3 {
  const b = WORLD_BOUNDS;
  return [clamp(p[0], -b.x, b.x), clamp(p[1], b.yMin, b.yMax), clamp(p[2], -b.z, b.z)];
}

export function normQuat(q: number[]): Quat {
  const l = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!);
  if (!(l > 1e-6)) return [0, 0, 0, 1];
  return [q[0]! / l, q[1]! / l, q[2]! / l, q[3]! / l];
}

/** Parse raw transport data (string JSON) with a size cap. */
export function decode(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return isObj(v) && typeof v.t === 'string' ? v : null;
  } catch {
    return null;
  }
}

export const encode = (m: GuestMsg | HostMsg): string => JSON.stringify(m);

const SCREEN_KINDS: ScreenInputKind[] = ['focus', 'blur', 'move', 'click', 'wheel'];

/** Validate a message a guest sent to the host. Returns a sanitized copy or null. */
export function parseFromGuest(raw: unknown): GuestMsg | null {
  const m = decode(raw);
  if (!m) return null;
  switch (m.t) {
    case 'hello':
      if (!num(m.proto) || !num(m.save)) return null;
      return {
        t: 'hello',
        proto: m.proto,
        save: m.save,
        name: cleanName(m.name),
        color: cleanColor(m.color),
      };
    case 'pose': {
      const p = vec(m.p, 3);
      const q = vec(m.q, 4);
      if (!p || !q || !num(m.s)) return null;
      const e = num(m.e) ? clamp(Math.round(m.e), 0, 3) : 0;
      return {
        t: 'pose',
        p: clampPos(p as Vec3),
        q: normQuat(q),
        s: clamp(m.s, 0, 20),
        r: m.r ? 1 : 0,
        e: e as Emote,
      };
    }
    case 'chat': {
      if (!str(m.text, 1000)) return null;
      const text = cleanText(m.text, MAX_CHAT);
      return text ? { t: 'chat', text } : null;
    }
    case 'scr': {
      if (!num(m.i) || !num(m.x) || !num(m.y) || !SCREEN_KINDS.includes(m.k as ScreenInputKind)) return null;
      const i = Math.floor(m.i);
      if (i < 0 || i > 64) return null;
      return { t: 'scr', i, k: m.k as ScreenInputKind, x: clamp(m.x, -1e4, 1e4), y: clamp(m.y, -1e4, 1e4) };
    }
    case 'pong':
      return num(m.n) ? { t: 'pong', n: m.n } : null;
    case 'bye':
      return { t: 'bye' };
  }
  return null;
}

const isPoseRow = (r: unknown): r is PoseRow =>
  Array.isArray(r) &&
  r.length === 11 &&
  typeof r[0] === 'string' &&
  r[0].length <= 128 &&
  r.slice(1).every(num);

const isRoster = (r: unknown): r is RosterEntry =>
  isObj(r) &&
  str(r.id, 128) &&
  typeof r.name === 'string' &&
  typeof r.color === 'string' &&
  num(r.ping) &&
  typeof r.helped === 'string';

const isReg = (r: unknown): r is RegEntry =>
  Array.isArray(r) && r.length === 3 && num(r[0]) && str(r[1], 128) && str(r[2], 64);

/** Validate a message the host sent to a guest. Still defensive: hosts are peers too. */
export function parseFromHost(raw: unknown): HostMsg | null {
  const m = decode(raw);
  if (!m) return null;
  switch (m.t) {
    case 'welcome':
      if (!str(m.you, 128) || typeof m.state !== 'string') return null;
      return { t: 'welcome', you: m.you, host: cleanName(m.host), state: m.state, control: !!m.control };
    case 'reject':
      return { t: 'reject', reason: typeof m.reason === 'string' ? cleanText(m.reason, 200) : 'Rejected' };
    case 'state':
      return typeof m.state === 'string' ? { t: 'state', state: m.state, control: !!m.control } : null;
    case 'bodies':
      if (typeof m.d !== 'string' || !Array.isArray(m.reg) || !Array.isArray(m.gone)) return null;
      return { t: 'bodies', kf: !!m.kf, d: m.d, reg: m.reg.filter(isReg), gone: m.gone.filter(num) };
    case 'poses':
      return Array.isArray(m.l) ? { t: 'poses', l: m.l.filter(isPoseRow).slice(0, 16) } : null;
    case 'roster':
      return Array.isArray(m.l)
        ? {
            t: 'roster',
            l: m.l
              .filter(isRoster)
              .slice(0, 16)
              .map((r) => ({
                id: r.id,
                name: cleanName(r.name),
                color: cleanColor(r.color),
                host: !!r.host,
                ping: clamp(r.ping, 0, 99999),
                helped: cleanText(r.helped, 32),
              })),
          }
        : null;
    case 'chat':
      if (typeof m.text !== 'string') return null;
      return {
        t: 'chat',
        name: cleanName(m.name),
        color: cleanColor(m.color),
        text: cleanText(m.text, MAX_CHAT),
        sys: !!m.sys,
      };
    case 'toast':
      return typeof m.text === 'string' ? { t: 'toast', text: cleanText(m.text, 120) } : null;
    case 'frame':
      if (!num(m.i) || typeof m.img !== 'string' || !/^data:image\/(jpeg|webp|png);base64,/.test(m.img))
        return null;
      return { t: 'frame', i: Math.floor(m.i), img: m.img };
    case 'ping':
      return num(m.n) ? { t: 'ping', n: m.n } : null;
    case 'kick':
      return { t: 'kick' };
    case 'bye':
      return { t: 'bye' };
  }
  return null;
}

/* ---------------- room codes & links ---------------- */

/** No 0/O/1/I/L so codes survive being read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]!;
  return s;
}

/** Normalize user input ("abc-def", " ab cdef ") to a code, or null if it can't be one. */
export function normalizeRoomCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return s;
}

/** The invite link for a room: current page + ?join=CODE (keeps ?net=local for dev/tests). */
export function inviteLink(href: string, code: string): string {
  const u = new URL(href);
  const net = u.searchParams.get('net');
  u.search = '';
  u.hash = '';
  u.searchParams.set('join', code);
  if (net) u.searchParams.set('net', net);
  return u.toString();
}

/** The room code in a URL's ?join= parameter, if valid. */
export function joinCodeFrom(search: string): string | null {
  const v = new URLSearchParams(search).get('join');
  return v ? normalizeRoomCode(v) : null;
}

/* ---------------- rate limiting ---------------- */

/** Classic token bucket: `rate` tokens per second, up to `burst`. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    readonly rate: number,
    readonly burst: number,
    now = 0,
  ) {
    this.tokens = burst;
    this.last = now;
  }
  take(now: number, n = 1): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Per-message-type limits for guests (messages per second, burst). */
export const GUEST_LIMITS: Record<GuestMsg['t'], [number, number]> = {
  hello: [0.5, 3],
  pose: [30, 40],
  chat: [1, 4],
  scr: [40, 60],
  pong: [2, 4],
  bye: [1, 2],
};
