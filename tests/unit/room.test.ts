import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { deliberatePlacement, settleVerdict, tidyOrder, needsTidy, MIN_HOLD, SETTLE_WINDOW, type TidyItem } from '@/world/tidy';
import { findSpot, footprintBox, type Surface } from '@/world/placement';
import { comfortTuning } from '@/world/physics';
import { hitsGlass, BREAK_SPEED } from '@/world/windowGlass';
import { ROOM, DOOR, WINDOW, SPAWN, FURNITURE_HOME } from '@/world/room';
import { AREAS, DOORWAY } from '@/world/garage/areas';
import { GARAGE } from '@/content/garage';
import { ACHIEVEMENTS } from '@/content/achievements';
import { Game } from '@/sim/game';
import { createInitialState, SAVE_VERSION } from '@/sim/state';
import { deserialize, serialize } from '@/sim/save';
import { num } from '@/core/num';

describe('room layout', () => {
  it('is ~1.7x the old 6 m x 5 m floor and still opens onto the garage', () => {
    const area = (ROOM.x1 - ROOM.x0) * (ROOM.z1 - ROOM.z0);
    expect(area / 30).toBeGreaterThan(1.5);
    expect(area / 30).toBeLessThan(1.8);
    expect(ROOM.x1 - ROOM.x0).toBeCloseTo(ROOM.hx * 2);
    expect(ROOM.z1 - ROOM.z0).toBeCloseTo(ROOM.hz * 2);
    // Door is in the shared wall, inside both rooms' x range.
    expect(DOOR.x - DOOR.w / 2).toBeGreaterThan(Math.max(ROOM.x0, GARAGE.x0));
    expect(DOOR.x + DOOR.w / 2).toBeLessThan(Math.min(ROOM.x1, GARAGE.x1));
    expect(GARAGE.z0).toBeGreaterThan(ROOM.z1);
    expect(DOORWAY.z0).toBeLessThan(ROOM.z1);
    expect(AREAS[0]).toMatchObject({ x0: ROOM.x0, x1: ROOM.x1, z0: ROOM.z0, z1: ROOM.z1 });
    // Window fits in the right wall, spawn is inside.
    expect(WINDOW.z - WINDOW.w / 2).toBeGreaterThan(ROOM.z0);
    expect(WINDOW.z + WINDOW.w / 2).toBeLessThan(ROOM.z1);
    expect(SPAWN.x).toBeGreaterThan(ROOM.x0);
    expect(SPAWN.x).toBeLessThan(ROOM.x1);
    for (const f of Object.values(FURNITURE_HOME)) {
      expect(f.x).toBeGreaterThan(ROOM.x0);
      expect(f.x).toBeLessThan(ROOM.x1);
      expect(f.z).toBeGreaterThan(ROOM.z0);
      expect(f.z).toBeLessThan(ROOM.z1);
    }
  });
});

describe('home rules', () => {
  it('only a deliberate, gentle set-down counts as placing', () => {
    expect(deliberatePlacement({ heldFor: 2, speed: 0.3, thrown: false, heavy: false })).toBe(true);
    expect(deliberatePlacement({ heldFor: 2, speed: 0.3, thrown: true, heavy: false })).toBe(true); // slow mouse release = set down
    expect(deliberatePlacement({ heldFor: 2, speed: 5, thrown: true, heavy: false })).toBe(false); // thrown
    expect(deliberatePlacement({ heldFor: MIN_HOLD / 2, speed: 0, thrown: false, heavy: false })).toBe(false); // a click, not a carry
    expect(deliberatePlacement({ heldFor: 3, speed: 2.5, thrown: false, heavy: false })).toBe(false); // dropped while running
    expect(deliberatePlacement({ heldFor: 3, speed: 0.8, thrown: false, heavy: true })).toBe(true); // shoved furniture into place
  });

  it('home is accepted only once it rests upright near where it was let go', () => {
    const base = { since: 0.5, lin: 0, ang: 0, upright: true, inside: true, drift: 0.02, interrupted: false };
    expect(settleVerdict(base)).toBe('accept');
    expect(settleVerdict({ ...base, lin: 0.5 })).toBe('wait');
    expect(settleVerdict({ ...base, upright: false })).toBe('reject'); // fell over
    expect(settleVerdict({ ...base, drift: 1 })).toBe('reject'); // rolled / got knocked away
    expect(settleVerdict({ ...base, since: SETTLE_WINDOW + 1, lin: 0.5 })).toBe('reject'); // never settled
    expect(settleVerdict({ ...base, interrupted: true })).toBe('reject');
    expect(settleVerdict({ ...base, inside: false })).toBe('reject');
  });
});

describe('tidy order', () => {
  const it_ = (id: string, support: boolean, homeY: number, dist = 1, angle = 0): TidyItem => ({ id, support, homeY, dist, angle });
  it('puts supports back first (lowest first), then the rest from the floor up', () => {
    const order = tidyOrder([it_('mug', false, 0.8), it_('book', false, 1.5), it_('desk', true, 0), it_('box', false, 0), it_('shelfthing', true, 0.6)]);
    expect(order.map((o) => o.id)).toEqual(['desk', 'shelfthing', 'box', 'mug', 'book']);
  });
  it('skips things that are already home, so a second tidy is a no-op', () => {
    expect(needsTidy({ dist: 0.01, angle: 0.01 })).toBe(false);
    expect(needsTidy({ dist: 0.2, angle: 0 })).toBe(true);
    expect(needsTidy({ dist: 0, angle: 0.5 })).toBe(true);
    const settled = [it_('desk', true, 0, 0.004, 0.001), it_('mug', false, 0.8, 0.01, 0.02)];
    expect(tidyOrder(settled)).toEqual([]);
  });
});

describe('placement solver', () => {
  const desk: Surface = { kind: 'desk', cx: 0, cz: 0, yaw: 0, hw: 1, hd: 0.4, y: 0.78, clear: 0.9 };
  const floor: Surface = { kind: 'floor', cx: 0, cz: 0, yaw: 0, hw: 4, hd: 3, y: 0, clear: 2.4 };

  it('finds a free spot on the surface that does not overlap anything', () => {
    const size = new THREE.Vector3(0.3, 0.3, 0.2);
    const occupied = [new THREE.Box3(new THREE.Vector3(-1, 0.78, -0.4), new THREE.Vector3(0.5, 1.4, 0.4))];
    const s = findSpot(size, [desk], occupied, { seed: 3 })!;
    expect(s).not.toBeNull();
    expect(s.surface).toBe(desk);
    expect(s.pos.y).toBeCloseTo(0.78);
    const fb = footprintBox(desk, s.pos.x, s.pos.z, size, 0);
    expect(fb.intersectsBox(occupied[0]!)).toBe(false);
    expect(s.pos.x - size.x / 2).toBeGreaterThan(0.5);
    expect(s.pos.x + size.x / 2).toBeLessThanOrEqual(1.0001);
  });

  it('places many items without overlaps, then falls back to the floor', () => {
    const size = new THREE.Vector3(0.25, 0.2, 0.25);
    const occupied: THREE.Box3[] = [];
    const kinds: string[] = [];
    for (let i = 0; i < 40; i++) {
      const s = findSpot(size, [desk, floor], occupied, { seed: i })!;
      const b = footprintBox({ ...s.surface, cx: 0, cz: 0, yaw: 0 }, s.pos.x, s.pos.z, size, s.yaw - s.surface.yaw);
      for (const o of occupied) expect(b.intersectsBox(o)).toBe(false);
      occupied.push(b);
      kinds.push(s.surface.kind);
    }
    expect(kinds.filter((k) => k === 'desk').length).toBeGreaterThanOrEqual(10);
    expect(kinds.slice(-5).every((k) => k === 'floor')).toBe(true);
  });

  it('respects head room and rotates long things to fit', () => {
    const shelf: Surface = { kind: 'shelf', cx: 0, cz: 0, yaw: 0, hw: 0.45, hd: 0.11, y: 1.5, clear: 0.3 };
    expect(findSpot(new THREE.Vector3(0.1, 0.5, 0.1), [shelf], [])).toBeNull();
    const narrow: Surface = { kind: 'table', cx: 0, cz: 0, yaw: 0, hw: 0.15, hd: 0.6, y: 0.7, clear: 1 };
    const s = findSpot(new THREE.Vector3(0.8, 0.1, 0.2), [narrow], [])!;
    expect(Math.abs(Math.sin(s.yaw))).toBeCloseTo(1);
  });
});

describe('comfort + window', () => {
  it('0% comfort is calm, 100% keeps the chaos', () => {
    const calm = comfortTuning(0);
    const wild = comfortTuning(1);
    expect(calm.restitution).toBeLessThan(wild.restitution);
    expect(calm.angDamping).toBeGreaterThan(wild.angDamping);
    expect(calm.avatarMass).toBeLessThan(wild.avatarMass);
    expect(calm.throwBoost).toBeLessThan(wild.throwBoost);
    expect(wild).toEqual({ restitution: 1, angDamping: 0, linDamping: 0, avatarMass: 1, throwBoost: 1 });
  });

  it('only a fast hit on the glass breaks the window', () => {
    const at = { x: ROOM.x1 - 0.1, y: WINDOW.y, z: WINDOW.z };
    expect(hitsGlass(at, { x: BREAK_SPEED + 1, y: 0, z: 0 })).toBe(true);
    expect(hitsGlass(at, { x: 1, y: 0, z: 0 })).toBe(false);
    expect(hitsGlass(at, { x: -(BREAK_SPEED + 1), y: 0, z: 0 })).toBe(false); // moving away
    expect(hitsGlass({ ...at, z: WINDOW.z + 2 }, { x: 8, y: 0, z: 0 })).toBe(false); // hits the wall
    expect(hitsGlass({ ...at, x: 0 }, { x: 8, y: 0, z: 0 })).toBe(false); // too far
  });
});

describe('achievements', () => {
  it('has ~20 unique achievements, some secret, a rare golden reward', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.filter((a) => a.secret).length).toBeGreaterThanOrEqual(5);
    const golden = ACHIEVEMENTS.filter((a) => a.reward.token === 'golden');
    expect(golden.length).toBeGreaterThanOrEqual(1);
    expect(golden.length).toBeLessThanOrEqual(3);
    for (const a of ACHIEVEMENTS) expect(a.reward.amount).toBeGreaterThan(0);
  });

  it('unlocks from world events once, pays the reward and persists', () => {
    const g = new Game(createInitialState(1, 0));
    const got: string[] = [];
    g.bus.on('achievement', (e) => got.push(e.id));
    g.bus.emit('world', { kind: 'windowBroken' });
    g.bus.emit('world', { kind: 'windowBroken' });
    expect(got).toEqual(['ball_in']);
    expect(g.state.tokens.golden).toBe(1);
    for (let i = 0; i < 10; i++) g.bus.emit('world', { kind: 'tidy', value: 3 });
    expect(g.state.achievements).toContain('clean_freak');
    g.bus.emit('world', { kind: 'tidy', value: 0 }); // nothing moved: doesn't count
    expect(g.state.counters['ach.tidy']).toBe(10);
    for (let i = 0; i < 10; i++) {
      g.state.time += 0.3;
      g.bus.emit('world', { kind: 'lightSwitch' });
    }
    expect(g.state.achievements).toEqual(expect.arrayContaining(['lights_out', 'disco']));
    g.bus.emit('world', { kind: 'placed', object: 'bed', value: 1.2 });
    expect(g.state.achievements).toContain('interior_designer');
    const back = deserialize(serialize(g.state));
    expect(back.achievements).toEqual(g.state.achievements);
  });

  it('state-based ones unlock on tick', () => {
    const g = new Game(createInitialState(1, 0));
    g.setFlag('booted');
    g.addCash(num(2_000_000));
    g.tick(1.1);
    expect(g.state.achievements).toEqual(expect.arrayContaining(['hello_world', 'millionaire']));
  });

  it('the Window Guy is only for sale while the window is broken', () => {
    const g = new Game(createInitialState(1, 0));
    g.addCash(num(10_000));
    expect(g.canBuyItem('window_guy')).toBe(false);
    g.setFlag('window:broken');
    expect(g.canBuyItem('window_guy')).toBe(true);
  });
});

describe('save v3 -> v4', () => {
  it('drops old bedroom poses (room changed), keeps garage ones, adds achievements', () => {
    const v3 = {
      ...createInitialState(1, 0),
      cash: '10',
      lifetimeCash: '10',
      floorCash: '0',
      version: 3,
      layout: {
        desk: { p: [0, 0, -2.08], q: [0, 0, 0, 1] },
        'used_monitor#0': { p: [0.45, 0.8, -2.05], q: [0, 0, 0, 1], hp: [0.45, 0.8, -2.05], hq: [0, 0, 0, 1] },
        'g_workbench#0': { p: [5, 0, 6], q: [0, 0, 0, 1] },
      },
    } as Record<string, unknown>;
    delete v3.achievements;
    const s = deserialize(JSON.stringify(v3));
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(4);
    expect(Object.keys(s.layout)).toEqual(['g_workbench#0']);
    expect(s.achievements).toEqual([]);
  });
});
