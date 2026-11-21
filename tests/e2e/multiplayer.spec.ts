import { expect, test, type Page } from '@playwright/test';

/**
 * Two tabs in one browser talk over BroadcastChannel (`?net=local`), which runs
 * the exact same session code as real WebRTC play, minus the signaling servers.
 */

type TM = {
  game: {
    state: { items: Record<string, number>; cash: unknown };
    itemCost(id: string): unknown;
    addCash(n: unknown): void;
    buyItem(id: string): boolean;
  };
  world: {
    phys: { objs: { id?: string }[] };
    avatar: { body: { setTranslation(p: object, w: boolean): void } };
  };
  net: { netDebug(): { mode: string; avatars: string[]; guests: number } };
};

const tm = (page: Page) =>
  page.waitForFunction(() => !!(window as unknown as { __tm?: TM }).__tm, null, { timeout: 60_000 });
const debug = (page: Page) => page.evaluate(() => (window as unknown as { __tm: TM }).__tm.net.netDebug());
const layoutIds = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __tm: TM }).__tm.world.phys.objs
      .filter((o) => !!o.id)
      .map((o) => o.id!)
      .sort(),
  );

test('host a room, a friend joins by code, sees the room, items and chat sync', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const errors: string[] = [];
  const a = await ctx.newPage();
  a.on('pageerror', (e) => errors.push(`A: ${e.message}`));
  await a.addInitScript(() =>
    localStorage.setItem('tm3000.profile', JSON.stringify({ name: 'Alice', color: '#e94b4b' })),
  );
  await a.goto('/?fresh&net=local');
  await tm(a);

  // A buys a box first, so the snapshot has something beyond the starter room.
  await a.evaluate(() => {
    const { game } = (window as unknown as { __tm: TM }).__tm;
    game.addCash(game.itemCost('cardboard_boxes'));
    game.buyItem('cardboard_boxes');
  });

  await a.getByTestId('mp-button').click();
  await a.getByTestId('mp-host').click();
  const code = (await a.getByTestId('mp-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await expect(a.getByTestId('mp-link')).toHaveValue(new RegExp(`join=${code}`));

  const b = await ctx.newPage();
  b.on('pageerror', (e) => errors.push(`B: ${e.message}`));
  await b.addInitScript(() =>
    localStorage.setItem('tm3000.profile', JSON.stringify({ name: 'Bob', color: '#3498db' })),
  );
  await b.goto(`/?join=${code}&net=local`);
  await tm(b);
  await expect(b.getByTestId('visit-banner')).toContainText('Alice');
  expect((await debug(b)).mode).toBe('guest');

  // B sees A's room: same items and the same set of physical props.
  const itemsA = await a.evaluate(() => (window as unknown as { __tm: TM }).__tm.game.state.items);
  const itemsB = await b.evaluate(() => (window as unknown as { __tm: TM }).__tm.game.state.items);
  expect(itemsB).toEqual(itemsA);
  expect(await layoutIds(b)).toEqual(await layoutIds(a));

  // B's avatar shows up at A's place (and A's at B's).
  await expect.poll(async () => (await debug(a)).avatars, { timeout: 15_000 }).toContain('Bob');
  await expect.poll(async () => (await debug(b)).avatars, { timeout: 15_000 }).toContain('Alice');
  await expect(a.getByTestId('mp-players')).toContainText('Bob');

  // A buys an item: it appears in B's copy of the room.
  await a.evaluate(() => {
    const { game } = (window as unknown as { __tm: TM }).__tm;
    game.addCash(game.itemCost('lava_lamp'));
    game.buyItem('lava_lamp');
  });
  await expect.poll(async () => (await layoutIds(b)).includes('lava_lamp#0'), { timeout: 15_000 }).toBe(true);
  expect(await b.evaluate(() => (window as unknown as { __tm: TM }).__tm.game.state.items.lava_lamp)).toBe(1);

  // Chat both ways.
  await b.keyboard.press('Enter');
  await b.getByTestId('chat-input').fill('hi from bob');
  await b.keyboard.press('Enter');
  await expect(a.getByTestId('chat')).toContainText('hi from bob', { timeout: 10_000 });
  await a.keyboard.press('Enter');
  await a.getByTestId('chat-input').fill('welcome bob');
  await a.keyboard.press('Enter');
  await expect(b.getByTestId('chat')).toContainText('welcome bob', { timeout: 10_000 });

  expect(errors).toEqual([]);
  await ctx.close();
});
