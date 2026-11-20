import { mount } from 'svelte';
import { FixedLoop } from '@/core/loop';
import { formatCash } from '@/core/num';
import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { IdbStore, MemoryStore, exportSave, importSave, readSave, writeSave, type SaveStore } from '@/sim/save';
import type { OsHost } from '@/os/os';
import App from '@/ui/App.svelte';
import { ui } from '@/ui/store.svelte';

const AUTOSAVE_SECONDS = 30;

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

async function boot(): Promise<void> {
  let store: SaveStore;
  try {
    store = new IdbStore();
    await store.get('main');
  } catch {
    store = new MemoryStore();
  }
  const fresh = new URLSearchParams(location.search).has('fresh');
  const saved = fresh ? undefined : await readSave(store);
  const game = new Game(saved ?? createInitialState());

  let saving = false;
  const save = async () => {
    if (saving) return;
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

  const loop = new FixedLoop(
    0.1,
    (dt) => game.tick(dt),
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
  (window as unknown as { __tm: unknown }).__tm = { game, world, save };
}

boot().catch((e) => {
  console.error(e);
  ui.loading = `Something broke: ${(e as Error).message}`;
});
