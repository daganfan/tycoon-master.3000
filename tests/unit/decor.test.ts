import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ALL_ITEMS, ITEMS, itemById } from '@/content/items';
import { DECOR, DECOR_CATEGORIES, DECOR_ITEMS, DECOR_PREFIX, dailyDeal, maxDecorVibe } from '@/content/decor';
import { COSMETICS } from '@/content/cosmetics';
import { DECOR_RECIPES } from '@/world/decor/recipes';
import { GEAR_RECIPES } from '@/world/decor/gear';
import { buildModel, recipeFor } from '@/world/decor/factory';
import { createProp, isKnownProp } from '@/world/props';
import { initRapier, Physics } from '@/world/physics';
import { FURNITURE_HOME, ROOM, WALL_SHELVES } from '@/world/room';
import { DESK } from '@/world/furniture';
import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { num } from '@/core/num';
import { buyDecor, dealPrice } from '@/os/apps/junkmart';

const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe('Junk Mart content', () => {
  it('has ~80 decor items with unique ids across all items', () => {
    expect(DECOR.length).toBeGreaterThanOrEqual(75);
    expect(unique(ALL_ITEMS.map((i) => i.id))).toBe(true);
    expect(unique(DECOR.map((d) => d.id))).toBe(true);
  });

  it('every decor item is sane', () => {
    const cats = new Set(DECOR_CATEGORIES.map((c) => c.id));
    for (const d of DECOR) {
      expect(d.price, d.id).toBeGreaterThanOrEqual(5);
      expect(d.vibe, d.id).toBeGreaterThanOrEqual(0.1);
      expect(d.vibe, d.id).toBeLessThanOrEqual(3);
      expect(d.max, d.id).toBeGreaterThanOrEqual(1);
      expect(cats.has(d.cat), d.id).toBe(true);
      expect(d.desc.length, d.id).toBeGreaterThan(5);
    }
    expect(Math.max(...DECOR.map((d) => d.price))).toBeGreaterThanOrEqual(1_000_000);
    for (const c of DECOR_CATEGORIES) expect(DECOR.filter((d) => d.cat === c.id).length, c.id).toBeGreaterThanOrEqual(8);
  });

  it('keeps the total decor vibe budget in check', () => {
    expect(maxDecorVibe()).toBeLessThanOrEqual(30);
    expect(maxDecorVibe() - DECOR.filter((d) => d.cat === 'luxury').reduce((a, d) => a + d.vibe * d.max, 0)).toBeLessThanOrEqual(17);
  });

  it('about a quarter or more of the decor has a fun behaviour', () => {
    const withFx = DECOR.filter((d) => {
      const { fx } = buildModel(DECOR_RECIPES[d.id]!);
      return (fx?.length ?? 0) > 0 || !!DECOR_RECIPES[d.id]!.light;
    });
    expect(withFx.length / DECOR.length).toBeGreaterThanOrEqual(0.25);
  });

  it('decor items resolve through itemById and are not in eBuy', () => {
    for (const it of DECOR_ITEMS) {
      expect(itemById(it.id)).toBe(it);
      expect(it.prop?.startsWith(DECOR_PREFIX)).toBe(true);
    }
    expect(ITEMS.some((i) => i.prop?.startsWith(DECOR_PREFIX))).toBe(false);
  });

  it('daily deal is deterministic per day', () => {
    const t = Date.UTC(2026, 0, 5, 3);
    expect(dailyDeal(t)).toEqual(dailyDeal(t + 3600_000));
    const ids = new Set(Array.from({ length: 14 }, (_, i) => dailyDeal(t + i * 86_400_000).id));
    expect(ids.size).toBeGreaterThan(5);
  });

  it('daily deal buys at 20% off via the regular buy flow', () => {
    const now = Date.UTC(2026, 3, 1);
    const deal = DECOR.find((d) => d.id === dailyDeal(now).id)!;
    const g = new Game(createInitialState(1, 0));
    g.state.cash = num(deal.price * 0.8 + 1);
    expect(dealPrice(g, deal, now).toNumber()).toBeLessThan(deal.price);
    expect(buyDecor(g, deal, now)).toBe(true);
    expect(g.state.items[`jm_${deal.id}`]).toBe(1);
    expect(g.state.cash.toNumber()).toBeGreaterThanOrEqual(0);
    expect(g.stat('vibe')).toBeCloseTo(deal.vibe);
  });
});

describe('recipes and props', () => {
  it('every decor id has a recipe that builds a sensible model', () => {
    for (const d of DECOR) {
      const r = DECOR_RECIPES[d.id];
      expect(r, d.id).toBeDefined();
      const { group, box } = buildModel(r!);
      let meshes = 0;
      group.traverse((o) => ((o as THREE.Mesh).isMesh ? meshes++ : 0));
      expect(meshes, d.id).toBeGreaterThan(0);
      const s = box.getSize(new THREE.Vector3());
      expect(Math.max(s.x, s.y, s.z), d.id).toBeLessThan(1.8);
      expect(Math.max(s.x, s.y, s.z), d.id).toBeGreaterThan(0.03);
      expect(box.min.y, d.id).toBeGreaterThan(-0.06);
    }
    expect(Object.keys(DECOR_RECIPES).sort()).toEqual(DECOR.map((d) => d.id).sort());
  });

  it('every item prop resolves in createProp', () => {
    for (const it of ALL_ITEMS) if (it.prop) expect(isKnownProp(it.prop), it.prop).toBe(true);
    for (const k of Object.keys(GEAR_RECIPES)) expect(ITEMS.some((i) => i.prop === k), k).toBe(true);
  });

  it('cosmetics: ids unique, positive costs, new themes', () => {
    expect(unique(COSMETICS.map((c) => c.id))).toBe(true);
    expect(COSMETICS.length).toBeGreaterThanOrEqual(33);
    for (const c of COSMETICS) for (const v of Object.values(c.cost)) expect(v).toBeGreaterThan(0);
    expect(COSMETICS.some((c) => c.rarity === 'glitched')).toBe(true);
  });
});

/** Physics-only stand-in for the bedroom: floor, walls, ceiling, a wall shelf and the 2 m desk with risers. */
export function standInRoom(phys: Physics): void {
  const { x0, x1, z0, z1, hx, hz, cx, cz, h } = ROOM;
  phys.staticBox({ x: hx + 1, y: 0.1, z: hz + 1 }, { x: cx, y: -0.1, z: cz });
  phys.staticBox({ x: hx, y: h, z: 0.1 }, { x: cx, y: h / 2, z: z0 - 0.1 });
  phys.staticBox({ x: hx, y: h, z: 0.1 }, { x: cx, y: h / 2, z: z1 + 0.1 });
  phys.staticBox({ x: 0.1, y: h, z: hz }, { x: x0 - 0.1, y: h / 2, z: cz });
  phys.staticBox({ x: 0.1, y: h, z: hz }, { x: x1 + 0.1, y: h / 2, z: cz });
  phys.staticBox({ x: hx, y: 0.1, z: hz }, { x: cx, y: h + 0.1, z: cz });
  for (const s of WALL_SHELVES) phys.staticBox({ x: s.w / 2, y: 0.015, z: s.d / 2 }, { x: s.x, y: s.y, z: s.z }, 0.9, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw));
  const d = FURNITURE_HOME.desk;
  const desk = phys.createBody({ pos: { x: d.x, y: 0, z: d.z }, fixed: true });
  phys.addCollider(desk, phys.R.ColliderDesc.cuboid(DESK.w / 2, 0.0225, DESK.d / 2).setTranslation(0, DESK.top, 0), {});
  for (const sx of [-1, 1])
    phys.addCollider(desk, phys.R.ColliderDesc.cuboid(DESK.riserW / 2, DESK.riserH / 2, DESK.riserD / 2).setTranslation(sx * DESK.riserX, DESK.top + 0.0225 + DESK.riserH / 2, -DESK.d / 2 + DESK.riserD / 2 + 0.02), {});
  const o = phys.track(new THREE.Group(), desk, 'desk', 'desk', { restitution: 0, friction: 0.9, density: 200 });
  o.tops = [
    { kind: 'desk', x: 0, y: DESK.top + 0.0225, z: 0, hw: DESK.w / 2 - 0.02, hd: DESK.d / 2 - 0.02, clear: 0.9 },
    ...[-1, 1].map((sx) => ({ kind: 'riser' as const, x: sx * DESK.riserX, y: DESK.top + 0.0225 + DESK.riserH, z: -DESK.d / 2 + DESK.riserD / 2 + 0.02, hw: DESK.riserW / 2 - 0.01, hd: DESK.riserD / 2 - 0.01, clear: 1 })),
  ];
}

describe('recipe props in physics', () => {
  let phys: Physics;
  beforeAll(async () => {
    const R = await initRapier();
    phys = new Physics(R);
    standInRoom(phys);
  });

  it('spawns every decor + gear item on a free spot without exploding or falling', () => {
    const scene = new THREE.Scene();
    const props = [...DECOR_ITEMS.map((i) => i.prop!), ...Object.keys(GEAR_RECIPES)];
    const objs = props.map((p) => {
      expect(recipeFor(p), p).toBeDefined();
      const r = createProp(p, 0, scene, phys, DESK.top);
      expect(r.obj, p).toBeDefined();
      return { p, o: r.obj! };
    });
    // Nothing spawns inside anything else: let it settle a moment, then nothing should keep moving.
    for (let i = 0; i < 30; i++) phys.world.step();
    const settled = objs.map(({ o }) => ({ ...o.body.translation() }));
    for (let i = 0; i < 240; i++) phys.world.step();
    const { x0, x1, z0, z1, h } = ROOM;
    const floaty = new Set(['decor:heart_balloon', 'decor:pool_flamingo']);
    let drifted = 0;
    objs.forEach(({ p, o }, i) => {
      const t = o.body.translation();
      const v = o.body.linvel();
      expect(Number.isFinite(t.x + t.y + t.z), p).toBe(true);
      expect(t.x, p).toBeGreaterThan(x0 - 0.05);
      expect(t.x, p).toBeLessThan(x1 + 0.05);
      expect(t.z, p).toBeGreaterThan(z0 - 0.05);
      expect(t.z, p).toBeLessThan(z1 + 0.05);
      expect(t.y, p).toBeGreaterThan(-0.1);
      expect(t.y, p).toBeLessThan(h + 0.05);
      if (floaty.has(p)) return;
      expect(Math.hypot(v.x, v.y, v.z), p).toBeLessThan(0.5);
      const s = settled[i]!;
      if (Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z) > 0.1) drifted++;
    });
    expect(drifted).toBeLessThanOrEqual(2);
  });
});
