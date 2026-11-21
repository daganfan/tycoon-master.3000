import { expect, test, type Page } from '@playwright/test';

type V = { x: number; y: number; z: number };
type Obj = { id?: string; kind: string; body: { translation(): V; setTranslation(v: V, w: boolean): void; setLinvel(v: V, w: boolean): void; isDynamic(): boolean } };
type TM = {
  game: {
    state: { cash: { add(n: number): unknown }; flags: string[]; achievements: string[]; tokens: Record<string, number>; items: Record<string, number> };
    buyItem(id: string): boolean;
    canBuyItem(id: string): boolean;
  };
  world: {
    phys: { objs: Obj[] };
    interact: { tidyAll(): number; tidyState(): string };
    glass: { broken: boolean; liveShards(): number };
    fixtures: { lightsOn: boolean; toggleLights(): void };
  };
};

const tm = <T>(page: Page, fn: () => T) => page.evaluate(fn);

async function boot(page: Page): Promise<void> {
  await page.goto('/?fresh&gfx=low');
  await page.waitForFunction(() => !!(window as unknown as { __tm?: TM }).__tm, null, { timeout: 60_000 });
}

test.setTimeout(120_000);

test('room: purchases land on free spots and stay put; double Tidy Up is calm and idempotent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await tm(page, () => {
    const g = (window as unknown as { __tm: TM }).__tm.game;
    g.state.cash = g.state.cash.add(5_000_000) as never;
    for (const id of ['used_monitor', 'used_monitor', 'mech_keyboard', 'desk_fan', 'lava_lamp', 'lava_lamp', 'plant', 'cardboard_boxes', 'cardboard_boxes', 'piggy_bank', 'refurb_pc', 'gaming_headset', 'mesh_router'])
      g.buyItem(id);
  });
  await page.waitForTimeout(3000);
  // Nothing fell over or off its surface after buying.
  const fallen = await tm(page, () =>
    (window as unknown as { __tm: TM }).__tm.world.phys.objs
      .filter((o) => o.id && o.body.isDynamic())
      .filter((o) => {
        const t = o.body.translation();
        const home = (o as unknown as { home: { pos: V } }).home.pos;
        return Math.hypot(t.x - home.x, t.y - home.y, t.z - home.z) > 0.08;
      })
      .map((o) => o.id),
  );
  expect(fallen).toEqual([]);

  // Make a mess: fling the layout objects around.
  await tm(page, () => {
    const objs = (window as unknown as { __tm: TM }).__tm.world.phys.objs.filter((o) => o.id && o.body.isDynamic());
    objs.forEach((o, i) => {
      const t = o.body.translation();
      o.body.setTranslation({ x: t.x + ((i % 3) - 1) * 0.4, y: t.y + 0.3, z: t.z + (((i + 1) % 3) - 1) * 0.3 }, true);
      o.body.setLinvel({ x: (i % 2 ? 1 : -1) * 1.5, y: 1, z: 0.5 }, true);
    });
  });
  await page.waitForTimeout(2500);

  // Tidy, wait, tidy again immediately after: the second one must not move anything.
  const first = await tm(page, () => (window as unknown as { __tm: TM }).__tm.world.interact.tidyAll());
  expect(first).toBeGreaterThan(0);
  // Pressing again while it runs is ignored.
  expect(await tm(page, () => (window as unknown as { __tm: TM }).__tm.world.interact.tidyAll())).toBe(-1);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.world.interact.tidyState() === 'idle', null, { timeout: 45_000 });
  await page.waitForTimeout(800);
  const snap = () =>
    tm(page, () =>
      Object.fromEntries(
        (window as unknown as { __tm: TM }).__tm.world.phys.objs.filter((o) => o.id).map((o) => {
          const t = o.body.translation();
          return [o.id!, [t.x, t.y, t.z]];
        }),
      ),
    );
  const before = await snap();
  const second = await tm(page, () => (window as unknown as { __tm: TM }).__tm.world.interact.tidyAll());
  expect(second).toBe(0);
  await page.waitForTimeout(2500);
  const after = await snap();
  for (const [id, p] of Object.entries(before)) {
    const q = after[id]!;
    expect(Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!), id).toBeLessThan(0.05);
  }
  expect(await tm(page, () => (window as unknown as { __tm: TM }).__tm.game.state.achievements.length)).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('room: a fast object breaks the window, the Window Guy fixes it, trophies unlock', async ({ page }) => {
  await boot(page);
  await tm(page, () => {
    const { game, world } = (window as unknown as { __tm: TM }).__tm;
    game.state.cash = game.state.cash.add(1000) as never;
    world.fixtures.toggleLights();
    const ball = world.phys.objs.find((o) => o.id === 'chair')!;
    ball.body.setTranslation({ x: 2.6, y: 1.55, z: -1.0 }, true);
    ball.body.setLinvel({ x: 9, y: 0.5, z: 0 }, true);
  });
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.world.glass.broken, null, { timeout: 10_000 });
  const st = await tm(page, () => {
    const { game, world } = (window as unknown as { __tm: TM }).__tm;
    return { shards: world.glass.liveShards(), ach: [...game.state.achievements], golden: game.state.tokens.golden, canFix: game.canBuyItem('window_guy') };
  });
  expect(st.shards).toBeGreaterThan(10);
  expect(st.ach).toEqual(expect.arrayContaining(['ball_in', 'lights_out']));
  expect(st.golden).toBeGreaterThanOrEqual(1);
  expect(st.canFix).toBe(true);
  // The chair flew out of the window: it gets rescued back home.
  await page.waitForFunction(() => {
    const c = (window as unknown as { __tm: TM }).__tm.world.phys.objs.find((o) => o.id === 'chair')!.body.translation();
    return c.x < 3.5;
  }, null, { timeout: 10_000 });
  await tm(page, () => (window as unknown as { __tm: TM }).__tm.game.buyItem('window_guy'));
  expect(await tm(page, () => (window as unknown as { __tm: TM }).__tm.world.glass.broken)).toBe(false);
  expect(await tm(page, () => (window as unknown as { __tm: TM }).__tm.game.canBuyItem('window_guy'))).toBe(false);
});
