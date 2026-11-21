import * as THREE from 'three';
import type { World } from '@/world/world';
import type { PhysObj } from '@/world/physics';
import { spawnToy } from '@/world/props';
import { BODY_BUDGET } from './config';
import { BODY_COIN, BODY_PROP, decodeBodies, encodeBodies, type BodyRec } from './codec';
import { InterpBuffer } from './interp';
import type { HostMsg, RegEntry } from './protocol';

/**
 * Physics replication. The host owns every dynamic body (props, decor, toys,
 * coins) and streams quantized transforms; guests pin those bodies as kinematic
 * and glide them between snapshots. Coins are render-only on guests.
 */

const TOY_KINDS = new Set(['duck', 'sock', 'remote']);
const POS_EPS = 0.002;
const ROT_EPS = 2e-5;

type Pose7 = Omit<BodyRec, 'id' | 'type'>;

function poseOf(body: PhysObj['body']): Pose7 {
  const t = body.translation();
  const r = body.rotation();
  return { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w };
}

function change(a: Pose7, b: Pose7): number {
  const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const dot = Math.abs(a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw);
  const rot = 1 - Math.min(1, dot);
  return d > POS_EPS || rot > ROT_EPS ? d + rot * 4 : 0;
}

/* ------------------------------------------------------------ host */

export class HostBodies {
  private ids = new WeakMap<object, number>();
  private next = 1;
  private sent = new Map<number, Pose7>();
  private reg = new Map<number, RegEntry>();
  private regSent = new Set<number>();
  private alive = new Set<number>();
  private gone: number[] = [];
  private forceKf = true;

  constructor(private readonly world: World) {}

  private idOf(o: object): number {
    let id = this.ids.get(o);
    if (!id) this.ids.set(o, (id = this.next++));
    return id;
  }

  /** Next packet will be a full keyframe (someone joined). */
  keyframeSoon(): void {
    this.forceKf = true;
  }

  /** Build the next body packet, or null when nothing moved. */
  build(keyframe: boolean): Extract<HostMsg, { t: 'bodies' }> | null {
    const kf = keyframe || this.forceKf;
    this.forceKf = false;
    const now = new Set<number>();
    const cand: { rec: BodyRec; score: number }[] = [];
    const newReg: RegEntry[] = [];
    for (const o of this.world.phys.objs) {
      if (o.kind === 'avatar' || o.body.isFixed()) continue;
      const id = this.idOf(o);
      now.add(id);
      if (!this.reg.has(id)) this.reg.set(id, [id, o.id ?? '', o.kind.slice(0, 32)]);
      const p = poseOf(o.body);
      const prev = this.sent.get(id);
      const score = prev ? change(prev, p) : 1e3;
      if (kf || score > 0) cand.push({ rec: { id, type: BODY_PROP, ...p }, score });
    }
    for (const b of this.world.cash.bits) {
      const id = this.idOf(b);
      now.add(id);
      const p = poseOf(b.body);
      const prev = this.sent.get(id);
      const score = prev ? change(prev, p) : 1e3;
      if (kf || score > 0) cand.push({ rec: { id, type: BODY_COIN + b.kind, ...p }, score });
    }
    for (const id of this.alive)
      if (!now.has(id)) {
        this.gone.push(id);
        this.sent.delete(id);
        this.reg.delete(id);
        this.regSent.delete(id);
      }
    this.alive = now;
    let recs = cand;
    if (!kf && recs.length > BODY_BUDGET) recs = recs.sort((a, b) => b.score - a.score).slice(0, BODY_BUDGET);
    for (const { rec } of recs) {
      const { id, type: _t, ...p } = rec;
      void _t;
      this.sent.set(id, p);
      const r = this.reg.get(id);
      if (r && (kf || !this.regSent.has(id))) {
        newReg.push(r);
        this.regSent.add(id);
      }
    }
    if (!kf && !recs.length && !this.gone.length) return null;
    const msg = {
      t: 'bodies' as const,
      kf,
      d: encodeBodies(recs.map((r) => r.rec)),
      reg: newReg,
      gone: this.gone,
    };
    this.gone = [];
    return msg;
  }
}

/* ------------------------------------------------------------ guest */

interface GuestProp {
  sid: string;
  kind: string;
  obj?: PhysObj;
  toy: boolean;
  buf: InterpBuffer;
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

export class GuestBodies {
  readonly props = new Map<number, GuestProp>();
  readonly coins = new Map<number, { kind: number; buf: InterpBuffer }>();
  private pinned = new WeakSet<object>();

  constructor(private readonly world: World) {}

  /** Make every host-owned body kinematic: the host simulates, we only display. */
  pinAll(): void {
    const R = this.world.phys.R;
    for (const o of this.world.phys.objs) {
      if (o.kind === 'avatar' || this.pinned.has(o) || o.body.isFixed()) continue;
      o.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
      this.pinned.add(o);
    }
  }

  /** Remove the coins the local Cash spawned (floor cash restore): coins come from the host. */
  clearLocalCoins(): void {
    const c = this.world.cash;
    for (const b of c.bits) this.world.phys.world.removeRigidBody(b.body);
    c.bits.length = 0;
  }

  private resolve(id: number, p: GuestProp, at: BodyRec | undefined): void {
    if (p.obj) return;
    if (p.sid) {
      p.obj = this.world.phys.objs.find((o) => o.id === p.sid);
      return;
    }
    if (p.toy && at) {
      const w = this.world;
      const obj = spawnToy(p.kind, new THREE.Vector3(at.x, at.y, at.z), new THREE.Vector3(), w.scene, w.phys);
      w.props.push(obj);
      p.obj = obj;
      this.pinAll();
      void id;
    }
  }

  apply(m: Extract<HostMsg, { t: 'bodies' }>, now: number): void {
    for (const [id, sid, kind] of m.reg) {
      if (!this.props.has(id))
        this.props.set(id, { sid, kind, toy: !sid && TOY_KINDS.has(kind), buf: new InterpBuffer(1 / 12) });
    }
    const recs = decodeBodies(m.d);
    const seen = m.kf ? new Set<number>() : null;
    for (const r of recs) {
      seen?.add(r.id);
      const sample = {
        t: now,
        p: [r.x, r.y, r.z] as [number, number, number],
        q: [r.qx, r.qy, r.qz, r.qw] as [number, number, number, number],
      };
      if (r.type === BODY_PROP) {
        const p = this.props.get(r.id);
        if (!p) continue;
        this.resolve(r.id, p, r);
        p.buf.push(sample);
      } else if (r.type >= BODY_COIN && r.type <= BODY_COIN + 2) {
        let c = this.coins.get(r.id);
        if (!c) this.coins.set(r.id, (c = { kind: r.type - BODY_COIN, buf: new InterpBuffer(1 / 12) }));
        c.buf.push(sample);
      }
    }
    for (const id of m.gone) this.drop(id);
    if (seen) {
      for (const id of [...this.props.keys()]) if (!seen.has(id)) this.drop(id);
      for (const id of [...this.coins.keys()]) if (!seen.has(id)) this.coins.delete(id);
    }
  }

  private drop(id: number): void {
    this.coins.delete(id);
    const p = this.props.get(id);
    if (!p) return;
    this.props.delete(id);
    if (p.toy && p.obj) {
      const i = this.world.props.indexOf(p.obj);
      if (i >= 0) this.world.props.splice(i, 1);
      this.world.phys.remove(p.obj);
    }
  }

  /** Before physics: move pinned bodies to their interpolated poses. */
  drive(renderT: number): void {
    this.pinAll();
    for (const p of this.props.values()) {
      if (!p.obj) {
        if (p.sid) this.resolve(0, p, undefined);
        continue;
      }
      const s = p.buf.sample(renderT);
      if (!s) continue;
      const b = p.obj.body;
      b.setNextKinematicTranslation({ x: s.p[0], y: s.p[1], z: s.p[2] });
      b.setNextKinematicRotation({ x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] });
    }
  }

  /** After the local Cash renders (nothing): draw the host's coins as instances. */
  renderCoins(renderT: number): void {
    const meshes = this.world.cash.meshes;
    const counts = [0, 0, 0];
    for (const c of this.coins.values()) {
      const m = meshes[c.kind];
      const s = c.buf.sample(renderT);
      if (!m || !s || counts[c.kind]! >= m.instanceMatrix.count) continue;
      tmpP.set(...s.p);
      tmpQ.set(...s.q);
      tmpM.compose(tmpP, tmpQ, ONE);
      m.setMatrixAt(counts[c.kind]!++, tmpM);
    }
    meshes.forEach((m, i) => {
      m.count = counts[i]!;
      m.instanceMatrix.needsUpdate = true;
    });
  }
}
