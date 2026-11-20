import { formatCash, num } from '@/core/num';
import type { Game } from '@/sim/game';
import { DECOR, DECOR_CATEGORIES, dailyDeal, decorById, decorItemId, type DecorCategory, type DecorDef } from '@/content/decor';
import type { OsApp } from '../os';
import type { Rect, Ui } from '../ui';

/**
 * Junk Mart: a shop full of useless, quirky bedroom decorations.
 * Category tabs, paged list, and a deterministic daily deal (20% off).
 */

let cat: DecorCategory | 'all' = 'all';
let page = 0;

export function dealPrice(game: Game, d: DecorDef, now = Date.now()) {
  const full = game.itemCost(decorItemId(d.id));
  const deal = dailyDeal(now);
  return deal.id === d.id ? full.mul(1 - deal.discount).ceil() : full;
}

export function canBuyDecor(game: Game, d: DecorDef, now = Date.now()): boolean {
  const owned = game.state.items[decorItemId(d.id)] ?? 0;
  return owned < d.max && game.state.cash.gte(dealPrice(game, d, now));
}

/** Buy through game.buyItem; the daily-deal discount is paid back as a rebate around the purchase. */
export function buyDecor(game: Game, d: DecorDef, now = Date.now()): boolean {
  const id = decorItemId(d.id);
  if (!canBuyDecor(game, d, now)) return false;
  const rebate = game.itemCost(id).sub(dealPrice(game, d, now)).max(num(0));
  game.state.cash = game.state.cash.add(rebate);
  if (game.buyItem(id)) return true;
  game.state.cash = game.state.cash.sub(rebate);
  return false;
}

function header(ui: Ui, r: Rect, game: Game): void {
  const deal = dailyDeal();
  const d = decorById(deal.id)!;
  ui.gradient(r, '#ff5f6d', '#ffc371', false);
  const narrow = r.w < 520;
  ui.emoji(d.icon, r.x + 32, r.y + r.h / 2, 34);
  ui.text('🔥 DEAL OF THE DAY · 20% OFF', r.x + 62, r.y + 18, { size: narrow ? 11 : 13, bold: true, color: '#fff' });
  ui.text(d.name, r.x + 62, r.y + 42, { size: narrow ? 14 : 18, bold: true, color: '#fff', maxWidth: r.w - 62 - 132 });
  const owned = game.state.items[decorItemId(d.id)] ?? 0;
  const b = { x: r.x + r.w - 124, y: r.y + 12, w: 116, h: r.h - 24 };
  const label = owned >= d.max ? 'Sold out' : formatCash(dealPrice(game, d));
  if (ui.button(b, label, { primary: true, disabled: !canBuyDecor(game, d), size: 15, color: '#c2185b' })) buyDecor(game, d);
}

function tabs(ui: Ui, r: Rect): void {
  const all = [{ id: 'all' as const, label: 'All', icon: '🛍️' }, ...DECOR_CATEGORIES];
  const gap = 4;
  const w = (r.w - gap * (all.length - 1)) / all.length;
  const iconOnly = w < 96;
  all.forEach((c, i) => {
    const b = { x: r.x + i * (w + gap), y: r.y, w, h: r.h };
    if (ui.button(b, iconOnly ? c.icon : `${c.icon} ${c.label}`, { primary: cat === c.id, size: iconOnly ? 16 : 12 })) {
      cat = c.id;
      page = 0;
    }
  });
}

function row(ui: Ui, rr: Rect, game: Game, d: DecorDef, deal: string): void {
  const owned = game.state.items[decorItemId(d.id)] ?? 0;
  const maxed = owned >= d.max;
  const narrow = rr.w < 480;
  const isDeal = deal === d.id;
  ui.rect(rr, isDeal ? 'rgba(255,150,60,0.22)' : 'rgba(0,0,0,0.06)', 6);
  ui.emoji(d.icon, rr.x + 28, rr.y + rr.h / 2, narrow ? 26 : 32);
  const bw = narrow ? 100 : 124;
  const tx = rr.x + 56;
  const tw = rr.w - 56 - bw - 14;
  ui.text(d.name, tx, rr.y + 16, { size: narrow ? 14 : 16, bold: true, maxWidth: tw });
  ui.text(d.desc, tx, rr.y + 36, { size: 12, color: ui.theme.muted, maxWidth: tw });
  const tags = `✨ +${d.vibe} vibe${d.quirk ? ` · ${d.quirk}` : ''} · ${owned}/${d.max}${isDeal ? ' · 🔥 -20%' : ''}`;
  ui.text(tags, tx, rr.y + 55, { size: 11, color: isDeal ? ui.theme.bad : ui.theme.good, maxWidth: tw, bold: true });
  const label = maxed ? 'Owned' : formatCash(dealPrice(game, d));
  if (ui.button({ x: rr.x + rr.w - bw - 6, y: rr.y + 12, w: bw, h: rr.h - 24 }, label, { primary: !maxed, disabled: !canBuyDecor(game, d), size: narrow ? 13 : 15 }))
    buyDecor(game, d);
}

export const junkMart: OsApp = {
  id: 'junkmart',
  title: 'Junk Mart',
  icon: '🦩',
  draw(ui, r, os) {
    const game = os.game;
    const deal = dailyDeal().id;
    header(ui, { x: r.x, y: r.y, w: r.w, h: 64 }, game);
    tabs(ui, { x: r.x, y: r.y + 72, w: r.w, h: 34 });
    const items = DECOR.filter((d) => cat === 'all' || d.cat === cat);
    const footH = 40;
    const listR = { x: r.x, y: r.y + 114, w: r.w, h: r.h - 114 - footH };
    const rowH = 76;
    const per = Math.max(1, Math.floor(listR.h / rowH));
    const pages = Math.max(1, Math.ceil(items.length / per));
    const wheel = ui.takeWheel(listR);
    if (wheel > 0) page++;
    if (wheel < 0) page--;
    page = Math.max(0, Math.min(pages - 1, page));
    items.slice(page * per, page * per + per).forEach((d, i) => row(ui, { x: listR.x, y: listR.y + i * rowH, w: listR.w, h: rowH - 6 }, game, d, deal));
    // Footer: paging + decor vibe summary
    const fy = r.y + r.h - footH + 4;
    if (ui.button({ x: r.x, y: fy, w: 44, h: footH - 8 }, '◀', { disabled: page === 0, size: 16 })) page--;
    if (ui.button({ x: r.x + 50, y: fy, w: 44, h: footH - 8 }, '▶', { disabled: page >= pages - 1, size: 16 })) page++;
    ui.text(`Page ${page + 1}/${pages}`, r.x + 104, fy + (footH - 8) / 2, { size: 13, color: ui.theme.muted });
    const vibe = DECOR.reduce((a, d) => a + (game.state.items[decorItemId(d.id)] ?? 0) * d.vibe, 0);
    ui.text(`Decor vibe +${vibe.toFixed(2)} (+${(vibe * 3).toFixed(1)}% exchange)`, r.x + r.w, fy + (footH - 8) / 2, {
      size: r.w < 480 ? 11 : 13, bold: true, align: 'right', color: ui.theme.good, maxWidth: r.w - 200,
    });
  },
};
