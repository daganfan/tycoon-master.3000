import { APP_ID, MAX_MESSAGE_CHARS, STRATEGIES, turnServers, type Strategy } from './config';

/**
 * A room full of peers that exchange strings. Two implementations:
 *  - TrysteroTransport: real internet play over WebRTC, signaling via public
 *    Nostr relays and BitTorrent trackers (no server of our own).
 *  - LocalTransport: BroadcastChannel between tabs of the same browser
 *    (development + automated tests, `?net=local`).
 */
export interface Transport {
  readonly kind: string;
  readonly selfId: string;
  join(room: string): Promise<void>;
  /** Send to one peer, or everyone when `to` is omitted. Never throws. */
  send(data: string, to?: string): void;
  peers(): string[];
  leave(): void;
  onMessage: (data: string, from: string) => void;
  onPeerJoin: (id: string) => void;
  onPeerLeave: (id: string) => void;
  /** Human-readable problems (relay down, connection failed…). */
  onStatus: (text: string) => void;
}

export const randomId = (): string => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 16);
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
};

abstract class BaseTransport implements Transport {
  abstract readonly kind: string;
  readonly selfId = randomId();
  onMessage: (data: string, from: string) => void = () => {};
  onPeerJoin: (id: string) => void = () => {};
  onPeerLeave: (id: string) => void = () => {};
  onStatus: (text: string) => void = () => {};
  abstract join(room: string): Promise<void>;
  abstract send(data: string, to?: string): void;
  abstract peers(): string[];
  abstract leave(): void;
}

/* ------------------------------------------------------------ local */

interface Envelope {
  k: 'hi' | 'ack' | 'm' | 'beat' | 'bye';
  from: string;
  to?: string;
  d?: string;
}

/** Generous: a tab building its 3D world can block its main thread for seconds. */
const LOCAL_TIMEOUT_MS = 20_000;

/** Same-browser tabs via BroadcastChannel. Presence is tracked with heartbeats. */
export class LocalTransport extends BaseTransport {
  readonly kind = 'local';
  private ch: BroadcastChannel | null = null;
  private seen = new Map<string, number>();
  private beat: ReturnType<typeof setInterval> | null = null;

  async join(room: string): Promise<void> {
    this.ch = new BroadcastChannel(`tm3000:${room}`);
    this.ch.onmessage = (e) => this.receive(e.data as Envelope);
    this.post({ k: 'hi', from: this.selfId });
    this.beat = setInterval(() => {
      this.post({ k: 'beat', from: this.selfId });
      const now = Date.now();
      for (const [id, t] of this.seen) if (now - t > LOCAL_TIMEOUT_MS) this.drop(id);
    }, 1000);
  }

  private post(e: Envelope): void {
    try {
      this.ch?.postMessage(e);
    } catch {
      /* channel closed */
    }
  }

  private receive(e: Envelope): void {
    if (!e || typeof e !== 'object' || typeof e.from !== 'string' || e.from === this.selfId) return;
    if (e.to && e.to !== this.selfId) return;
    if (e.k === 'bye') return this.drop(e.from);
    const known = this.seen.has(e.from);
    this.seen.set(e.from, Date.now());
    if (!known) {
      this.onPeerJoin(e.from);
      if (e.k !== 'ack') this.post({ k: 'ack', from: this.selfId, to: e.from });
    }
    if (e.k === 'm' && typeof e.d === 'string' && e.d.length <= MAX_MESSAGE_CHARS)
      this.onMessage(e.d, e.from);
  }

  private drop(id: string): void {
    if (!this.seen.delete(id)) return;
    this.onPeerLeave(id);
  }

  send(data: string, to?: string): void {
    this.post({ k: 'm', from: this.selfId, to, d: data });
  }

  peers(): string[] {
    return [...this.seen.keys()];
  }

  leave(): void {
    this.post({ k: 'bye', from: this.selfId });
    if (this.beat) clearInterval(this.beat);
    this.ch?.close();
    this.ch = null;
    this.seen.clear();
  }
}

/* ------------------------------------------------------------ trystero */

type TRoom = {
  makeAction: (ns: string) => {
    send: (d: string, o?: { target?: string | string[] }) => Promise<void>;
    onMessage: (h: (d: unknown, ctx: { peerId: string }) => void) => unknown;
  };
  onPeerJoin: (h: (ctx: { peerId: string }) => void) => unknown;
  onPeerLeave: (h: (ctx: { peerId: string }) => void) => unknown;
  onError: (h: (e: { code: string; message: string }) => void) => unknown;
  leave: () => Promise<void>;
};

interface Path {
  strat: Strategy;
  peer: string;
}

/**
 * WebRTC data channels through Trystero. Every signaling strategy joins the same
 * room; peers say "hi" with a session id so the same person reachable over two
 * strategies is only counted once (the second path is kept as a spare).
 */
export class TrysteroTransport extends BaseTransport {
  readonly kind = 'p2p';
  private rooms = new Map<
    Strategy,
    { room: TRoom; hi: ReturnType<TRoom['makeAction']>; msg: ReturnType<TRoom['makeAction']> }
  >();
  /** session id → active path (+ spares). */
  private bySid = new Map<string, Path[]>();
  private sidOf = new Map<string, string>();

  constructor(private readonly strategies: Strategy[] = STRATEGIES) {
    super();
  }

  private key = (p: Path) => `${p.strat}:${p.peer}`;

  async join(room: string): Promise<void> {
    const ice = turnServers();
    const config = {
      appId: APP_ID,
      // The room code doubles as the password: signaling payloads are encrypted with it.
      password: room,
      identity: 'none' as const,
      maxReceiveBytes: MAX_MESSAGE_CHARS * 2,
      relayConfig: { warnOnRelayFailure: false },
      ...(ice.length ? { turnConfig: ice as never } : {}),
    };
    const loaded = await Promise.allSettled(
      this.strategies.map(async (s) => {
        const mod = (s === 'torrent'
          ? await import('@trystero-p2p/torrent')
          : await import('trystero')) as unknown as {
          joinRoom: (c: typeof config, id: string) => TRoom;
        };
        return { s, r: mod.joinRoom(config, `tm3000-${room}`) };
      }),
    );
    for (const res of loaded) {
      if (res.status !== 'fulfilled') {
        this.onStatus(`A connection method failed to load: ${String(res.reason)}`);
        continue;
      }
      const { s, r } = res.value;
      const hi = r.makeAction('hi');
      const msg = r.makeAction('m');
      this.rooms.set(s, { room: r, hi, msg });
      r.onPeerJoin(({ peerId }) => void hi.send(this.selfId, { target: peerId }).catch(() => {}));
      r.onPeerLeave(({ peerId }) => this.lost({ strat: s, peer: peerId }));
      r.onError((e) => {
        if (e.code === 'peer-connect-failed')
          this.onStatus('A player could not connect directly (strict network?).');
        else if (e.code === 'relay-failed')
          this.onStatus('Some matchmaking servers are unreachable (usually fine: others are tried too).');
      });
      hi.onMessage((d, { peerId }) => {
        if (typeof d !== 'string' || d.length > 64 || d === this.selfId) return;
        this.found(d, { strat: s, peer: peerId });
      });
      msg.onMessage((d, { peerId }) => {
        const sid = this.sidOf.get(`${s}:${peerId}`);
        if (!sid || typeof d !== 'string' || d.length > MAX_MESSAGE_CHARS) return;
        if (this.bySid.get(sid)?.[0] && this.key(this.bySid.get(sid)![0]!) !== `${s}:${peerId}`) return; // spare path: ignore duplicates
        this.onMessage(d, sid);
      });
    }
    if (!this.rooms.size) throw new Error('No connection method available');
  }

  private found(sid: string, p: Path): void {
    this.sidOf.set(this.key(p), sid);
    const paths = this.bySid.get(sid);
    if (paths) {
      if (!paths.some((x) => this.key(x) === this.key(p))) paths.push(p);
      return;
    }
    this.bySid.set(sid, [p]);
    this.onPeerJoin(sid);
  }

  private lost(p: Path): void {
    const k = this.key(p);
    const sid = this.sidOf.get(k);
    this.sidOf.delete(k);
    if (!sid) return;
    const paths = (this.bySid.get(sid) ?? []).filter((x) => this.key(x) !== k);
    if (paths.length) this.bySid.set(sid, paths);
    else {
      this.bySid.delete(sid);
      this.onPeerLeave(sid);
    }
  }

  send(data: string, to?: string): void {
    const targets = to ? [to] : [...this.bySid.keys()];
    const per = new Map<Strategy, string[]>();
    for (const sid of targets) {
      const p = this.bySid.get(sid)?.[0];
      if (p) per.set(p.strat, [...(per.get(p.strat) ?? []), p.peer]);
    }
    for (const [s, peers] of per)
      void this.rooms
        .get(s)
        ?.msg.send(data, { target: peers })
        .catch(() => {});
  }

  peers(): string[] {
    return [...this.bySid.keys()];
  }

  leave(): void {
    for (const { room } of this.rooms.values()) void room.leave().catch(() => {});
    this.rooms.clear();
    this.bySid.clear();
    this.sidOf.clear();
  }
}

/** `?net=local` → BroadcastChannel; `?net=nostr|torrent` → one strategy; default → all strategies. */
export function createTransport(search: string): Transport {
  const net = new URLSearchParams(search).get('net');
  if (net === 'local') return new LocalTransport();
  if (net === 'nostr' || net === 'torrent') return new TrysteroTransport([net]);
  return new TrysteroTransport();
}

export const transportKind = (search: string): string => new URLSearchParams(search).get('net') ?? 'p2p';
