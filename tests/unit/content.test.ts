import { describe, expect, it } from 'vitest';
import { SKILL_NODES } from '@/content/skilltree';
import { ITEMS } from '@/content/items';
import { COSMETICS } from '@/content/cosmetics';
import { QUESTS } from '@/content/quests';
import { TYCOONS } from '@/sim/tycoons';

const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe('content validation', () => {
  it('ids are unique', () => {
    expect(unique(SKILL_NODES.map((n) => n.id))).toBe(true);
    expect(unique(ITEMS.map((n) => n.id))).toBe(true);
    expect(unique(COSMETICS.map((n) => n.id))).toBe(true);
    expect(unique(QUESTS.map((n) => n.id))).toBe(true);
    expect(unique(TYCOONS.map((n) => n.id))).toBe(true);
  });

  it('every skill node is reachable from the root', () => {
    const ids = new Set(SKILL_NODES.map((n) => n.id));
    const reach = new Set(['root']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of SKILL_NODES) {
        for (const r of n.requires) expect(ids.has(r), `${n.id} requires unknown ${r}`).toBe(true);
        if (!reach.has(n.id) && n.requires.some((r) => reach.has(r))) {
          reach.add(n.id);
          grew = true;
        }
      }
    }
    expect(reach.size).toBe(SKILL_NODES.length);
  });

  it('costs are positive and nodes do not overlap', () => {
    for (const n of SKILL_NODES) for (const v of Object.values(n.cost)) expect(v).toBeGreaterThan(0);
    for (const i of ITEMS) expect(i.baseCost).toBeGreaterThan(0);
    for (const a of SKILL_NODES)
      for (const b of SKILL_NODES)
        if (a !== b) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y), `${a.id}/${b.id}`).toBeGreaterThan(40);
  });

  it('every tycoon has a primary action', () => {
    for (const t of TYCOONS) expect(t.actions.filter((a) => a.primary).length).toBe(1);
  });
});
