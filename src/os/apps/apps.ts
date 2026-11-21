import { formatCash, formatNum } from '@/core/num';
import { ITEMS } from '@/content/items';
import { COSMETICS } from '@/content/cosmetics';
import { QUESTS } from '@/content/quests';
import { UPCOMING, PHASE_NAMES } from '@/content/upcoming';
import { TYCOONS, tycoonById } from '@/sim/tycoons';
import { upgradeCost, xpForLevel } from '@/sim/tycoons/framework';
import type { CosmeticTarget, TokenCost, ItemCategory } from '@/sim/types';
import type { OsApp } from '../os';
import { splitH, splitV, type Rect, type Ui } from '../ui';
import { VIEWS } from './views';
import { junkMart } from './junkmart';
import { netplay } from './netplay'; // multiplayer (src/net)

const scrolls = new Map<string, number>();

/** Vertical list with mouse-wheel scrolling. */
function list<T>(ui: Ui, key: string, r: Rect, items: T[], rowH: number, row: (it: T, rr: Rect) => void): void {
  const maxScroll = Math.max(0, items.length * rowH - r.h);
  const sc = Math.min(maxScroll, Math.max(0, (scrolls.get(key) ?? 0) + ui.takeWheel(r) * 0.6));
  scrolls.set(key, sc);
  const g = ui.g;
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  items.forEach((it, i) => {
    const y = r.y + i * rowH - sc;
    if (y + rowH < r.y || y > r.y + r.h) return;
    row(it, { x: r.x, y, w: r.w - (maxScroll > 0 ? 10 : 0), h: rowH - 6 });
  });
  g.restore();
  if (maxScroll > 0) {
    const frac = r.h / (items.length * rowH);
    ui.rect({ x: r.x + r.w - 6, y: r.y + (sc / maxScroll) * r.h * (1 - frac), w: 6, h: r.h * frac }, ui.theme.muted, 3);
  }
}

const TOKEN_ICON: Record<string, string> = { grind: '🟢', mogul: '🔵', chaos: '🟠', pixel: '🟣', golden: '🟡' };
export const costLabel = (c: TokenCost): string =>
  Object.entries(c).map(([t, v]) => `${TOKEN_ICON[t]}${v}`).join(' ') || 'free';

/* ------------------------------------------------------------------ */

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
      const side = Math.max(230, Math.min(330, r.w * 0.42));
      const [view, panel] = splitH(r, r.w - side - 10, 10);
      if (!rt.installed) {
        ui.panel(view, '#222');
        ui.text('Paused (no free slot)', view.x + view.w / 2, view.y + view.h / 2 - 20, { size: 22, color: '#fff', bold: true, align: 'center' });
        if (ui.button({ x: view.x + view.w / 2 - 110, y: view.y + view.h / 2 + 10, w: 220, h: 44 }, 'Run here', { primary: true, disabled: game.slotsUsed() >= game.slots() }))
          game.setRunning(id, true);
      } else {
        VIEWS[id]?.(ui, view, rt, os);
      }
      // Side panel: money, level, cash out, upgrades
      ui.panel(panel);
      const p = { x: panel.x + 12, y: panel.y + 10, w: panel.w - 24, h: panel.h - 20 };
      ui.text(`${def.currency} ${formatNum(rt.money)}`, p.x, p.y + 16, { size: 26, bold: true });
      ui.text(`${formatNum(os.rate(id))}/s`, p.x + p.w, p.y + 18, { size: 14, color: ui.theme.muted, align: 'right' });
      const need = xpForLevel(rt.level);
      const prev = rt.level > 0 ? xpForLevel(rt.level - 1) : 0;
      ui.text(`Level ${rt.level}`, p.x, p.y + 48, { size: 14, bold: true });
      ui.bar({ x: p.x + 70, y: p.y + 42, w: p.w - 70, h: 12 }, (rt.lifetime - prev) / (need - prev), def.color);
      const value = game.cashOutValue(id);
      if (ui.button({ x: p.x, y: p.y + 64, w: p.w, h: 50 }, `💸 Cash out ${formatCash(value)}`, { primary: true, size: 18, disabled: value.lte(0) })) game.cashOut(id);
      ui.text(game.flag('autoCashout') ? 'Auto cash-out is ON' : 'Cash comes out of the PC as coins!', p.x + p.w / 2, p.y + 128, { size: 12, color: ui.theme.muted, align: 'center' });
      const ups = { x: p.x, y: p.y + 144, w: p.w, h: p.h - 144 };
      list(ui, `up:${id}`, ups, def.upgrades, 70, (u, rr) => {
        const level = rt.upgrades[u.id] ?? 0;
        const maxed = u.max !== undefined && level >= u.max;
        const cost = upgradeCost(u, level);
        ui.rect(rr, 'rgba(0,0,0,0.06)', 6);
        ui.text(`${u.name}  ·  ${level}${u.max ? `/${u.max}` : ''}`, rr.x + 8, rr.y + 18, { size: 15, bold: true, maxWidth: rr.w - 112 });
        ui.text(u.desc, rr.x + 8, rr.y + 44, { size: 12, color: ui.theme.muted, maxWidth: rr.w - 112 });
        if (ui.button({ x: rr.x + rr.w - 96, y: rr.y + 10, w: 90, h: rr.h - 20 }, maxed ? 'MAX' : `${def.currency}${formatNum(cost)}`, { disabled: maxed || rt.money < cost, size: 13 }))
          game.buyTycoonUpgrade(id, u.id);
      });
    },
  };
}

/* ------------------------------------------------------------------ */

const CATS: { id: ItemCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'hardware', label: 'Hardware' }, { id: 'utility', label: 'Utility' },
  { id: 'furniture', label: 'Furniture' }, { id: 'decor', label: 'Decor' }, { id: 'key', label: 'Keys' },
];
let shopCat: ItemCategory | 'all' = 'all';

const ebuy: OsApp = {
  id: 'ebuy',
  title: 'eBuy',
  icon: '🛒',
  draw(ui, r, os) {
    const game = os.game;
    const tw = Math.min(112, (r.w - 6 * (CATS.length - 1)) / CATS.length);
    CATS.forEach((c, i) => {
      if (ui.button({ x: r.x + i * (tw + 6), y: r.y, w: tw, h: 34 }, c.label, { primary: shopCat === c.id, size: tw < 80 ? 11 : 14 })) shopCat = c.id;
    });
    const items = ITEMS.filter((i) => shopCat === 'all' || i.category === shopCat);
    list(ui, 'ebuy', { x: r.x, y: r.y + 44, w: r.w, h: r.h - 44 }, items, 78, (it, rr) => {
      const owned = game.state.items[it.id] ?? 0;
      const maxed = owned >= it.max;
      ui.rect(rr, 'rgba(0,0,0,0.06)', 6);
      ui.emoji(it.icon, rr.x + 34, rr.y + rr.h / 2, 36);
      ui.text(it.name, rr.x + 68, rr.y + 20, { size: 17, bold: true });
      ui.text(it.desc, rr.x + 68, rr.y + 46, { size: 13, color: ui.theme.muted, maxWidth: rr.w - 260 });
      ui.text(`${owned}/${it.max}`, rr.x + rr.w - 150, rr.y + rr.h / 2, { size: 14, color: ui.theme.muted, align: 'right' });
      if (ui.button({ x: rr.x + rr.w - 136, y: rr.y + 12, w: 130, h: rr.h - 24 }, maxed ? 'Owned' : formatCash(game.itemCost(it.id)), { disabled: !game.canBuyItem(it.id), primary: !maxed, size: 15 }))
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
    ui.text(`Game slots: ${game.slotsUsed()}/${game.slots()} running`, r.x, r.y + 14, { size: 16, bold: true });
    type Row = { kind: 'game'; id: string } | { kind: 'soon'; name: string; icon: string; phase: string };
    const rows: Row[] = [
      ...TYCOONS.map((t) => ({ kind: 'game' as const, id: t.id })),
      ...UPCOMING.map((u) => ({ kind: 'soon' as const, name: u.name, icon: u.icon, phase: PHASE_NAMES[u.phase] })),
    ];
    list(ui, 'store', { x: r.x, y: r.y + 34, w: r.w, h: r.h - 34 }, rows, 76, (row, rr) => {
      ui.rect(rr, 'rgba(0,0,0,0.06)', 6);
      if (row.kind === 'soon') {
        ui.g.globalAlpha = 0.5;
        ui.emoji(row.icon, rr.x + 34, rr.y + rr.h / 2, 34);
        ui.text(row.name, rr.x + 68, rr.y + 22, { size: 17, bold: true });
        ui.text(`Coming soon · ${row.phase}`, rr.x + 68, rr.y + 46, { size: 13, color: ui.theme.muted });
        ui.g.globalAlpha = 1;
        return;
      }
      const def = tycoonById(row.id);
      const rt = game.state.tycoons[row.id];
      ui.emoji(def.icon, rr.x + 34, rr.y + rr.h / 2, 34);
      ui.text(def.name, rr.x + 68, rr.y + 22, { size: 17, bold: true });
      ui.text(def.tagline, rr.x + 68, rr.y + 46, { size: 13, color: ui.theme.muted, maxWidth: rr.w - 230 });
      const b = { x: rr.x + rr.w - 150, y: rr.y + 12, w: 144, h: rr.h - 24 };
      if (!rt) {
        if (ui.button(b, `Install ${formatCash(def.unlockCost)}`, { primary: true, disabled: !game.canUnlockTycoon(row.id), size: 14 })) {
          if (game.unlockTycoon(row.id)) os.open(row.id);
        }
      } else if (rt.installed) {
        if (ui.button(b, '⏸ Pause', { size: 14, disabled: game.running().length <= 1 })) game.setRunning(row.id, false);
      } else if (ui.button(b, '▶ Run', { size: 14, disabled: game.slotsUsed() >= game.slots() })) game.setRunning(row.id, true);
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
    let y = r.y + 20;
    const line = (a: string, b: string, size = 18) => {
      ui.text(a, r.x, y, { size });
      ui.text(b, r.x + r.w, y, { size, bold: true, align: 'right' });
      y += size * 1.9;
    };
    line('💵 Cash', formatCash(s.cash), 24);
    line('🪙 On the floor (pick it up!)', formatCash(s.floorCash));
    line('📈 Lifetime earnings', formatCash(s.lifetimeCash));
    line('💱 Exchange rate', `x${g.exchangeRate().toFixed(2)}`);
    line('✨ Vibe', String(g.stat('vibe')));
    y += 6;
    ui.text('Tokens', r.x, y, { size: 20, bold: true });
    y += 34;
    const info: Record<string, string> = {
      grind: 'Hustle: manual clicks', mogul: 'Business: game level-ups', chaos: 'Mayhem: physics chaos',
      pixel: 'Mastery: coming later', golden: 'Legend: coming later',
    };
    for (const [t, v] of Object.entries(s.tokens)) line(`${TOKEN_ICON[t]} ${t[0]!.toUpperCase()}${t.slice(1)} · ${info[t]}`, formatNum(v), 16);
    const need = g.grindNeeded();
    ui.text(`Next Grind Token: ${s.counters.grindProgress ?? 0}/${need} actions`, r.x, y, { size: 14, color: ui.theme.muted });
    ui.text(`Chaos Meter: ${Math.floor(s.counters.chaosMeter ?? 0)}/${g.chaosNeeded()} (repeat mayhem is worth less)`, r.x, y + 22, { size: 14, color: ui.theme.muted });
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
      ui.text(q.title, rr.x + 48, rr.y + 20, { size: 16, bold: true });
      ui.text(done || cur ? q.text : '???', rr.x + 48, rr.y + 46, { size: 13, color: ui.theme.muted, maxWidth: rr.w - 150 });
      if (q.reward) ui.text(`+$${q.reward}`, rr.x + rr.w - 12, rr.y + rr.h / 2, { size: 15, bold: true, align: 'right', color: ui.theme.good });
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
    ui.text(`Slots ${g.slotsUsed()}/${g.slots()} · Speed x${g.stat('tycoon.speed').toFixed(2)} · Click power ${formatNum(g.stat('click.power'))}`, r.x, r.y + 14, { size: 15, bold: true });
    const rts = Object.values(g.state.tycoons);
    list(ui, 'tm', { x: r.x, y: r.y + 36, w: r.w, h: r.h - 36 }, rts, 64, (rt, rr) => {
      const def = tycoonById(rt.id);
      ui.rect(rr, 'rgba(0,0,0,0.06)', 6);
      ui.emoji(def.icon, rr.x + 26, rr.y + rr.h / 2, 28);
      ui.text(def.name, rr.x + 52, rr.y + 18, { size: 15, bold: true });
      ui.text(rt.installed ? `Running · L${rt.level}` : 'Paused', rr.x + 52, rr.y + 40, { size: 13, color: rt.installed ? ui.theme.good : ui.theme.muted });
      const usd = os.rate(rt.id) * def.rate * g.exchangeRate();
      ui.text(`≈ ${formatCash(usd)}/s`, rr.x + rr.w - 12, rr.y + rr.h / 2, { size: 16, bold: true, align: 'right' });
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
    const tw = Math.min(90, (r.w - 6 * (TARGETS.length - 1)) / TARGETS.length);
    TARGETS.forEach((t, i) => {
      if (ui.button({ x: r.x + i * (tw + 6), y: r.y, w: tw, h: 34 }, t.label, { primary: wardrobeTarget === t.id, size: tw < 70 ? 12 : 14 })) wardrobeTarget = t.id;
    });
    const eq = g.state.cosmetics.equipped[wardrobeTarget];
    // Filter / sort row
    const fy = r.y + 42;
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
    const listR = { x: r.x, y: r.y + 80, w: r.w, h: r.h - 80 };
    if (!items.length) ui.text('Nothing here with this filter.', r.x + r.w / 2, listR.y + 40, { size: 15, color: ui.theme.muted, align: 'center' });
    list(ui, 'ward', listR, items, 74, (c, rr) => {
      const has = owned(c.id);
      const on = eq?.skin === c.id || !!eq?.mods.includes(c.id);
      const narrow = rr.w < 460;
      const bwid = narrow ? 96 : 134;
      ui.rect(rr, on ? 'rgba(80,200,120,0.25)' : 'rgba(0,0,0,0.06)', 6);
      ui.rect({ x: rr.x, y: rr.y, w: 6, h: rr.h }, RARITY_COL[c.rarity]!, 3);
      const badge = on ? '  ✅ Equipped' : has ? '  · Owned' : '';
      ui.text(`${c.name}${badge}`, rr.x + 16, rr.y + 20, { size: narrow ? 14 : 16, bold: true, maxWidth: rr.w - bwid - 28 });
      ui.text(`${c.kind === 'skin' ? 'Skin' : 'Modifier'} · ${c.rarity} · ${c.desc}`, rr.x + 16, rr.y + 46, { size: 12, color: ui.theme.muted, maxWidth: rr.w - bwid - 28 });
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
    ui.text('The skill tree is huge. It opens full screen.', r.x + r.w / 2, r.y + 60, { size: 20, bold: true, align: 'center' });
    ui.text(`${TOKEN_ICON.grind}${t.grind}  ${TOKEN_ICON.mogul}${t.mogul}  ${TOKEN_ICON.chaos}${t.chaos}`, r.x + r.w / 2, r.y + 110, { size: 24, align: 'center' });
    if (ui.button({ x: r.x + r.w / 2 - 140, y: r.y + 150, w: 280, h: 60 }, 'Open Skill Tree (T)', { primary: true, size: 20 })) os.host.openSkillTree();
  },
};

const settings: OsApp = {
  id: 'settings',
  title: 'Settings',
  icon: '⚙️',
  draw(ui, r, os) {
    const st = os.game.state.settings;
    let y = r.y + 10;
    const row = (label: string, value: string, minus: () => void, plus: () => void) => {
      ui.text(label, r.x, y + 20, { size: 17, bold: true });
      ui.text(value, r.x + r.w - 130, y + 20, { size: 16, align: 'center' });
      if (ui.button({ x: r.x + r.w - 220, y: y + 2, w: 40, h: 36 }, '−', { size: 20 })) minus();
      if (ui.button({ x: r.x + r.w - 40, y: y + 2, w: 40, h: 36 }, '+', { size: 20 })) plus();
      y += 54;
    };
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
    row('Wallpaper', `#${st.wallpaper + 1}`, () => (st.wallpaper = (st.wallpaper + 4) % 5), () => (st.wallpaper = (st.wallpaper + 1) % 5));
    row('Physics chaos (comfort)', `${Math.round(st.comfort * 100)}%`, () => (st.comfort = clamp(st.comfort - 0.1)), () => (st.comfort = clamp(st.comfort + 0.1)));
    row('Volume', `${Math.round(st.volume * 100)}%`, () => (st.volume = clamp(st.volume - 0.1)), () => (st.volume = clamp(st.volume + 0.1)));
    row('Reduced motion', st.reducedMotion ? 'On' : 'Off', () => (st.reducedMotion = false), () => (st.reducedMotion = true));
    const Q = ['auto', 'low', 'medium', 'high', 'ultra'] as const;
    const qi = Math.max(0, Q.indexOf(st.quality));
    row('Graphics quality', st.quality[0]!.toUpperCase() + st.quality.slice(1), () => (st.quality = Q[(qi + 4) % 5]!), () => (st.quality = Q[(qi + 1) % 5]!));
    ui.text(`OS: ${ui.theme.name} · ${os.maxWindows()} window${os.maxWindows() > 1 ? 's' : ''} at once`, r.x, y + 16, { size: 14, color: ui.theme.muted });
    y += 46;
    const [a, b] = splitH({ x: r.x, y, w: r.w, h: 44 }, r.w / 2 - 5, 10);
    if (ui.button(a, '📋 Export save', { size: 15 })) os.host.exportSave();
    if (ui.button(b, '📥 Import save', { size: 15 })) os.host.importSave();
    const [, bottom] = splitV({ x: r.x, y: y + 56, w: r.w, h: 44 }, 0);
    if (ui.button(bottom, '🗑️ Reset everything', { size: 15, color: '#8a1c1c' })) os.host.resetSave();
  },
};

export const builtinApps: OsApp[] = [ebuy, junkMart, appStore, skills, wardrobe, wallet, mail, taskmgr, settings, netplay];
