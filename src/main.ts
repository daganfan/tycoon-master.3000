import './polyfills';
import { mount } from 'svelte';
import { FixedLoop } from '@/core/loop';
import { formatCash } from '@/core/num';
import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { IdbStore, MemoryStore, deserialize, exportSave, importSave, readSave, writeSave, type SaveStore } from '@/sim/save';
import type { OsHost } from '@/os/os';
import App from '@/ui/App.svelte';
import { ui } from '@/ui/store.svelte';
import { hasWebGL2, showFatal } from './bootGuard';
import { registerPwa } from './pwa';
// Multiplayer: `?join=CODE` visits a friend's room instead of loading your own save.
import { joinCodeFrom } from '@/net/protocol';
import type { GuestLink } from '@/net/session';

const AUTOSAVE_SECONDS = 30;

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

async function boot(): Promise<void> {
  // Visiting someone: connect first; their room snapshot replaces our save (which stays untouched).
  const joinCode = joinCodeFrom(location.search);
  let guest: GuestLink | null = null;
  if (joinCode) {
    const { joinWithOverlay } = await import('@/net/joinScreen');
    try {
      guest = await joinWithOverlay(joinCode);
    } catch {
      return; // the overlay explains what went wrong
    }
  }
  let store: SaveStore;
  try {
    if (guest) throw new Error('visitor: never touch the real save');
    store = new IdbStore();
    await store.get('main');
  } catch {
    store = new MemoryStore();
  }
  const fresh = new URLSearchParams(location.search).has('fresh');
  const saved = fresh || guest ? undefined : await readSave(store);
  const game = new Game(guest ? deserialize(guest.welcome.state) : (saved ?? createInitialState()));

  let saving = false;
  const save = async () => {
    if (saving || guest) return;
    saving = true;
    try {
      await writeSave(store, game.state);
    } finally {
      saving = false;
    }
  };

  const reset = async () => {
    await store.set('main', '');
    await store.set('backup', '');
    location.reload();
  };

  const host: OsHost = {
    openSkillTree: () => (ui.tree = true),
    exportSave: () => (ui.modal = { kind: 'export', code: exportSave(game.state) }),
    importSave: () =>
      (ui.modal = {
        kind: 'import',
        onImport: async (code) => {
          try {
            const s = importSave(code);
            await writeSave(store, s);
            location.reload();
          } catch (e) {
            ui.modal = { kind: 'import', error: `That code didn't work: ${(e as Error).message}`, onImport: ui.modal?.kind === 'import' ? ui.modal.onImport : () => {} };
          }
        },
      }),
    resetSave: () => (ui.modal = { kind: 'reset' }),
  };

  mount(App, { target: document.getElementById('app')!, props: { game, onReset: reset } });

  if (saved) {
    const away = (Date.now() - saved.lastSaved) / 1000;
    if (away > 60) {
      const r = game.applyOffline(away);
      if (r.seconds > 0) ui.modal = { kind: 'offline', time: formatDuration(r.seconds), cash: r.cash.gt(0) ? formatCash(r.cash) : '' };
    }
  }

  ui.loading = 'Loading physics…';
  const { World } = await import('@/world/world');
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const world = await World.create(canvas, game, host);
  world.onFocusChange = (f) => (ui.focused = f);
  ui.focusMain = () => world.focusMain();
  ui.unfocus = () => world.setFocus(null);
  ui.tidy = () => world.tidyAll();
  ui.loading = '';
  const net = await import('@/net/session');
  if (guest) net.attachGuest(guest, game, world);
  else net.registerHome(game, world);

  const loop = new FixedLoop(
    0.1,
    // A visitor's copy of the host's game never ticks: the host simulates, we mirror.
    (dt) => !guest && game.tick(dt),
    (_a, frameDt) => {
      world.update(frameDt);
      ui.hint = world.hint;
    },
  );
  loop.start();

  setInterval(save, AUTOSAVE_SECONDS * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void save());
  window.addEventListener('beforeunload', () => void save());

  // Debug / test handle
  (window as unknown as { __tm: unknown }).__tm = { game, world, save, net };
}

void registerPwa(async () => (window as unknown as { __tm?: { save(): Promise<void> } }).__tm?.save());

if (!hasWebGL2()) {
  showFatal("Your browser can't show the game's 3D graphics", 'WebGL 2 is not available.');
} else {
  boot().catch((e) => {
    console.error(e);
    ui.loading = `Something broke: ${(e as Error).message}`;
    showFatal('Tycoon Master 3000 failed to start', (e as Error).message);
  });
}
