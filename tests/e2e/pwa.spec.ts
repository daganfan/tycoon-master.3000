import { expect, test } from '@playwright/test';

test('serves an installable manifest and icons', async ({ page, request }) => {
  await page.goto('/?fresh');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(href!.replace(/^\.\//, '/'));
  expect(res.ok()).toBe(true);
  const m = (await res.json()) as { name: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string; purpose?: string }[] };
  expect(m.name).toBe('Tycoon Master 3000');
  // Relative start_url/scope so it works under a GitHub Pages sub-path.
  expect(m.start_url).toBe('./');
  expect(m.scope).toBe('./');
  expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
  expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await request.get(`/${i.src}`)).ok()).toBe(true);
  expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true);
});

test('registers a service worker and boots offline on the second visit', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh');
  await page.waitForFunction(() => !!(window as unknown as { __tm?: unknown }).__tm, null, { timeout: 60_000 });
  // `ready` resolves once the worker is active, i.e. the precache has been filled.
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __tm?: unknown }).__tm, null, { timeout: 60_000 });
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
