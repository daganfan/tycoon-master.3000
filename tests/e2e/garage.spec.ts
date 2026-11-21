import { expect, test, type Page } from '@playwright/test';

type V3 = { x: number; y: number; z: number };
type TM = {
  game: {
    state: { cash: { add(n: number): unknown; toNumber(): number }; floorCash: { toNumber(): number }; garage: { pads: string[]; tank: number; stars: number; collects: number }; flags: string[] };
    buyItem(id: string): boolean;
    setFlag(f: string): void;
    garage: { buyPad(id: string): boolean; has(id: string): boolean; live: boolean; rebirthReady(): boolean };
  };
  world: {
    avatar: { body: { setTranslation(p: V3, w: boolean): void; setLinvel(v: V3, w: boolean): void }; position: V3 };
    room: { door: { rotation: { y: number } } };
    phys: { update(dt: number, max?: number): number };
    cash: { bits: unknown[] };
    hint: string;
    garage: { factory: { items: unknown[] } };
  };
};

const tm = (page: Page) => page.evaluate.bind(page);

async function teleport(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(
    ([x, z]) => {
      const w = (window as unknown as { __tm: TM }).__tm.world;
      w.avatar.body.setTranslation({ x: x!, y: 0.75, z: z! }, true);
      w.avatar.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    },
    [x, z],
  );
}

/** Walk onto a pad: approach from the side, then stand on it. */
async function stepOn(page: Page, x: number, z: number): Promise<void> {
  await teleport(page, x, z - 1.3);
  await page.waitForTimeout(400);
  await teleport(page, x, z);
  await page.waitForTimeout(700);
}

test('garage: key opens the door, pads build the factory, scrap melts into the tank, collect and rebirth', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh');
  await page.waitForFunction(() => !!(window as unknown as { __tm?: TM }).__tm, null, { timeout: 60_000 });
  // Software rendering is slow in CI: let physics catch up with real time.
  await tm(page)(() => {
    const p = (window as unknown as { __tm: TM }).__tm.world.phys;
    const orig = p.update.bind(p);
    p.update = (dt: number) => orig(dt, 30);
  });

  // Locked door.
  await teleport(page, 1.6, 2.0);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.world.hint.includes('Locked'), null, { timeout: 15_000 });
  expect(await tm(page)(() => (window as unknown as { __tm: TM }).__tm.world.room.door.rotation.y)).toBeCloseTo(0, 1);

  // Buy the key: the door swings open.
  await tm(page)(() => {
    const g = (window as unknown as { __tm: TM }).__tm.game;
    g.setFlag('booted');
    g.state.cash = g.state.cash.add(2_000_000) as never;
    g.buyItem('garage_key');
  });
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.world.room.door.rotation.y < -1, null, { timeout: 20_000 });
  expect(await tm(page)(() => (window as unknown as { __tm: TM }).__tm.game.garage.live)).toBe(true);

  // Walk into the garage and step on the first pad (Scrap Furnace, $1,000).
  await tm(page)(() => {
    const g = (window as unknown as { __tm: TM }).__tm.game;
    g.state.cash = g.state.cash.add(50_000) as never;
  });
  await teleport(page, 1.6, 3.4);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.game.state.flags.includes('garage:entered'), null, { timeout: 15_000 });
  await stepOn(page, 3.4, 4.3);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.game.garage.has('furnace'), null, { timeout: 15_000 });
  await stepOn(page, 2.2, 4.3);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.game.garage.has('belt_a'), null, { timeout: 15_000 });
  await stepOn(page, -1.25, 5.05);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.game.garage.has('drop_a1'), null, { timeout: 15_000 });
  await teleport(page, 1.6, 3.4);

  // Physical scrap drops, rides the belt and melts in the furnace.
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.world.garage.factory.items.length > 0, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.game.state.garage.tank > 0, null, { timeout: 60_000 });

  // The COLLECT pad bursts the tank out as coins.
  await stepOn(page, 5.55, 4.55);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.game.state.garage.collects > 0, null, { timeout: 15_000 });
  expect(await tm(page)(() => (window as unknown as { __tm: TM }).__tm.world.cash.bits.length)).toBeGreaterThan(0);

  // Finish the factory and rebirth on the golden pad.
  await tm(page)(() => {
    const g = (window as unknown as { __tm: TM }).__tm.game;
    g.state.cash = g.state.cash.add(1e12) as never;
    const order = ['drop_a2', 'up_paint', 'drop_a3', 'deco_rails', 'up_gold', 'speed_1', 'robot', 'belt_b', 'drop_b1', 'drop_b2', 'up_wrap', 'deco_neon', 'up_hat', 'mega', 'speed_2'];
    for (const id of order) g.garage.buyPad(id);
  });
  expect(await tm(page)(() => (window as unknown as { __tm: TM }).__tm.game.garage.rebirthReady())).toBe(true);
  await page.waitForTimeout(1500);
  await stepOn(page, 0.3, 3.45);
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.game.state.garage.stars === 1, null, { timeout: 30_000 });
  expect(await tm(page)(() => (window as unknown as { __tm: TM }).__tm.game.state.garage.pads.length)).toBe(0);
  expect(errors).toEqual([]);
});
