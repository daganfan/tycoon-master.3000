import { expect, test } from '@playwright/test';

// Simulates older Safari / Firefox and broken graphics setups.

test('boots without native CanvasRenderingContext2D.roundRect (polyfilled)', async ({ page }) => {
  await page.addInitScript(() => {
    delete (CanvasRenderingContext2D.prototype as unknown as { roundRect?: unknown }).roundRect;
    delete (Path2D.prototype as unknown as { roundRect?: unknown }).roundRect;
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh');
  await page.waitForFunction(() => !!(window as unknown as { __tm?: unknown }).__tm, null, { timeout: 60_000 });
  expect(await page.evaluate(() => typeof document.createElement('canvas').getContext('2d')!.roundRect)).toBe('function');
  await page.evaluate(() => (window as unknown as { __tm: { world: { focusMain(): void } } }).__tm.world.focusMain());
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('shows a friendly screen when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto('/?fresh');
  await expect(page.locator('#tm-fatal')).toBeVisible();
  await expect(page.locator('#tm-fatal')).toContainText('3D graphics');
});
