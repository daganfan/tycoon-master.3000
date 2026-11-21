/**
 * The "desk": which apps are open in which window on which TycoonOS screen.
 *
 * A mini-tycoon earns ONLY while it is running, and it runs only while it is
 * open in a window on one of the screens in the room, or minimized into a free
 * background slot. Capacity comes from:
 *  - screens: the main PC + every Second-hand Monitor + every Refurbished PC,
 *  - windows per screen: TycoonOS 95 = 1, XP = 2, … (os.tier + 1),
 *  - background slots (`slots` stat): minimized games that keep running.
 *
 * This lives in the sim (not the OS) so tests, the balance bot and offline
 * earnings all see the same rules, and so the layout is saved with the game.
 */

/** Items whose props carry their own screen (each unit = one more screen). */
export const SCREEN_ITEMS = ['used_monitor', 'refurb_pc'] as const;

export interface DeskState {
  /** Open windows per screen id, oldest first (the last one is in front). */
  screens: Record<string, string[]>;
  /** Minimized games, oldest first. The first `slots` of them keep running. */
  min: string[];
}

export const createDesk = (): DeskState => ({ screens: { main: ['lemon_mogul'] }, min: [] });

/** Stable screen ids for a set of owned items: `main`, `used_monitor#0`, `refurb_pc#0`, … */
export function screenIdsFor(items: Record<string, number>): string[] {
  const out = ['main'];
  for (const id of SCREEN_ITEMS) for (let i = 0; i < (items[id] ?? 0); i++) out.push(`${id}#${i}`);
  return out;
}

/** Friendly name for a screen id. */
export function screenName(id: string): string {
  if (id === 'main') return 'Main PC';
  const [item, n] = id.split('#');
  const idx = Number(n ?? 0) + 1;
  return item === 'refurb_pc' ? `PC ${idx + 1}` : `Monitor ${idx + 1}`;
}

/**
 * Lay out games that were running in an old (pre-desk) save: one per window,
 * main screen first, the rest minimized.
 */
export function deskFromRunning(running: string[], items: Record<string, number>, perScreen: number): DeskState {
  const desk: DeskState = { screens: {}, min: [] };
  const ids = screenIdsFor(items);
  let i = 0;
  for (const sid of ids) {
    desk.screens[sid] = running.slice(i, i + perScreen);
    i += perScreen;
  }
  desk.min = running.slice(i);
  return desk;
}
