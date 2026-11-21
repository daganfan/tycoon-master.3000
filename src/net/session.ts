import { formatCash, num, type Num } from '@/core/num';
import type { Game } from '@/sim/game';
import { deserialize, serialize } from '@/sim/save';
import { SAVE_VERSION } from '@/sim/state';
import type { World } from '@/world/world';
import { EmoteBubble, RemoteAvatar, avatarPose, type NetHooks } from '@/world/remote';
import {
  BODY_HZ,
  GUEST_TIMEOUT,
  HOST_SILENCE,
  INTERP_DELAY,
  JOIN_TIMEOUT,
  KEYFRAME_EVERY,
  MAX_GUEST_SPEED,
  MAX_PLAYERS,
  POSE_HZ,
  PROTOCOL,
  ROSTER_HZ,
  SCREEN_FPS,
  STATE_HZ,
} from './config';
import { HostBodies, GuestBodies } from './bodies';
import { smoothPing } from './interp';
import { loadProfile, type Profile } from './profile';
import {
  GUEST_LIMITS,
  TokenBucket,
  encode,
  inviteLink,
  makeRoomCode,
  parseFromGuest,
  parseFromHost,
  cleanText,
  type Emote,
  type GuestMsg,
  type HostMsg,
  type Pose,
  type PoseRow,
  type RosterEntry,
  type Vec3,
} from './protocol';
import { GuestScreens, VisitorScreen } from './screens';
import { createTransport, type Transport } from './transport';
import { addChat, homeUrl, netActions, netInfo, touch } from './state';

export { netInfo };

/**
 * Multiplayer session: "visit / co-op in the host's home".
 *  - The HOST simulates everything (its own save), streams the room to guests,
 *    owns the wallet, and validates every guest message.
 *  - A GUEST builds a read-only copy of the host's room from a snapshot, walks
 *    around with its own avatar, and sends inputs (pose, chat, screen clicks).
 * The guest's own save is never loaded or written while visiting.
 */

const now = (): number => performance.now() / 1000;
const EMOTE_TIME: Record<Emote, number> = { 0: 0, 1: 2.5, 2: 5, 3: 2.6 };

/* ------------------------------------------------------------------ shared */

abstract class Session {
  readonly avatars = new Map<string, RemoteAvatar>();
  protected bubble: EmoteBubble;
  protected emote: { e: Emote; until: number } = { e: 0, until: 0 };
  protected time = 0;
  profile: Profile = loadProfile();

  constructor(
    readonly transport: Transport,
    readonly game: Game,
    readonly world: World,
  ) {
    this.bubble = new EmoteBubble(world.scene);
  }

  abstract hooks: NetHooks;
  abstract chat(text: string): void;
  abstract close(): void;

  currentEmote(): Emote {
    if (this.emote.e && now() > this.emote.until) this.emote = { e: 0, until: 0 };
    return this.emote.e;
  }

  setEmote(e: Emote): void {
    this.emote = { e, until: now() + EMOTE_TIME[e] };
    if (e === 3) this.world.chaos.tryFlop();
  }

  protected avatarFor(id: string, name: string, color: string): RemoteAvatar {
    let a = this.avatars.get(id);
    if (!a) {
      a = new RemoteAvatar(this.world.phys, this.world.scene, name, color);
      this.avatars.set(id, a);
    }
    return a;
  }

  protected dropAvatar(id: string): void {
    this.avatars.get(id)?.dispose();
    this.avatars.delete(id);
  }

  protected tickAvatars(dt: number): void {
    this.time += dt;
    const rt = now() - INTERP_DELAY;
    for (const a of this.avatars.values()) a.update(dt, rt, this.time);
  }

  protected tickBubble(): void {
    this.bubble.set(this.currentEmote(), this.world.avatar.position, this.time);
  }

  protected disposeAll(): void {
    for (const id of [...this.avatars.keys()]) this.dropAvatar(id);
    this.bubble.dispose();
    if (this.world.netHooks === this.hooks) this.world.netHooks = null;
  }
}

/* ------------------------------------------------------------------ host */

interface GuestRec {
  id: string;
  name: string;
  color: string;
  avatar: RemoteAvatar;
  lastSeen: number;
  buckets: Map<string, TokenBucket>;
  ping: number;
  helped: Num;
  pending: Num;
  last?: { p: Vec3; t: number };
  focus: number;
  screens: Map<number, VisitorScreen>;
  frameAcc: number;
}

class HostSession extends Session {
  readonly guests = new Map<string, GuestRec>();
  private banned = new Set<string>();
  private bodies: HostBodies;
  private acc = { body: 0, pose: 0, roster: 0, state: 0, ping: 0, kf: 0, toast: 0 };
  private stateSoon = false;
  private offs: (() => void)[] = [];
  control = true;

  hooks: NetHooks = {
    prePhysics: (dt) => this.tickAvatars(dt),
    postPhysics: (dt) => this.post(dt),
    screenInput: () => false,
  };

  constructor(
    transport: Transport,
    game: Game,
    world: World,
    readonly code: string,
  ) {
    super(transport, game, world);
    this.bodies = new HostBodies(world);
    transport.onMessage = (raw, from) => this.receive(raw, from);
    transport.onPeerLeave = (id) => this.removeGuest(id, 'left');
    transport.onStatus = (s) => {
      netInfo.status = s;
      touch();
    };
    const soon = () => (this.stateSoon = true);
    this.offs.push(
      game.bus.on('itemBought', soon),
      game.bus.on('cosmeticsChanged', soon),
      game.bus.on('tycoonInstalled', soon),
      game.bus.on('nodeBought', soon),
    );
    world.netHooks = this.hooks;
  }

  private send(m: HostMsg, to?: string): void {
    this.transport.send(encode(m), to);
  }

  private stateMsg(): string {
    return serialize(this.game.state);
  }

  private receive(raw: string, from: string): void {
    const m = parseFromGuest(raw);
    if (!m) return;
    const t = performance.now();
    if (m.t === 'hello') return this.hello(m, from);
    const g = this.guests.get(from);
    if (!g) return;
    let b = g.buckets.get(m.t);
    if (!b) g.buckets.set(m.t, (b = new TokenBucket(GUEST_LIMITS[m.t][0], GUEST_LIMITS[m.t][1], t)));
    if (!b.take(t)) return;
    g.lastSeen = now();
    switch (m.t) {
      case 'pose':
        return this.pose(g, m);
      case 'chat':
        this.broadcastChat(g.name, g.color, m.text);
        return;
      case 'scr':
        return this.screen(g, m);
      case 'pong':
        g.ping = smoothPing(g.ping, Math.max(0, t - m.n));
        return;
      case 'bye':
        return this.removeGuest(from, 'left');
    }
  }

  private hello(m: Extract<GuestMsg, { t: 'hello' }>, from: string): void {
    if (this.banned.has(from))
      return this.send({ t: 'reject', reason: 'The host removed you from this room.' }, from);
    if (m.proto !== PROTOCOL || m.save !== SAVE_VERSION)
      return this.send(
        {
          t: 'reject',
          reason: 'You and the host have different game versions. Both of you: reload the page to update.',
        },
        from,
      );
    let g = this.guests.get(from);
    if (!g) {
      if (this.guests.size >= MAX_PLAYERS - 1)
        return this.send({ t: 'reject', reason: `The room is full (${MAX_PLAYERS} players max).` }, from);
      g = {
        id: from,
        name: m.name,
        color: m.color,
        avatar: new RemoteAvatar(this.world.phys, this.world.scene, m.name, m.color, 'pusher'),
        lastSeen: now(),
        buckets: new Map(),
        ping: 0,
        helped: num(0),
        pending: num(0),
        focus: -1,
        screens: new Map(),
        frameAcc: 0,
      };
      this.guests.set(from, g);
      this.avatars.set(from, g.avatar);
      addChat('', '', `${m.name} joined`, true);
      this.send({ t: 'chat', name: '', color: '#ffffff', text: `${m.name} joined`, sys: true });
    }
    g.lastSeen = now();
    this.send(
      { t: 'welcome', you: from, host: this.profile.name, state: this.stateMsg(), control: this.control },
      from,
    );
    this.bodies.keyframeSoon();
    this.acc.roster = 1;
    this.refreshRoster();
  }

  private pose(g: GuestRec, m: Pose): void {
    // Anti-teleport: a guest can't move faster than MAX_GUEST_SPEED.
    const t = now();
    let p = m.p;
    if (g.last) {
      const dt = Math.max(0.016, t - g.last.t);
      const d = Math.hypot(p[0] - g.last.p[0], p[1] - g.last.p[1], p[2] - g.last.p[2]);
      const max = MAX_GUEST_SPEED * dt + 0.25;
      if (d > max) {
        const k = max / d;
        p = [
          g.last.p[0] + (p[0] - g.last.p[0]) * k,
          g.last.p[1] + (p[1] - g.last.p[1]) * k,
          g.last.p[2] + (p[2] - g.last.p[2]) * k,
        ];
      }
    }
    g.last = { p, t };
    g.avatar.push(t, { ...m, p });
  }

  private screen(g: GuestRec, m: Extract<GuestMsg, { t: 'scr' }>): void {
    if (!this.world.screens[m.i]) return;
    if (m.k === 'focus') {
      g.focus = m.i;
      g.frameAcc = 1;
      return;
    }
    if (m.k === 'blur') {
      g.focus = -1;
      return;
    }
    if (!this.control || g.focus !== m.i) return;
    let vs = g.screens.get(m.i);
    if (!vs) g.screens.set(m.i, (vs = new VisitorScreen(this.world, m.i)));
    vs.input(m.k, m.x, m.y);
    if (m.k === 'click') g.frameAcc = 1;
  }

  broadcastChat(name: string, color: string, text: string): void {
    addChat(name, color, text);
    this.send({ t: 'chat', name, color, text, sys: false });
  }

  chat(text: string): void {
    const clean = cleanText(text, 140);
    if (clean) this.broadcastChat(this.profile.name, this.profile.color, clean);
  }

  kick(id: string): void {
    const g = this.guests.get(id);
    if (!g) return;
    this.send({ t: 'kick' }, id);
    this.banned.add(id);
    this.removeGuest(id, 'was removed by the host');
  }

  setControl(on: boolean): void {
    this.control = on;
    this.stateSoon = true;
    touch();
  }

  removeGuest(id: string, why: string): void {
    const g = this.guests.get(id);
    if (!g) return;
    this.guests.delete(id);
    this.dropAvatar(id);
    addChat('', '', `${g.name} ${why}`, true);
    this.send({ t: 'chat', name: '', color: '#ffffff', text: `${g.name} ${why}`, sys: true });
    this.refreshRoster();
  }

  private roster(): RosterEntry[] {
    return [
      {
        id: this.transport.selfId,
        name: this.profile.name,
        color: this.profile.color,
        host: true,
        ping: 0,
        helped: '',
      },
      ...[...this.guests.values()].map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        host: false,
        ping: Math.round(g.ping),
        helped: g.helped.gt(0) ? formatCash(g.helped) : '',
      })),
    ];
  }

  private refreshRoster(): void {
    netInfo.players = this.roster();
    for (const g of this.guests.values()) g.avatar.setLabel(g.name, g.color);
    touch();
  }

  /** Guests vacuum up coins near their avatar; the money goes into the HOST's wallet. */
  private pickups(): void {
    const cash = this.world.cash;
    for (const g of this.guests.values()) {
      const p = g.avatar.latest();
      if (!p) continue;
      for (let i = cash.bits.length - 1; i >= 0; i--) {
        const b = cash.bits[i]!;
        if (b.age <= 0.6) continue;
        const t = b.body.translation();
        if (Math.hypot(p.x - t.x, p.z - t.z) > 0.5 || Math.abs(p.y - 0.4 - t.y) > 1.1) continue;
        const before = this.game.state.cash;
        this.game.collect(b.value, b.kind === 0 ? 1 : b.kind === 1 ? 10 : 50);
        const gained = this.game.state.cash.sub(before);
        g.helped = g.helped.add(gained);
        g.pending = g.pending.add(gained);
        this.world.phys.world.removeRigidBody(b.body);
        cash.bits.splice(i, 1);
      }
    }
  }

  private post(dt: number): void {
    this.tickBubble();
    this.pickups();
    const a = this.acc;
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] += dt;
    const anyone = this.guests.size > 0;
    if (!anyone) return;

    if (a.body >= 1 / BODY_HZ) {
      a.body = 0;
      const kf = a.kf >= KEYFRAME_EVERY;
      if (kf) a.kf = 0;
      const m = this.bodies.build(kf);
      if (m) this.send(m);
    }
    if (a.pose >= 1 / POSE_HZ) {
      a.pose = 0;
      const rows: PoseRow[] = [];
      const me = avatarPose(this.world.avatar, this.currentEmote());
      rows.push([this.transport.selfId, ...me.p, ...me.q, me.s, me.r, me.e]);
      for (const g of this.guests.values()) {
        const s = g.avatar.buf.latest;
        if (s) rows.push([g.id, ...s.p, ...s.q, g.avatar.speed, g.avatar.ragdoll ? 1 : 0, g.avatar.emote]);
      }
      this.send({ t: 'poses', l: rows });
    }
    if (a.state >= 1 / STATE_HZ || this.stateSoon) {
      a.state = 0;
      this.stateSoon = false;
      this.send({ t: 'state', state: this.stateMsg(), control: this.control });
    }
    if (a.roster >= 1 / ROSTER_HZ) {
      a.roster = 0;
      this.refreshRoster();
      this.send({ t: 'roster', l: netInfo.players });
      const t = now();
      for (const g of [...this.guests.values()])
        if (t - g.lastSeen > GUEST_TIMEOUT) this.removeGuest(g.id, 'timed out');
    }
    if (a.ping >= 2) {
      a.ping = 0;
      this.send({ t: 'ping', n: performance.now() });
    }
    if (a.toast >= 1.5) {
      a.toast = 0;
      for (const g of this.guests.values()) {
        if (g.pending.lte(0)) continue;
        const amt = formatCash(g.pending);
        g.pending = num(0);
        this.game.bus.emit('notify', { text: `👥 ${g.name} picked up ${amt}`, tone: 'good' });
        this.send({ t: 'toast', text: `🪙 You picked up ${amt} for ${this.profile.name}` }, g.id);
      }
    }
    // Screen streams for guests using a monitor
    for (const g of this.guests.values()) {
      if (g.focus < 0 || !this.world.screens[g.focus]) continue;
      g.frameAcc += dt;
      if (g.frameAcc < 1 / SCREEN_FPS) continue;
      let vs = g.screens.get(g.focus);
      if (!vs) g.screens.set(g.focus, (vs = new VisitorScreen(this.world, g.focus)));
      const img = vs.frame(g.frameAcc);
      g.frameAcc = 0;
      this.send({ t: 'frame', i: g.focus, img }, g.id);
    }
  }

  close(): void {
    this.send({ t: 'bye' });
    this.offs.forEach((o) => o());
    this.guests.clear();
    this.disposeAll();
    setTimeout(() => this.transport.leave(), 200);
  }
}

/* ------------------------------------------------------------------ guest */

export interface GuestLink {
  transport: Transport;
  hostId: string;
  welcome: Extract<HostMsg, { t: 'welcome' }>;
  buffered: [string, string][];
}

class GuestSession extends Session {
  private bodies: GuestBodies;
  private screens: GuestScreens;
  private hostId: string;
  private lastHost = now();
  private lastFrame = now();
  private acc = { pose: 0, hello: 0 };
  private focus = -1;
  private moveBucket = new TokenBucket(25, 30, performance.now());
  private roster: RosterEntry[] = [];

  hooks: NetHooks = {
    prePhysics: (dt) => {
      this.bodies.drive(now() - INTERP_DELAY);
      this.tickAvatars(dt);
    },
    postPhysics: (dt) => this.post(dt),
    screenInput: (i, k, x, y) => {
      if (netInfo.control && i === this.focus && (k !== 'move' || this.moveBucket.take(performance.now())))
        this.send({ t: 'scr', i, k, x: Math.round(x), y: Math.round(k === 'wheel' ? y : y) });
      return true; // never touch the local copy of the host's game
    },
  };

  constructor(link: GuestLink, game: Game, world: World) {
    super(link.transport, game, world);
    this.hostId = link.hostId;
    this.bodies = new GuestBodies(world);
    this.screens = new GuestScreens(world);
    this.bodies.clearLocalCoins();
    this.bodies.pinAll();
    // Don't spawn inside the host.
    const b = world.avatar.body;
    b.setTranslation({ x: 0.3 + (Math.random() - 0.5) * 1.6, y: 1, z: 0.9 + Math.random() * 0.6 }, true);
    netInfo.mode = 'guest';
    netInfo.hostName = link.welcome.host;
    netInfo.you = link.welcome.you;
    netInfo.control = link.welcome.control;
    netInfo.status = '';
    touch();
    const t = link.transport;
    t.onMessage = (raw, from) => this.receive(raw, from);
    t.onPeerLeave = (id) => {
      if (id === this.hostId) this.lost();
    };
    t.onPeerJoin = (id) => {
      if (netInfo.mode === 'lost') t.send(this.helloMsg(), id);
    };
    for (const [raw, from] of link.buffered) this.receive(raw, from);
    world.netHooks = this.hooks;
    addChat('', '', `You are visiting ${link.welcome.host}'s room. Coins you grab go to their wallet!`, true);
  }

  private helloMsg(): string {
    return encode({
      t: 'hello',
      proto: PROTOCOL,
      save: SAVE_VERSION,
      name: this.profile.name,
      color: this.profile.color,
    });
  }

  private send(m: GuestMsg): void {
    this.transport.send(encode(m), this.hostId);
  }

  private lost(): void {
    if (netInfo.mode !== 'guest') return;
    netInfo.mode = 'lost';
    netInfo.status = 'Lost the connection to the host. Trying to reconnect…';
    touch();
  }

  private receive(raw: string, from: string): void {
    const m = parseFromHost(raw);
    if (!m) return;
    if (from !== this.hostId) {
      // Only a fresh welcome may move us to a new host connection (reconnect).
      if (m.t !== 'welcome' || netInfo.mode !== 'lost') return;
      this.hostId = from;
    }
    this.lastHost = now();
    if (netInfo.mode === 'lost' && m.t !== 'bye' && m.t !== 'kick') {
      netInfo.mode = 'guest';
      netInfo.status = '';
      touch();
    }
    switch (m.t) {
      case 'welcome':
        netInfo.you = m.you;
        this.applyState(m.state, m.control);
        return;
      case 'state':
        return this.applyState(m.state, m.control);
      case 'bodies':
        return this.bodies.apply(m, now());
      case 'poses': {
        const t = now();
        for (const r of m.l) {
          if (r[0] === netInfo.you) continue;
          const info = this.roster.find((x) => x.id === r[0]);
          const a = this.avatarFor(r[0], info?.name ?? '…', info?.color ?? '#888888');
          a.push(t, {
            p: [r[1], r[2], r[3]],
            q: [r[4], r[5], r[6], r[7]],
            s: r[8],
            r: r[9] ? 1 : 0,
            e: Math.max(0, Math.min(3, Math.round(r[10]))) as Emote,
          });
        }
        return;
      }
      case 'roster':
        this.roster = m.l;
        netInfo.players = m.l;
        for (const r of m.l) this.avatars.get(r.id)?.setLabel(r.name, r.color);
        for (const id of [...this.avatars.keys()]) if (!m.l.some((r) => r.id === id)) this.dropAvatar(id);
        touch();
        return;
      case 'chat':
        addChat(m.name, m.color, m.text, m.sys);
        return;
      case 'toast':
        this.game.bus.emit('notify', { text: m.text, tone: 'good' });
        return;
      case 'frame':
        if (m.i === this.focus) this.screens.frame(m.i, m.img);
        return;
      case 'ping':
        this.send({ t: 'pong', n: m.n });
        return;
      case 'kick':
        return this.ended('The host removed you from the room.');
      case 'bye':
        return this.ended('The host closed the room.');
      case 'reject':
        return this.ended(m.reason);
    }
  }

  private ended(why: string): void {
    netInfo.mode = 'ended';
    netInfo.status = why;
    touch();
    this.transport.leave();
  }

  /** Replace the mirrored game state; spawn whatever the host bought meanwhile. */
  private applyState(text: string, control: boolean): void {
    let s;
    try {
      s = deserialize(text);
    } catch {
      return;
    }
    const g = this.game;
    const before = g.state.items;
    const eqBefore = JSON.stringify(g.state.cosmetics.equipped);
    // The local copy never ticks, so it is safe to swap the whole state object.
    g.state = s;
    g.rebuildStats();
    for (const [id, count] of Object.entries(s.items)) {
      for (let k = before[id] ?? 0; k < Math.min(count, 200); k++)
        g.bus.emit('itemBought', { id, count: k + 1 });
    }
    if (JSON.stringify(s.cosmetics.equipped) !== eqBefore) g.bus.emit('cosmeticsChanged', {});
    if (netInfo.control !== control) {
      netInfo.control = control;
      touch();
    }
  }

  private post(dt: number): void {
    this.tickBubble();
    this.bodies.renderCoins(now() - INTERP_DELAY);
    const w = this.world;
    const f = w.focus ? w.screens.indexOf(w.focus) : -1;
    if (f !== this.focus) {
      if (this.focus >= 0) this.send({ t: 'scr', i: this.focus, k: 'blur', x: 0, y: 0 });
      this.focus = f;
      if (f >= 0) this.send({ t: 'scr', i: f, k: 'focus', x: 0, y: 0 });
    }
    this.screens.update(this.focus);
    this.acc.pose += dt;
    if (this.acc.pose >= 1 / POSE_HZ && netInfo.mode !== 'ended') {
      this.acc.pose = 0;
      this.send({ t: 'pose', ...avatarPose(w.avatar, this.currentEmote()) });
    }
    // If this tab itself froze (shader compile, GC, slow machine), queued host messages
    // haven't been processed yet — don't blame the host for our own stall.
    const t = now();
    if (t - this.lastFrame > 1) this.lastHost = Math.max(this.lastHost, t - 1);
    this.lastFrame = t;
    if (netInfo.mode === 'guest' && t - this.lastHost > HOST_SILENCE) this.lost();
    // Knock again every few (real) seconds until the host answers with a fresh welcome.
    if (netInfo.mode === 'lost' && now() - this.acc.hello > 3) {
      this.acc.hello = now();
      this.transport.send(this.helloMsg());
    }
  }

  chat(text: string): void {
    const clean = cleanText(text, 140);
    if (clean) this.send({ t: 'chat', text: clean });
  }

  close(): void {
    this.send({ t: 'bye' });
    this.disposeAll();
    setTimeout(() => this.transport.leave(), 100);
  }
}

/* ------------------------------------------------------------------ API */

let active: HostSession | GuestSession | null = null;
let home: { game: Game; world: World } | null = null;
let keysBound = false;

function bindKeys(): void {
  if (keysBound) return;
  keysBound = true;
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (!active || tag === 'INPUT' || tag === 'TEXTAREA' || e.repeat) return;
    if (active.world.focus) return;
    const map: Record<string, Emote> = { Digit1: 1, Digit2: 2, Digit3: 3 };
    const em = map[e.code];
    if (em) active.setEmote(em);
  });
  window.addEventListener('beforeunload', () => {
    if (active instanceof GuestSession) active.close();
    else if (active instanceof HostSession) active.close();
  });
}

/** Called by main.ts once the player's own world is up, so the HUD can offer "Host a room". */
export function registerHome(game: Game, world: World): void {
  home = { game, world };
  bindKeys();
}

export async function startHosting(): Promise<void> {
  if (!home || active) return;
  const code = makeRoomCode();
  const t = createTransport(location.search);
  netInfo.mode = 'hosting';
  netInfo.code = code;
  netInfo.link = inviteLink(location.href, code);
  netInfo.status = 'Opening the room…';
  netInfo.control = true;
  touch();
  try {
    await t.join(code);
  } catch (e) {
    netInfo.mode = 'off';
    netInfo.status = `Couldn't open a room: ${(e as Error).message}`;
    touch();
    return;
  }
  active = new HostSession(t, home.game, home.world, code);
  netInfo.status = '';
  netInfo.players = [
    { id: t.selfId, name: active.profile.name, color: active.profile.color, host: true, ping: 0, helped: '' },
  ];
  addChat('', '', `Room ${code} is open. Send your friends the invite link!`, true);
}

export function stopHosting(): void {
  if (!(active instanceof HostSession)) return;
  active.close();
  active = null;
  netInfo.mode = 'off';
  netInfo.code = netInfo.link = netInfo.status = '';
  netInfo.players = [];
  touch();
}

export function kick(id: string): void {
  if (active instanceof HostSession) active.kick(id);
}

export function setControl(on: boolean): void {
  if (active instanceof HostSession) active.setControl(on);
}

export function sendChat(text: string): void {
  active?.chat(text);
}

export function emote(e: Emote): void {
  active?.setEmote(e);
}

/** Guest: go back to your own room (reloads without ?join). */
export function leaveRoom(): void {
  if (active instanceof GuestSession) active.close();
  active = null;
  setTimeout(() => (location.href = homeUrl()), 150);
}

export const goHomeUrl = homeUrl;

/**
 * Guest step 1 (before any world exists): reach the host and get the room
 * snapshot. Rejects with a friendly message on failure.
 */
export function connectGuest(code: string, onStatus: (s: string) => void): Promise<GuestLink> {
  const t = createTransport(location.search);
  const p = loadProfile();
  const hello = encode({ t: 'hello', proto: PROTOCOL, save: SAVE_VERSION, name: p.name, color: p.color });
  netInfo.mode = 'joining';
  netInfo.code = code;
  touch();
  return new Promise((resolve, reject) => {
    let done = false;
    const buffered: [string, string][] = [];
    const iv = setInterval(() => t.send(hello), 3000);
    const finish = (err: Error | null, link?: GuestLink) => {
      if (done) return;
      done = true;
      clearInterval(iv);
      clearTimeout(to);
      if (err) {
        t.leave();
        netInfo.mode = 'ended';
        netInfo.status = err.message;
        touch();
        reject(err);
      } else resolve(link!);
    };
    const to = setTimeout(
      () =>
        finish(
          new Error(
            `Couldn't reach room ${code}. Is the host still in the game? (Some strict networks block direct connections.)`,
          ),
        ),
      JOIN_TIMEOUT * 1000,
    );
    t.onStatus = onStatus;
    t.onPeerJoin = (id) => {
      onStatus('Found someone, saying hello…');
      t.send(hello, id);
    };
    t.onMessage = (raw, from) => {
      if (done) {
        if (buffered.length < 400) buffered.push([raw, from]);
        return;
      }
      const m = parseFromHost(raw);
      if (m?.t === 'welcome') finish(null, { transport: t, hostId: from, welcome: m, buffered });
      else if (m?.t === 'reject') finish(new Error(m.reason));
    };
    t.join(code)
      .then(() => {
        onStatus(`Looking for room ${code}…`);
        t.send(hello);
      })
      .catch((e: Error) => finish(new Error(`Couldn't connect: ${e.message}`)));
  });
}

/** Guest step 2: the visitor world is built; start replicating. */
export function attachGuest(link: GuestLink, game: Game, world: World): void {
  bindKeys();
  active = new GuestSession(link, game, world);
}

export function isGuest(): boolean {
  return active instanceof GuestSession;
}

/** Debug / test handle. */
export function netDebug(): { mode: string; avatars: string[]; guests: number; where: number[][] } {
  const list = [...(active?.avatars.values() ?? [])];
  return {
    mode: netInfo.mode,
    avatars: list.map((a) => a.name),
    where: list.map((a) => a.group.position.toArray().map((v) => Math.round(v * 100) / 100)),
    guests: active instanceof HostSession ? active.guests.size : 0,
  };
}

// Wire the lightweight UI actions (src/net/state.ts) to this session code.
Object.assign(netActions, {
  startHosting,
  stopHosting,
  kick,
  setControl,
  sendChat,
  emote,
  leaveRoom,
  profileChanged: (p: Profile) => {
    if (active) active.profile = p;
  },
});
