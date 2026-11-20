import { expect, test } from '@playwright/test';

type TM = {
  game: {
    action(id: string, a: string): boolean;
    cashOut(id: string): { toString(): string };
    state: { cash: { toNumber(): number }; floorCash: { toNumber(): number }; tycoons: Record<string, { money: number }>; flags: string[] };
  };
  world: { focusMain(): void; setFocus(s: null): void; screens: { os: { screen: string; width: number; click(x: number, y: number): void } }[]; cash: { bits: unknown[] } };
};

test('boots, plays Lemon Mogul, cashes out and collects coins', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh');
  await page.waitForFunction(() => !!(window as unknown as { __tm?: TM }).__tm, null, { timeout: 60_000 });
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await expect(page.getByTestId('quest')).toContainText('Rent due');

  await page.evaluate(() => (window as unknown as { __tm: TM }).__tm.world.focusMain());
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.world.screens[0]!.os.screen === 'lock', null, { timeout: 30_000 });
  await page.evaluate(() => {
    const os = (window as unknown as { __tm: TM }).__tm.world.screens[0]!.os;
    os.click(os.width / 2, 510);
  });
  await page.waitForFunction(() => (window as unknown as { __tm: TM }).__tm.world.screens[0]!.os.screen === 'desktop');

  const earned = await page.evaluate(async () => {
    const { game } = (window as unknown as { __tm: TM }).__tm;
    for (let i = 0; i < 30; i++) game.action('lemon_mogul', 'squeeze');
    await new Promise((r) => setTimeout(r, 3000));
    return game.state.tycoons.lemon_mogul!.money;
  });
  expect(earned).toBeGreaterThan(0);

  await page.evaluate(() => {
    const { game, world } = (window as unknown as { __tm: TM }).__tm;
    game.state.tycoons.lemon_mogul!.money += 200;
    game.cashOut('lemon_mogul');
    world.setFocus(null);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __tm: TM }).__tm.world.cash.bits.length)).toBeGreaterThan(0);
  // Coins land near the avatar and get collected (or stay on the floor); the total must be conserved.
  await page.waitForTimeout(3000);
  const total = await page.evaluate(() => {
    const s = (window as unknown as { __tm: TM }).__tm.game.state;
    return s.cash.toNumber() + s.floorCash.toNumber();
  });
  expect(total).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});
