import { appendFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Game } from '@/sim/game';
import { createInitialState } from '@/sim/state';
import { num } from '@/core/num';
import { TYCOONS } from '@/sim/tycoons';
import type { OsHost, TycoonOS as TycoonOSType } from '@/os/os';
import type { Rect, UiRecord } from '@/os/ui';

/**
 * Renders every TycoonOS app and every mini-game view on the smallest screen
 * (1024×576 logical) and in 2-window XP layouts, with a fake 2D canvas that
 * records where buttons and text go. Buttons must stay inside their window,
 * must not overlap each other, and text must not spill out of its window or
 * run over buttons/other text.
 */

/** Minimal CanvasRenderingContext2D stand-in: every call is a no-op; text is measured at ~0.55em per char. */
function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { font: '16px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1 };
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {
    measureText(s: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 16);
      const bold = String(state.font).startsWith('bold');
      let w = 0;
      for (const ch of s) w += (ch.codePointAt(0)! > 0x2000 ? 1.0 : bold ? 0.58 : 0.54) * size;
      return { width: w };
    },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k in state) return state[k];
      return () => {};
    },
    set(_t, k: string, v) {
      state[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let TycoonOS: typeof TycoonOSType;

beforeAll(async () => {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext() }),
  };
  TycoonOS = (await import('@/os/os')).TycoonOS;
});

const HOST: OsHost = { openSkillTree() {}, exportSave() {}, importSave() {}, resetSave() {} };

function richGame(tier: number): Game {
  const g = new Game(createInitialState(9, 0));
  g.setFlag('booted');
  g.state.cash = num(1e15);
  g.buyItem('garage_key');
  for (const t of TYCOONS) if (!g.state.tycoons[t.id]) g.unlockTycoon(t.id);
  for (const rt of Object.values(g.state.tycoons)) {
    rt.money = 123456789;
    rt.lifetime = 5e7;
  }
  if (tier > 0) g.buyItem('os_xp');
  g.state.tokens = { grind: 12, mogul: 34, chaos: 5, pixel: 0, golden: 0 };
  g.setFlag('phase:garage');
  for (let i = 0; i < 50; i++) g.tick(0.1);
  return g;
}

type Problem = string;

function overlap(a: Rect, b: Rect, pad = 0.5): boolean {
  return a.x + pad < b.x + b.w && b.x + pad < a.x + a.w && a.y + pad < b.y + b.h && b.y + pad < a.y + a.h;
}

function within(a: Rect, b: Rect, tol = 1): boolean {
  return a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
}

function check(all: UiRecord, where: string, only?: 'dialog' | 'menu'): Problem[] {
  const out: Problem[] = [];
  // A modal draws over everything: only what is inside it has to be tidy.
  const rec = only ? { buttons: all.buttons.filter((b) => b.kind === only), texts: all.texts.filter((t) => t.kind === only) } : all;
  const btns = rec.buttons.filter((b) => b.kind !== 'screen');
  for (const b of btns) {
    if (b.r.w < 24 || b.r.h < 20) out.push(`${where}: button "${b.label}" too small (${b.r.w.toFixed(0)}×${b.r.h.toFixed(0)})`);
    if (b.kind === 'scroll') {
      // Rows scroll vertically; they must still fit horizontally.
      if (b.r.x < b.bounds.x - 1 || b.r.x + b.r.w > b.bounds.x + b.bounds.w + 1) out.push(`${where}: button "${b.label}" sticks out of its list`);
    } else if (!within(b.r, b.bounds)) out.push(`${where}: button "${b.label}" outside its ${b.kind} (${fmt(b.r)} vs ${fmt(b.bounds)})`);
  }
  for (let i = 0; i < btns.length; i++)
    for (let j = i + 1; j < btns.length; j++)
      if (overlap(btns[i]!.r, btns[j]!.r)) out.push(`${where}: buttons "${btns[i]!.label}" and "${btns[j]!.label}" overlap`);
  const texts = rec.texts.filter((t) => t.kind !== 'screen' && t.text.trim());
  for (const t of texts) {
    if (t.kind === 'scroll') {
      if (t.r.x < t.bounds.x - 2 || t.r.x + t.r.w > t.bounds.x + t.bounds.w + 2) out.push(`${where}: text "${t.text}" sticks out of its list`);
    } else if (!within(t.r, t.bounds, 2)) out.push(`${where}: text "${t.text}" outside its ${t.kind} (${fmt(t.r)} vs ${fmt(t.bounds)})`);
    for (const b of btns) if (overlap(t.r, b.r, 2)) out.push(`${where}: text "${t.text}" runs under button "${b.label}"`);
  }
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++)
      if (overlap(texts[i]!.r, texts[j]!.r, 2)) out.push(`${where}: texts "${texts[i]!.text}" and "${texts[j]!.text}" overlap`);
  return out;
}

const fmt = (r: Rect) => `${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}×${r.h.toFixed(0)}`;

/** Physical canvas sizes: the smallest monitor (renders at 1024×576 logical) and the main PC. */
const SIZES = [
  { name: 'small', w: 960, h: 540, label: 'aux' },
  { name: 'main', w: 1280, h: 886, label: 'main' },
];

function render(os: TycoonOSType): UiRecord {
  const rec: UiRecord = { buttons: [], texts: [] };
  os.ui.rec = rec;
  os.update(0.05);
  os.ui.rec = null;
  return rec;
}

/** Game states worth checking per view (jams, rebels, forecasts, …). */
function variants(g: Game, id: string): (() => void)[] {
  const s = g.state.tycoons[id]!.state as Record<string, unknown>;
  const base = () => {};
  if (id === 'rubber_duck_works') return [base, () => (s.jammed = true)];
  if (id === 'lemon_mogul') return [base, () => g.stats.setSource('test', [], ['lemon.forecast']), () => Object.assign(s, { cups: 0, missed: 5, price: 9 })];
  if (id === 'robo_car_wash')
    return [base, () => ((s.bays as { rebel: number; demand: string }[]).forEach((b) => Object.assign(b, { rebel: 1, demand: 'More bubbles' })))];
  return [base];
}

describe('TycoonOS layout on small screens', () => {
  for (const size of SIZES) {
    for (const tier of [0, 1]) {
      it(`every app fits: ${size.name} screen, ${tier ? 'XP (2 windows)' : '95 (1 window)'}`, () => {
        const g = richGame(tier);
        const os = new TycoonOS(g, HOST, size.w, size.h, size.label, 'main');
        os.boot(true);
        const problems: Problem[] = [];
        const ids = os.apps().map((a) => a.id);
        for (const id of ids) {
          const partners = tier ? ['ebuy', 'lemon_mogul'] : [null];
          for (const partner of partners) {
            for (const v of g.isTycoon(id) ? variants(g, id) : [() => {}]) {
              g.state.desk.screens.main = partner && partner !== id ? [partner, id] : [id];
              g.syncDesk(false);
              v();
              for (const tab of g.isTycoon(id) ? ['play', 'up'] : ['-']) {
                render(os);
                if (tab === 'up') {
                  // Narrow tycoon windows have a Play / Upgrades tab row: click "Upgrades".
                  const rec = render(os);
                  const up = rec.buttons.find((b) => b.label.includes('Upgrades'));
                  if (!up) continue;
                  os.ui.pushClick(up.r.x + 4, up.r.y + 4);
                  render(os);
                }
                const frame = render(os);
                if (!frame.buttons.some((b) => b.label === '✕') || frame.texts.length < 2) problems.push(`${id}: window did not render`);
                problems.push(...check(frame, `${size.name}/${tier ? 'XP' : '95'}/${id}${partner ? `+${partner}` : ''}/${tab}`));
                const play = render(os).buttons.find((b) => b.label.includes('Play'));
                if (play) {
                  os.ui.pushClick(play.r.x + 4, play.r.y + 4);
                  render(os);
                }
              }
            }
          }
        }
        // Desktop with no windows, the Start menu, and the capacity dialog.
        g.state.desk.screens.main = [];
        problems.push(...check(render(os), `${size.name}/desktop`));
        const start = render(os).buttons.find((b) => b.label.includes('Start'))!;
        os.ui.pushClick(start.r.x + 5, start.r.y + 5);
        render(os);
        problems.push(...check(render(os), `${size.name}/start-menu`, 'menu'));
        os.ui.pushClick(2, 2);
        render(os);
        g.state.desk.screens.main = tier ? ['lemon_mogul', 'rubber_duck_works'] : ['lemon_mogul'];
        g.syncDesk(false);
        os.launch('sock_syndicate');
        problems.push(...check(render(os), `${size.name}/capacity-dialog`, 'dialog'));
        if (process.env.LAYOUT_DUMP) appendFileSync(process.env.LAYOUT_DUMP, [...new Set(problems)].join('\n') + '\n');
        expect([...new Set(problems)]).toEqual([]);
      });
    }
  }
});
