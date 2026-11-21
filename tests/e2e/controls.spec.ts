import { expect, test, type Page } from '@playwright/test';

type V3 = { x: number; y: number; z: number };
type TM = {
  game: { state: { settings: { camMode: string } } };
  world: {
    camMode: string;
    aimHint: string;
    focus: unknown;
    rig: { look: { yaw: number; pitch: number } };
    avatar: { body: { setTranslation(p: V3, w: boolean): void }; position: V3 };
    camera: { position: V3 & { clone(): V3 } };
    screens: { mesh: { getWorldPosition(v: V3): V3 } }[];
    focusMain(): void;
    setFocus(s: null): void;
  };
};

const tm = <T>(page: Page, fn: (t: TM) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__tm)`) as Promise<T>;

test('camera: V toggles first/third person, pointer-lock overlay, crosshair targets the PC', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh&gfx=low');
  await page.waitForFunction(() => !!(window as unknown as { __tm?: TM }).__tm, null, { timeout: 60_000 });

  // Mouse not captured yet: the "Click to play" overlay and the crosshair show.
  await expect(page.getByTestId('click-to-play')).toBeVisible();
  await expect(page.getByTestId('crosshair')).toBeVisible();

  expect(await tm(page, (t) => t.world.camMode)).toBe('third');
  await page.keyboard.press('KeyV');
  await expect.poll(() => tm(page, (t) => t.world.camMode)).toBe('first');
  expect(await tm(page, (t) => t.game.state.settings.camMode)).toBe('first');

  // Stand in front of the desk and look at the monitor: the crosshair offers to use it.
  await tm(page, (t) => t.world.avatar.body.setTranslation({ x: -0.1, y: 0.7, z: -0.9 }, true));
  await page.waitForTimeout(400);
  await tm(page, (t) => {
    const w = t.world;
    const m = w.screens[0]!.mesh.getWorldPosition(w.camera.position.clone());
    const a = w.avatar.position;
    w.rig.look.yaw = Math.atan2(-(m.x - a.x), -(m.z - a.z));
    w.rig.look.pitch = 0.15;
  });
  await expect.poll(() => tm(page, (t) => t.world.aimHint), { timeout: 10_000 }).toMatch(/^E — /);
  await expect(page.getByTestId('aim-hint')).toBeVisible();

  // E uses the screen under the crosshair; the overlay and crosshair go away in focus mode.
  await page.keyboard.press('KeyE');
  await expect.poll(() => tm(page, (t) => !!t.world.focus)).toBe(true);
  await expect(page.getByTestId('click-to-play')).toBeHidden();
  await expect(page.getByTestId('crosshair')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect.poll(() => tm(page, (t) => !!t.world.focus)).toBe(false);
  await expect(page.getByTestId('click-to-play')).toBeVisible();

  // Back to third person.
  await page.keyboard.press('KeyV');
  await expect.poll(() => tm(page, (t) => t.world.camMode)).toBe('third');
  expect(errors).toEqual([]);
});
