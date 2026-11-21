import { formatCash, formatNum } from '@/core/num';
import { ITEMS } from '@/content/items';
import { COSMETICS } from '@/content/cosmetics';
import { QUESTS } from '@/content/quests';
import { UPCOMING, PHASE_NAMES } from '@/content/upcoming';
import { TYCOONS, tycoonById } from '@/sim/tycoons';
import { screenName } from '@/sim/desk';
import { upgradeCost, xpForLevel } from '@/sim/tycoons/framework';
import type { Game } from '@/sim/game';
import type { CosmeticTarget, TokenCost, ItemCategory } from '@/sim/types';
import type { OsApp, TycoonOS } from '../os';
import { splitH, type Rect, type Ui } from '../ui';
import { VIEWS } from './views';
import { junkMart } from './junkmart';
import { netplay } from './netplay'; // multiplayer (src/net)

const scrolls = new Map<string, number>();

/** Vertical list with mouse-wheel scrolling. */
export function list<T>(ui: Ui, key: string, r: Rect, items: T[], rowH: number, row: (it: T, rr: Rect) => void): void {
  const maxScroll = Math.max(0, items.length * rowH - r.h);
  const sc = Math.min(maxScroll, Math.max(0, (scrolls.get(key) ?? 0) + ui.takeWheel(r) * 0.6));
  scrolls.set(key, sc);
  const g = ui.g;
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  ui.pushBounds(r, 'scroll');
  items.forEach((it, i) => {
    const y = r.y + i * rowH - sc;
    if (y + rowH < r.y || y > r.y + r.h) return;
    row(it, { x: r.x, y, w: r.w - (maxScroll > 0 ? 10 : 0), h: rowH - 6 });
  });
  ui.popBounds();
  g.restore();
  if (maxScroll > 0) {
    const frac = r.h / (items.length * rowH);
    ui.rect({ x: r.x + r.w - 6, y: r.y + (sc / maxScroll) * r.h * (1 - frac), w: 6, h: r.h * frac }, ui.theme.muted, 3);
  }
}

/** Equal-width tab buttons; returns the clicked index or -1. Uses icons only when the labels would not fit. */
function tabs(ui: Ui, r: Rect, labels: { label: string; icon?: string }[], active: number): number {
  const gap = 4;
  const w = (r.w - gap * (labels.length - 1)) / labels.length;
  let hit = -1;
  labels.forEach((l, i) => {
    const size = w < 80 ? 11 : 13;
    const full = l.icon ? `${l.icon} ${l.label}` : l.label;
    const fits = ui.measure(full, size, true) <= w - 10;
    const text = fits ? full : ui.measure(l.label, size, true) <= w - 10 || !l.icon ? l.label : l.icon;
    if (ui.button({ x: r.x + i * (w + gap), y: r.y, w, h: r.h }, text, { primary: i === active, size })) hit = i;
  });
  return hit;
}

const TOKEN_ICON: Record<string, string> = { grind: '🟢', mogul: '🔵', chaos: '🟠', pixel: '🟣', golden: '🟡' };
export const costLabel = (c: TokenCost): string =>
  Object.entries(c).map(([t, v]) => `${TOKEN_ICON[t]}${v}`).join(' ') || 'free';

/** "Running on Monitor 2" / "Minimized · running" / … for a game. */
export function whereLabel(game: Game, id: string): { text: string; running: boolean } {
  const w = game.whereIs(id);
  if (!w) return { text: 'Closed: not earning', running: false };
  if ('screen' in w) return { text: `Running on ${screenName(w.screen)}`, running: true };
  return w.running ? { text: 'Minimized · background slot', running: true } : { text: 'Minimized · paused (no background slot)', running: false };
}

/* ------------------------------------------------------------------ */

const tycoonTab = new Map<string, 'play' | 'up'>();

function upgradesList(ui: Ui, r: Rect, id: string, game: Game): void {
  const def = tycoonById(id);
  const rt = game.state.tycoons[id]!;
  list(ui, `up:${id}`, r, def.upgrades, 72, (u, rr) => {
    const level = rt.upgrades[u.id] ?? 0;
    const maxed = u.max !== undefined && level >= u.max;
    const cost = upgradeCost(u, level);
    const bw = Math.min(96, Math.max(76, rr.w * 0.3));
    const tw = rr.w - bw - 20;
    ui.rect(rr, 'rgba(0,0,0,0.06)', 6);
    ui.text(`${u.name} · ${level}${u.max ? `/${u.max}` : ''}`, rr.x + 8, rr.y + 15, { size: 14, bold: true, maxWidth: tw });
    ui.paragraph(u.desc, { x: rr.x + 8, y: rr.y + 27, w: tw, h: 36 }, 12, ui.theme.muted, 2);
    if (ui.button({ x: rr.x + rr.w - bw - 6, y: rr.y + 12, w: bw, h: rr.h - 24 }, maxed ? 'MAX' : `${def.currency}${formatNum(cost)}`, { disabled: maxed || rt.money < cost, size: 13 }))
      game.buyTycoonUpgrade(id, u.id);
  });
}

function pausedView(ui: Ui, view: Rect, id: string, os: TycoonOS): void {
  ui.panel(view, '#222');
  const where = whereLabel(os.game, id);
  ui.text('⏸ Paused', view.x + view.w / 2, view.y + view.h / 2 - 40, { size: 24, color: '#fff', bold: true, align: 'center' });
  ui.text(where.text, view.x + view.w / 2, view.y + view.h / 2 - 8, { size: 14, color: '#ccc', align: 'center', maxWidth: view.w - 20 });
  if (ui.button({ x: view.x + view.w / 2 - 100, y: view.y + view.h / 2 + 16, w: 200, h: 44 }, '▶ Run here', { primary: true }))
    os.launch(id);
}

export function tycoonApp(id: string): OsApp {
  const def = tycoonById(id);
  return {
    id,
    title: def.name,
    icon: def.icon,
    draw(ui, r, os) {
      const game = os.game;
      const rt = game.state.tycoons[id];
      if (!rt) return;
      const value = game.cashOutValue(id);
      const cashLabel = `💸 Cash out ${formatCash(value)}`;
      const rateHint = `${def.currency}1 → ${formatCash(def.rate * game.exchangeRate())} Cash`;
      if (r.w >= 700) {
        // Wide: game on the left, money + upgrades on the right.
        const side = Math.max(250, Math.min(330, r.w * 0.36));
        const [view, panel] = splitH(r, r.w - side - 10, 10);
        if (rt.installed) VIEWS[id]?.(ui, view, rt, os);
        else pausedView(ui, view, id, os);
        ui.panel(panel);
        const p = { x: panel.x + 12, y: panel.y + 10, w: panel.w - 24, h: panel.h - 20 };
        ui.text(`${def.currency} ${formatNum(rt.money)}`, p.x, p.y + 16, { size: 24, bold: true, maxWidth: p.w - 80 });
        ui.text(`${formatNum(os.rate(id))}/s`, p.x + p.w, p.y + 18, { size: 13, color: ui.theme.muted, align: 'right', maxWidth: 74 });
        const need = xpForLevel(rt.level);
        const prev = rt.level > 0 ? xpForLevel(rt.level - 1) : 0;
        ui.text(`Level ${rt.level}`, p.x, p.y + 46, { size: 13, bold: true });
        ui.bar({ x: p.x + 70, y: p.y + 40, w: p.w - 70, h: 12 }, (rt.lifetime - prev) / (need - prev), def.color);
        if (ui.button({ x: p.x, y: p.y + 62, w: p.w, h: 48 }, cashLabel, { primary: true, size: 17, disabled: value.lte(0) })) game.cashOut(id);
        ui.text(game.flag('autoCashout') ? `Auto cash-out ON · ${rateHint}` : `Coins drop out of the PC · ${rateHint}`, p.x + p.w / 2, p.y + 124, {
          size: 12, color: ui.theme.muted, align: 'center', maxWidth: p.w,
        });
        upgradesList(ui, { x: p.x, y: p.y + 140, w: p.w, h: p.h - 140 }, id, game);
        return;
      }
      // Narrow: money strip, Play / Upgrades tabs.
      const head = { x: r.x, y: r.y, w: r.w, h: 46 };
      ui.panel(head);
      const bw = Math.min(220, Math.max(150, r.w * 0.48));
      ui.text(`${def.currency} ${formatNum(rt.money)}`, head.x + 10, head.y + 15, { size: 18, bold: true, maxWidth: r.w - bw - 26 });
      ui.text(`L${rt.level} · ${formatNum(os.rate(id))}/s · ${rateHint}`, head.x + 10, head.y + 34, { size: 11, color: ui.theme.muted, maxWidth: r.w - bw - 26 });
      if (ui.button({ x: head.x + head.w - bw - 6, y: head.y + 5, w: bw, h: 36 }, cashLabel, { primary: true, size: 14, disabled: value.lte(0) })) game.cashOut(id);
      const affordable = def.upgrades.filter((u) => {
        const l = rt.upgrades[u.id] ?? 0;
        return (u.max === undefined || l < u.max) && rt.money >= upgradeCost(u, l);
      }).length;
      const tab = tycoonTab.get(id) ?? 'play';
      const hit = tabs(ui, { x: r.x, y: r.y + 52, w: r.w, h: 30 }, [
        { icon: '🎮', label: 'Play' },
        { icon: '⬆', label: affordable ? `Upgrades (${affordable})` : 'Upgrades' },
      ], tab === 'play' ? 0 : 1);
      if (hit >= 0) tycoonTab.set(id, hit === 0 ? 'play' : 'up');
      const body = { x: r.x, y: r.y + 88, w: r.w, h: r.h - 88 };
      if (tab === 'up') upgradesList(ui, body, id, game);
      else if (rt.installed) VIEWS[id]?.(ui, body, rt, os);
      else pausedView(ui, body, id, os);
    },
  };
}

/* ------------------------------------------------------------------ */

const CATS: { id: ItemCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '🛍️' }, { id: 'hardware', label: 'Hardware', icon: '🖥️' }, { id: 'utility', label: 'Utility', icon: '🔧' },
  { id: 'furniture', label: 'Furniture', icon: '🪑' }, { id: 'decor', label: 'Decor', icon: '🪴' }, { id: 'key', label: 'Keys', icon: '🔑' },
];
let shopCat: ItemCategory | 'all' = 'all';

const ebuy: OsApp = {
  id: 'ebuy',
  title: 'eBuy',
  icon: '🛒',
  draw(ui, r, os) {
    const game = os.game;
    const hit = tabs(ui, { x: r.x, y: r.y, w: r.w, h: 32 }, CATS, CATS.findIndex((c) => c.id === shopCat));
    if (hit >= 0) shopCat = CATS[hit]!.id;
    const items = ITEMS.filter((i) => (shopCat === 'all' || i.category === shopCat) && game.phaseOpen(i.phase));
    list(ui, 'ebuy', { x: r.x, y: r.y + 40, w: r.w, h: r.h - 40 }, items, 78, (it, rr) => {
      const owned = game.state.items[it.id] ?? 0;
      const maxed = owned >= it.max;
      const narrow = rr.w < 560;
      const bw = narrow ? 104 : 130;
      const tw = rr.w - 60 - bw - 14;
      ui.rect(rr, 'rgba(0,0,0,0.06)', 6);
      ui.emoji(it.icon, rr.x + 28, rr.y + rr.h / 2, narrow ? 28 : 34);
      ui.text(`${it.name}  ·  ${owned}/${it.max}`, rr.x + 58, rr.y + 15, { size: narrow ? 14 : 16, bold: true, maxWidth: tw });
      ui.paragraph(it.desc, { x: rr.x + 58, y: rr.y + 28, w: tw, h: 40 }, 12, ui.theme.muted, 2);
      if (ui.button({ x: rr.x + rr.w - bw - 6, y: rr.y + 12, w: bw, h: rr.h - 24 }, maxed ? 'Owned' : formatCash(game.itemCost(it.id)), { disabled: !game.canBuyItem(it.id), primary: !maxed, size: 14 }))
        game.buyItem(it.id);
    });
  },
};

const appStore: OsApp = {
  id: 'appstore',
  title: 'App Store',
  icon: '🏪',
  draw(ui, r, os) {
    const game = os.game;
    ui.text(`▶ ${game.running().length}/${game.capacity()} running · games only earn while open on a screen`, r.x, r.y + 12, { size: 14, bold: true, maxWidth: r.w });
    type Row = { kind: 'game'; id: string } | { kind: 'soon'; name: string; icon: string; phase: string };
    const rows: Row[] = [
      ...TYCOONS.filter((t) => game.phaseOpen(t.phase)).map((t) => ({ kind: 'game' as const, id: t.id })),
      ...TYCOONS.filter((t) => !game.phaseOpen(t.phase)).map((t) => ({ kind: 'soon' as const, name: t.name, icon: t.icon, phase: `${PHASE_NAMES[t.phase]} (needs the key)` })),
      ...UPCOMING.map((u) => ({ kind: 'soon' as const, name: u.name, icon: u.icon, phase: PHASE_NAMES[u.phase] })),
    ];
    list(ui, 'store', { x: r.x, y: r.y + 30, w: r.w, h: r.h - 30 }, rows, 78, (row, rr) => {
      const bw = rr.w < 520 ? 116 : 144;
      const tw = rr.w - 60 - bw - 14;
      ui.rect(rr, 'rgba(0,0,0,0.06)', 6);
      if (row.kind === 'soon') {
        ui.g.globalAlpha = 0.5;
        ui.emoji(row.icon, rr.x + 28, rr.y + rr.h / 2, 30);
        ui.text(row.name, rr.x + 58, rr.y + 20, { size: 16, bold: true, maxWidth: rr.w - 70 });
        ui.text(`Coming soon · ${row.phase}`, rr.x + 58, rr.y + 46, { size: 12, color: ui.theme.muted, maxWidth: rr.w - 70 });
        ui.g.globalAlpha = 1;
        return;
      }
      const def = tycoonById(row.id);
      const rt = game.state.tycoons[row.id];
      ui.emoji(def.icon, rr.x + 28, rr.y + rr.h / 2, 30);
      ui.text(def.name, rr.x + 58, rr.y + 15, { size: 16, bold: true, maxWidth: tw });
      ui.text(def.tagline, rr.x + 58, rr.y + 36, { size: 12, color: ui.theme.muted, maxWidth: tw });
      const b = { x: rr.x + rr.w - bw - 6, y: rr.y + 12, w: bw, h: rr.h - 24 };
      if (!rt) {
        ui.text(`Price ${formatCash(def.unlockCost)}`, rr.x + 58, rr.y + 56, { size: 12, bold: true, maxWidth: tw });
        if (ui.button(b, `Install ${formatCash(def.unlockCost)}`, { primary: true, disabled: !game.canUnlockTycoon(row.id), size: 13 })) {
          if (game.unlockTycoon(row.id)) os.launch(row.id);
        }
        return;
      }
      const where = whereLabel(game, row.id);
      ui.text(where.text, rr.x + 58, rr.y + 56, { size: 12, bold: true, color: where.running ? ui.theme.good : ui.theme.bad, maxWidth: tw });
      if (where.running) {
        if (ui.button(b, '⏹ Stop', { size: 14 })) game.stopGame(row.id);
      } else if (ui.button(b, '▶ Open here', { size: 14, primary: true })) os.launch(row.id);
    });
  },
};

const wallet: OsApp = {
  id: 'wallet',
  title: 'Wallet',
  icon: '👛',
  draw(ui, r, os) {
    const s = os.game.state;
    const g = os.game;
    const rows: { a: string; b?: string; size?: number; muted?: boolean; head?: boolean }[] = [
      { a: '💵 Cash', b: formatCash(s.cash), size: 20 },
      { a: '🪙 On the floor (pick it up!)', b: formatCash(s.floorCash) },
      { a: '📈 Lifetime earnings', b: formatCash(s.lifetimeCash) },
      { a: '💱 Exchange rate', b: `x${g.exchangeRate().toFixed(2)}`, size: 18 },
      { a: `In-game $1 cashes out as ${formatCash(g.exchangeRate())} (× each game's own rate)`, muted: true },
      ...g.exchangeBreakdown().map((e) => ({ a: `   ${e.label}`, b: `x${e.mult.toFixed(2)}`, muted: true })),
      { a: 'Raise it: Business skills (Spreadsheet Brain, Market Maker…), gear (Pocket Calculator, Ring Light, TycoonOS XP…) and Vibe (decor).', muted: true },
      { a: 'Tokens', head: true },
      ...Object.entries(s.tokens).map(([t, v]) => {
        const info: Record<string, string> = {
          grind: 'Hustle: manual clicks', mogul: 'Business: game level-ups', chaos: 'Mayhem: physics chaos',
          pixel: 'Mastery: coming later', golden: 'Legend: coming later',
        };
        return { a: `${TOKEN_ICON[t]} ${t[0]!.toUpperCase()}${t.slice(1)} · ${info[t]}`, b: formatNum(v) };
      }),
      { a: `Next Grind Token: ${s.counters.grindProgress ?? 0}/${g.grindNeeded()} actions`, muted: true },
      { a: `Chaos Meter: ${Math.floor(s.counters.chaosMeter ?? 0)}/${g.chaosNeeded()} (repeat mayhem is worth less)`, muted: true },
    ];
    list(ui, 'wallet', r, rows, 30, (row, rr) => {
      const size = row.size ?? (row.muted ? 12 : 15);
      const y = rr.y + rr.h / 2;
      const bwid = row.b ? Math.min(140, ui.measure(row.b, size, true) + 4) : 0;
      if (row.head) ui.text(row.a, rr.x, y, { size: 17, bold: true });
      else if (row.muted && !row.b) ui.paragraph(row.a, { x: rr.x, y: rr.y - 2, w: rr.w, h: rr.h + 4 }, 11, ui.theme.muted, 2);
      else ui.text(row.a, rr.x, y, { size, color: row.muted ? ui.theme.muted : undefined, maxWidth: rr.w - bwid - 10 });
      if (row.b) ui.text(row.b, rr.x + rr.w, y, { size, bold: true, align: 'right', maxWidth: bwid });
    });
  },
};

const mail: OsApp = {
  id: 'mail',
  title: 'Mail',
  icon: '✉️',
  draw(ui, r, os) {
    const s = os.game.state;
    const active = os.game.activeQuest();
    list(ui, 'mail', r, QUESTS, 74, (q, rr) => {
      const done = s.quests.includes(q.id);
      const cur = active?.id === q.id;
      if (!done && !cur) ui.g.globalAlpha = 0.4;
      ui.rect(rr, cur ? 'rgba(255,215,0,0.25)' : 'rgba(0,0,0,0.06)', 6);
      ui.text(done ? '✅' : cur ? '📝' : '🔒', rr.x + 22, rr.y + rr.h / 2, { size: 22, align: 'center' });
      const rw = q.reward ? 70 : 0;
      ui.text(q.title, rr.x + 48, rr.y + 15, { size: 15, bold: true, maxWidth: rr.w - 56 - rw });
      ui.paragraph(done || cur ? q.text : '???', { x: rr.x + 48, y: rr.y + 27, w: rr.w - 56 - rw, h: 36 }, 12, ui.theme.muted, 2);
      if (q.reward) ui.text(`+$${q.reward}`, rr.x + rr.w - 10, rr.y + rr.h / 2, { size: 14, bold: true, align: 'right', color: ui.theme.good, maxWidth: rw - 6 });
      ui.g.globalAlpha = 1;
    });
  },
};

const taskmgr: OsApp = {
  id: 'taskmgr',
  title: 'Task Manager',
  icon: '📊',
  draw(ui, r, os) {
    const g = os.game;
    ui.text(`▶ ${g.running().length}/${g.capacity()} running · ${g.screenIds().length} screen(s) × ${g.windowsPerScreen()} window(s) + ${g.slots()} background`, r.x, r.y + 10, {
      size: 13, bold: true, maxWidth: r.w,
    });
    ui.text(`Speed x${g.stat('tycoon.speed').toFixed(2)} · Click power ${formatNum(g.stat('click.power'))} · Exchange x${g.exchangeRate().toFixed(2)}`, r.x, r.y + 30, {
      size: 12, color: ui.theme.muted, maxWidth: r.w,
    });
    const rts = Object.values(g.state.tycoons).sort((a, b) => Number(b.installed) - Number(a.installed));
    list(ui, 'tm', { x: r.x, y: r.y + 44, w: r.w, h: r.h - 44 }, rts, 66, (rt, rr) => {
      const def = tycoonById(rt.id);
      const where = whereLabel(g, rt.id);
      const bw = rr.w < 420 ? 74 : 96;
      const usd = rt.installed ? os.rate(rt.id) * def.rate * g.exchangeRate() : 0;
      const usdText = `≈ ${formatCash(usd)}/s`;
      const uw = Math.min(110, ui.measure(usdText, 14, true) + 4);
      const tw = rr.w - 52 - bw - uw - 22;
      ui.rect(rr, rt.installed ? 'rgba(40,160,60,0.12)' : 'rgba(0,0,0,0.06)', 6);
      ui.emoji(def.icon, rr.x + 24, rr.y + rr.h / 2, 26);
      ui.text(`${def.name} · L${rt.level}`, rr.x + 48, rr.y + 18, { size: 14, bold: true, maxWidth: tw });
      ui.text(where.text, rr.x + 48, rr.y + 40, { size: 12, color: where.running ? ui.theme.good : ui.theme.muted, maxWidth: tw });
      ui.text(usdText, rr.x + rr.w - bw - 14, rr.y + rr.h / 2, { size: 14, bold: true, align: 'right', maxWidth: uw });
      const b = { x: rr.x + rr.w - bw - 6, y: rr.y + 12, w: bw, h: rr.h - 24 };
      if (where.running) {
        if (ui.button(b, '⏹ Stop', { size: 13 })) g.stopGame(rt.id);
      } else if (ui.button(b, '▶ Open', { size: 13, primary: true })) os.launch(rt.id);
    });
  },
};

const TARGETS: { id: CosmeticTarget; label: string }[] = [
  { id: 'avatar', label: 'You' }, { id: 'pc', label: 'PC' }, { id: 'desk', label: 'Desk' },
  { id: 'coins', label: 'Coins' }, { id: 'props', label: 'Props' }, { id: 'screen', label: 'Screen' },
];
let wardrobeTarget: CosmeticTarget = 'props';

const RARITIES = ['all', 'common', 'rare', 'epic', 'legendary', 'glitched'] as const;
const RARITY_ORDER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, glitched: 4 };
const RARITY_COL: Record<string, string> = { common: '#9aa0a6', rare: '#3b82f6', epic: '#a855f7', legendary: '#f59e0b', glitched: '#10b981' };
let wardrobeRarity: (typeof RARITIES)[number] = 'all';
let wardrobeSort: 'rarity' | 'owned' | 'name' = 'rarity';

const wardrobe: OsApp = {
  id: 'wardrobe',
  title: 'Drip Shop',
  icon: '🎨',
  draw(ui, r, os) {
    const g = os.game;
    const hit = tabs(ui, { x: r.x, y: r.y, w: r.w, h: 32 }, TARGETS, TARGETS.findIndex((t) => t.id === wardrobeTarget));
    if (hit >= 0) wardrobeTarget = TARGETS[hit]!.id;
    const eq = g.state.cosmetics.equipped[wardrobeTarget];
    // Filter / sort row
    const fy = r.y + 40;
    const bw = Math.min(150, (r.w - 12) / 3);
    const rl = wardrobeRarity === 'all' ? 'All rarities' : wardrobeRarity[0]!.toUpperCase() + wardrobeRarity.slice(1);
    if (ui.button({ x: r.x, y: fy, w: bw, h: 30 }, `◆ ${rl}`, { size: 13, textColor: wardrobeRarity === 'all' ? undefined : RARITY_COL[wardrobeRarity] }))
      wardrobeRarity = RARITIES[(RARITIES.indexOf(wardrobeRarity) + 1) % RARITIES.length]!;
    const sorts = { rarity: 'Sort: rarity', owned: 'Sort: owned', name: 'Sort: A–Z' } as const;
    if (ui.button({ x: r.x + bw + 6, y: fy, w: bw, h: 30 }, sorts[wardrobeSort], { size: 13 }))
      wardrobeSort = wardrobeSort === 'rarity' ? 'owned' : wardrobeSort === 'owned' ? 'name' : 'rarity';
    ui.text(`Mod slots ${eq?.mods.length ?? 0}/${Math.floor(g.stat('cosmetic.slots'))}`, r.x + r.w, fy + 15, { size: 13, color: ui.theme.muted, align: 'right', maxWidth: r.w - 2 * bw - 16 });
    const owned = (id: string) => g.state.cosmetics.owned.includes(id);
    const items = COSMETICS.filter((c) => c.targets.includes(wardrobeTarget) && (wardrobeRarity === 'all' || c.rarity === wardrobeRarity)).sort((a, b) =>
      wardrobeSort === 'name'
        ? a.name.localeCompare(b.name)
        : wardrobeSort === 'owned'
          ? Number(owned(b.id)) - Number(owned(a.id)) || RARITY_ORDER[a.rarity]! - RARITY_ORDER[b.rarity]!
          : RARITY_ORDER[a.rarity]! - RARITY_ORDER[b.rarity]! || a.name.localeCompare(b.name),
    );
    const listR = { x: r.x, y: r.y + 78, w: r.w, h: r.h - 78 };
    if (!items.length) ui.text('Nothing here with this filter.', r.x + r.w / 2, listR.y + 40, { size: 15, color: ui.theme.muted, align: 'center' });
    list(ui, 'ward', listR, items, 74, (c, rr) => {
      const has = owned(c.id);
      const on = eq?.skin === c.id || !!eq?.mods.includes(c.id);
      const narrow = rr.w < 460;
      const bwid = narrow ? 96 : 134;
      ui.rect(rr, on ? 'rgba(80,200,120,0.25)' : 'rgba(0,0,0,0.06)', 6);
      ui.rect({ x: rr.x, y: rr.y, w: 6, h: rr.h }, RARITY_COL[c.rarity]!, 3);
      const badge = on ? '  ✅ Equipped' : has ? '  · Owned' : '';
      ui.text(`${c.name}${badge}`, rr.x + 16, rr.y + 16, { size: narrow ? 14 : 15, bold: true, maxWidth: rr.w - bwid - 28 });
      ui.paragraph(`${c.kind === 'skin' ? 'Skin' : 'Modifier'} · ${c.rarity} · ${c.desc}`, { x: rr.x + 16, y: rr.y + 28, w: rr.w - bwid - 28, h: 36 }, 12, ui.theme.muted, 2);
      const b = { x: rr.x + rr.w - bwid - 6, y: rr.y + 12, w: bwid, h: rr.h - 24 };
      if (!has) {
        const cost = g.cosmeticCost(c.id);
        if (ui.button(b, costLabel(cost), { disabled: !g.canAfford(cost), primary: true, size: 14 })) g.buyCosmetic(c.id);
      } else if (ui.button(b, on ? 'Unequip' : 'Equip', { size: 14 })) g.equip(wardrobeTarget, c.id);
    });
  },
};

const skills: OsApp = {
  id: 'skills',
  title: 'Skill Tree',
  icon: '🌳',
  draw(ui, r, os) {
    const t = os.game.state.tokens;
    const cx = r.x + r.w / 2;
    ui.text('The skill tree is huge. It opens full screen.', cx, r.y + 50, { size: 18, bold: true, align: 'center', maxWidth: r.w - 10 });
    ui.text(`${TOKEN_ICON.grind}${t.grind}  ${TOKEN_ICON.mogul}${t.mogul}  ${TOKEN_ICON.chaos}${t.chaos}`, cx, r.y + 100, { size: 24, align: 'center', maxWidth: r.w - 10 });
    const bw = Math.min(280, r.w - 10);
    if (ui.button({ x: cx - bw / 2, y: r.y + 140, w: bw, h: 56 }, 'Open Skill Tree (T)', { primary: true, size: 18 })) os.host.openSkillTree();
  },
};

const settings: OsApp = {
  id: 'settings',
  title: 'Settings',
  icon: '⚙️',
  draw(ui, r, os) {
    const st = os.game.state.settings;
    let y = r.y + 6;
    const vw = Math.min(110, r.w * 0.24);
    const row = (label: string, value: string, minus: () => void, plus: () => void) => {
      ui.text(label, r.x, y + 18, { size: 15, bold: true, maxWidth: r.w - vw - 96 });
      ui.text(value, r.x + r.w - 44 - vw / 2, y + 18, { size: 15, align: 'center', maxWidth: vw - 4 });
      if (ui.button({ x: r.x + r.w - vw - 88, y, w: 40, h: 36 }, '−', { size: 20 })) minus();
      if (ui.button({ x: r.x + r.w - 40, y, w: 40, h: 36 }, '+', { size: 20 })) plus();
      y += 44;
    };
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
    row('Wallpaper', `#${st.wallpaper + 1}`, () => (st.wallpaper = (st.wallpaper + 4) % 5), () => (st.wallpaper = (st.wallpaper + 1) % 5));
    row('Physics chaos (comfort)', `${Math.round(st.comfort * 100)}%`, () => (st.comfort = clamp(st.comfort - 0.1)), () => (st.comfort = clamp(st.comfort + 0.1)));
    row('Volume', `${Math.round(st.volume * 100)}%`, () => (st.volume = clamp(st.volume - 0.1)), () => (st.volume = clamp(st.volume + 0.1)));
    row('Reduced motion', st.reducedMotion ? 'On' : 'Off', () => (st.reducedMotion = false), () => (st.reducedMotion = true));
    const Q = ['auto', 'low', 'medium', 'high', 'ultra'] as const;
    const qi = Math.max(0, Q.indexOf(st.quality));
    row('Graphics quality', st.quality[0]!.toUpperCase() + st.quality.slice(1), () => (st.quality = Q[(qi + 4) % 5]!), () => (st.quality = Q[(qi + 1) % 5]!));
    ui.text(`OS: ${ui.theme.name} · ${os.maxWindows()} window${os.maxWindows() > 1 ? 's' : ''} per screen`, r.x, y + 12, { size: 13, color: ui.theme.muted, maxWidth: r.w });
    y += 30;
    const [a, b] = splitH({ x: r.x, y, w: r.w, h: 40 }, r.w / 2 - 5, 10);
    if (ui.button(a, '📋 Export save', { size: 14 })) os.host.exportSave();
    if (ui.button(b, '📥 Import save', { size: 14 })) os.host.importSave();
    if (ui.button({ x: r.x, y: y + 48, w: r.w, h: 40 }, '🗑️ Reset everything', { size: 14, color: '#8a1c1c' })) os.host.resetSave();
  },
};

export const builtinApps: OsApp[] = [ebuy, junkMart, appStore, skills, wardrobe, wallet, mail, taskmgr, settings, netplay];
