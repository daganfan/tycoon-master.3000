import { formatNum } from '@/core/num';
import type { TycoonRuntime } from '@/sim/types';
import { WEATHER_MULT, buyChance, lemonSuggested, refPrice, type LemonState } from '@/sim/tycoons/lemonMogul';
import { duckPrice, type DuckState } from '@/sim/tycoons/rubberDuckWorks';
import { SOCK_COLORS, binCapacity, type SockState } from '@/sim/tycoons/sockSyndicate';
import type { CouchState } from '@/sim/tycoons/couchCoinMining';
import { GARAGE_VIEWS } from './garageViews';
import type { TycoonOS } from '../os';
import type { Rect, Ui } from '../ui';

type View = (ui: Ui, r: Rect, rt: TycoonRuntime, os: TycoonOS) => void;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The big main-action button: bottom-right, sized to the view. */
export function bigButton(r: Rect): Rect {
  const w = clamp(r.w * 0.34, 130, 210);
  const h = clamp(r.h * 0.24, 60, 100);
  return { x: r.x + r.w - w - 10, y: r.y + r.h - h - 10, w, h };
}

/** Clip drawing to the view. */
function clipped(ui: Ui, r: Rect, draw: () => void): void {
  const g = ui.g;
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  draw();
  g.restore();
}

/** Each mini-tycoon has its own stylized 2D look, distinct from the realistic world. */
export const VIEWS: Record<string, View> = {
  ...GARAGE_VIEWS,
  lemon_mogul(ui, r, rt, os) {
    const s = rt.state as LemonState;
    const t = ui.time;
    const sky: Record<string, [string, string]> = {
      sunny: ['#5ec8ff', '#bdf0ff'],
      cloudy: ['#8aa0b3', '#cfd8df'],
      rainy: ['#4b5a6b', '#7d8b99'],
      heatwave: ['#ff9a3c', '#ffe07a'],
    };
    const [a, b] = sky[s.weather]!;
    ui.gradient(r, a, b);
    const g = ui.g;
    // Layout: info box (top), controls (bottom), stand in between.
    const forecast = os.game.flag('lemon.forecast') && s.next;
    const box = { x: r.x + 10, y: r.y + 10, w: Math.min(400, r.w - 20), h: forecast ? 102 : 80 };
    const big = bigButton(r);
    const priceW = 380;
    const stacked = r.w - big.w - 30 < priceW;
    const price = { x: r.x + 10, y: stacked ? big.y - 62 : r.y + r.h - 70, w: Math.min(priceW, r.w - 20), h: 56 };
    const ctrlTop = Math.min(price.y, big.y);
    const mid = { x: r.x, y: box.y + box.h + 8, w: r.w, h: ctrlTop - (box.y + box.h + 8) - 6 };
    clipped(ui, r, () => {
      if (s.weather === 'sunny' || s.weather === 'heatwave') {
        g.fillStyle = s.weather === 'heatwave' ? '#ff5a1f' : '#ffe14d';
        g.beginPath();
        g.arc(r.x + r.w - 70, r.y + 70, 40 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 4; i++) {
          const cx = r.x + ((i * 220 + t * 20) % (r.w + 200)) - 100;
          g.beginPath();
          g.ellipse(cx, r.y + 60 + i * 12, 70, 26, 0, 0, Math.PI * 2);
          g.fill();
        }
        if (s.weather === 'rainy') {
          g.strokeStyle = 'rgba(200,220,255,0.7)';
          g.lineWidth = 2;
          for (let i = 0; i < 60; i++) {
            const x = r.x + ((i * 53) % r.w);
            const y = r.y + ((i * 97 + t * 400) % r.h);
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x - 4, y + 14);
            g.stroke();
          }
        }
      }
      const ground = mid.y + mid.h * 0.75;
      ui.rect({ x: r.x, y: ground, w: r.w, h: r.y + r.h - ground }, '#7bc96f', 0);
      // The stand, scaled to fit the middle zone.
      const k = clamp(Math.min(mid.h / 170, (r.w - 40) / 260), 0.35, 1);
      const sw = 240 * k;
      const sx = r.x + r.w * 0.5 - sw / 2;
      const sy = ground - 150 * k;
      ui.rect({ x: sx + 10 * k, y: sy + 50 * k, w: 220 * k, h: 100 * k }, '#f4c542', 4);
      ui.rect({ x: sx, y: sy, w: sw, h: 30 * k }, '#e94b4b', 4);
      for (let i = 0; i < 6; i++) ui.rect({ x: sx + i * 40 * k, y: sy, w: 20 * k, h: 30 * k }, '#fff', 0);
      if (k > 0.55) ui.text('LEMONADE', sx + sw / 2, sy + 95 * k, { size: Math.round(24 * k), bold: true, color: '#8a5a00', align: 'center' });
      if ((rt.upgrades.umbrella ?? 0) > 0 && (s.weather === 'rainy' || s.weather === 'cloudy')) ui.emoji('☂️', sx - 20 * k, sy + 100 * k, 48 * k);
      if ((rt.upgrades.ice ?? 0) > 0) ui.emoji('🧊', sx + sw + 20 * k, sy + 120 * k, 34 * k);
      const customers = Math.min(8, Math.ceil(WEATHER_MULT[s.weather] * (1 + (rt.upgrades.sign ?? 0)) * 1.5));
      for (let i = 0; i < customers; i++) {
        const x = r.x + ((i * 170 + t * 60) % (r.w + 60)) - 30;
        ui.emoji(['🧍', '🚶', '🧑', '👩', '🧓'][i % 5]!, x, ground + 6, 30 * k + 6);
      }
    });
    ui.rect(box, 'rgba(0,0,0,0.45)', 8);
    const tw = box.w - 28;
    ui.text(`🥤 Cups: ${formatNum(s.cups)}`, box.x + 14, box.y + 18, { size: 17, bold: true, color: '#fff', maxWidth: tw });
    ui.text(`Weather: ${s.weather} (x${WEATHER_MULT[s.weather]} customers)`, box.x + 14, box.y + 42, { size: 13, color: '#fff', maxWidth: tw });
    const suggested = lemonSuggested(rt);
    const share = Math.round(buyChance(s.price, refPrice(s.weather, rt.upgrades)) * 100);
    ui.text(`💡 Suggested $${suggested.toFixed(2)} · ${share}% buy at yours`, box.x + 14, box.y + 64, { size: 13, color: '#ffe680', maxWidth: tw });
    if (forecast) ui.text(`📡 Forecast: ${s.next} in ${Math.ceil(s.weatherTimer)}s`, box.x + 14, box.y + 86, { size: 13, color: '#bfe8ff', maxWidth: tw });
    const warn = share < 15 ? 'Too pricey for this weather! Use the suggested price.' : s.cups < 1 && s.missed > 1 ? 'Customers are leaving thirsty! Squeeze!' : '';
    if (warn) {
      const ww = Math.min(r.w - 20, ui.measure(warn, 15, true) + 20);
      const wr = { x: r.x + (r.w - ww) / 2, y: mid.y + 2, w: ww, h: 26 };
      ui.rect(wr, 'rgba(255,255,255,0.85)', 6);
      ui.text(warn, wr.x + ww / 2, wr.y + 13, { size: 15, bold: true, color: '#b00020', align: 'center', maxWidth: ww - 12 });
    }
    ui.rect(price, 'rgba(0,0,0,0.45)', 8);
    const pb = price.x + price.w - 214;
    ui.text(`Price $${s.price.toFixed(2)}`, price.x + 12, price.y + price.h / 2, { size: 18, bold: true, color: '#fff', maxWidth: pb - price.x - 20 });
    if (ui.button({ x: pb, y: price.y + 8, w: 60, h: 40 }, '−5¢', { size: 15 })) os.game.action(rt.id, 'priceDown');
    if (ui.button({ x: pb + 66, y: price.y + 8, w: 60, h: 40 }, '+5¢', { size: 15 })) os.game.action(rt.id, 'priceUp');
    if (ui.button({ x: pb + 132, y: price.y + 8, w: 76, h: 40 }, '💡 Use', { size: 14, disabled: Math.abs(s.price - suggested) < 0.001 }))
      os.game.action(rt.id, 'priceSuggested');
    if (ui.button(big, '🍋 SQUEEZE', { color: '#e0a800', size: big.w < 170 ? 20 : 26 })) os.game.action(rt.id, 'squeeze');
  },

  rubber_duck_works(ui, r, rt, os) {
    const s = rt.state as DuckState;
    const t = ui.time;
    ui.gradient(r, '#2d3142', '#4f5d75');
    const g = ui.g;
    const box = { x: r.x + 10, y: r.y + 10, w: Math.min(340, r.w - 20), h: 88 };
    const big = bigButton(r);
    const by = clamp(r.y + r.h * 0.55, box.y + box.h + 40, big.y - 50);
    clipped(ui, r, () => {
      ui.rect({ x: r.x, y: by, w: r.w, h: 40 }, '#1b1b1b', 0);
      g.strokeStyle = '#555';
      g.lineWidth = 3;
      const speed = s.jammed ? 0 : 1 + (rt.upgrades.belt ?? 0) * 0.3;
      for (let x = 0; x < r.w + 40; x += 40) {
        const xx = r.x + ((x + t * 80 * speed) % (r.w + 40)) - 40;
        g.beginPath();
        g.moveTo(xx, by + 4);
        g.lineTo(xx + 20, by + 36);
        g.stroke();
      }
      const n = Math.min(10, 2 + (rt.upgrades.mold ?? 0));
      for (let i = 0; i < n; i++) {
        const x = r.x + ((i * (r.w / n) + t * 80 * speed) % r.w);
        const wob = s.jammed ? Math.sin(t * 20 + i) * 6 : 0;
        ui.emoji('🦆', x, by - 20 + wob, 40);
      }
      if ((rt.upgrades.inspector ?? 0) > 0) ui.emoji('🕵️', r.x + r.w * 0.6, by - 40, 36);
    });
    // Mold-o-matic sits right of the info box when there is room.
    const mold = { x: box.x + box.w + 10, y: box.y, w: 130, h: box.h };
    if (mold.x + mold.w <= r.x + r.w - 10) {
      ui.rect(mold, '#c9ada7', 6);
      ui.text('MOLD-O-MATIC', mold.x + mold.w / 2, mold.y + 20, { size: 13, bold: true, color: '#22223b', align: 'center' });
      ui.text(`x${rt.upgrades.mold ?? 0}`, mold.x + mold.w / 2, mold.y + 56, { size: 28, bold: true, color: '#22223b', align: 'center' });
    }
    ui.rect(box, 'rgba(0,0,0,0.45)', 8);
    const tw = box.w - 28;
    ui.text(`Ducks made: ${formatNum(s.made)}`, box.x + 14, box.y + 18, { size: 17, bold: true, color: '#fff', maxWidth: tw });
    ui.text(`Price per duck: Q¢${duckPrice(rt.upgrades.quality ?? 0, rt.upgrades.inspector ?? 0, rt.upgrades.export ?? 0).toFixed(2)}`, box.x + 14, box.y + 44, { size: 13, color: '#fff', maxWidth: tw });
    ui.text('Jam risk', box.x + 14, box.y + 68, { size: 12, color: '#fff' });
    ui.bar({ x: box.x + 80, y: box.y + 62, w: box.w - 94, h: 12 }, s.jamMeter, '#ff6b35');
    if (s.jammed) {
      const band = { x: r.x, y: by - 8, w: r.w, h: 54 };
      ui.rect(band, 'rgba(200,0,0,0.75)', 0);
      ui.text('⚠ BELT JAMMED ⚠', r.x + r.w / 2, band.y + band.h / 2, { size: 30, bold: true, color: '#fff', align: 'center', maxWidth: r.w - 20 });
      if (ui.button({ ...big, x: r.x + (r.w - big.w) / 2 }, '🔧 UNJAM', { color: '#d62828', size: big.w < 170 ? 20 : 26 })) os.game.action(rt.id, 'unjam');
    } else if (ui.button(big, '🦆 SQUEAK', { color: '#e0a800', size: big.w < 170 ? 20 : 26 })) os.game.action(rt.id, 'squeak');
  },

  sock_syndicate(ui, r, rt, os) {
    const s = rt.state as SockState;
    ui.gradient(r, '#3a1c71', '#d76d77');
    const cap = binCapacity(rt.upgrades.bin ?? 0);
    const total = s.bin.reduce((a, b) => a + b, 0);
    const head = { x: r.x + 10, y: r.y + 10, w: r.w - 20, h: 70 };
    const big = bigButton(r);
    const sell = { x: r.x + 10, y: big.y, w: Math.min(220, big.x - r.x - 20), h: big.h };
    const top = head.y + head.h + 12;
    const binH = Math.max(30, big.y - top - 40);
    const bw = (r.w - 20 - 3 * 12) / 4;
    s.bin.forEach((count, i) => {
      const x = r.x + 10 + i * (bw + 12);
      ui.rect({ x, y: top, w: bw, h: binH }, 'rgba(0,0,0,0.3)', 10);
      const fill = Math.min(binH, (count / Math.max(1, cap / 4)) * binH);
      ui.rect({ x, y: top + binH - fill, w: bw, h: fill }, SOCK_COLORS[i]!, 10);
      ui.text(`🧦 ${count}`, x + bw / 2, top + binH + 16, { size: 17, bold: true, color: '#fff', align: 'center', maxWidth: bw });
    });
    ui.rect(head, 'rgba(0,0,0,0.4)', 8);
    ui.text(`Bin ${total}/${cap}`, head.x + 14, head.y + 20, { size: 16, bold: true, color: '#fff', maxWidth: 120 });
    ui.bar({ x: head.x + 140, y: head.y + 13, w: head.w - 154, h: 14 }, total / cap, total / cap > 0.85 ? '#ff4d4d' : '#7cf07c');
    ui.text(`Pairs sold: ${formatNum(s.pairs)} · Lost socks: ${formatNum(s.lost)}${s.darned ? ` · Darned: ${formatNum(s.darned)}` : ''}`, head.x + 14, head.y + 50, {
      size: 13, color: '#fff', maxWidth: head.w - 28,
    });
    if (ui.button(sell, `Sell ${formatNum(s.lost)} lost`, { size: 16, disabled: s.lost < 1 })) os.game.action(rt.id, 'sellLost');
    if (ui.button(big, '🧦 MATCH', { color: '#8e44ad', size: big.w < 170 ? 20 : 26 })) os.game.action(rt.id, 'match');
  },

  couch_coin_mining(ui, r, rt, os) {
    const s = rt.state as CouchState;
    const layers = ['#8d5a3b', '#7a4b31', '#6b3f28', '#5c3421', '#4d2a1a', '#3f2114'];
    const big = bigButton(r);
    const title = Math.min(50, r.h / 8);
    const bottom = big.y - 8;
    const n = clamp(Math.floor((bottom - r.y - title) / 34), 2, 6);
    const lh = (bottom - r.y - title) / n;
    ui.rect({ x: r.x, y: r.y, w: r.w, h: title }, '#b5651d', 0);
    ui.text('🛋️ THE COUCH', r.x + r.w / 2, r.y + title / 2, { size: Math.min(24, title * 0.55), bold: true, color: '#fff', align: 'center' });
    for (let i = 0; i < n; i++) {
      const d = s.depth + i;
      const y = r.y + title + lh * i;
      ui.rect({ x: r.x, y, w: r.w, h: lh }, layers[d % layers.length]!, 0);
      ui.text(`Layer ${d}`, r.x + 12, y + lh / 2, { size: 13, color: 'rgba(255,255,255,0.6)' });
      if (i === 0) ui.bar({ x: r.x + 90, y: y + lh / 2 - 9, w: r.w - 110, h: 18 }, s.hp / s.maxHp, '#ffcf56');
    }
    ui.rect({ x: r.x, y: bottom, w: r.w, h: r.y + r.h - bottom }, '#2e1a10', 0);
    const info = { x: r.x + 10, y: big.y, w: big.x - r.x - 20, h: big.h };
    ui.rect(info, 'rgba(0,0,0,0.5)', 8);
    ui.text(`Depth ${s.depth} · ${formatNum(s.finds)} finds${s.rares ? ` · ✨${s.rares} rare` : ''}`, info.x + 12, info.y + info.h * 0.32, { size: 15, bold: true, color: '#fff', maxWidth: info.w - 24 });
    ui.text(`Last find: ${s.lastFind}`, info.x + 12, info.y + info.h * 0.7, { size: 13, color: '#fff', maxWidth: info.w - 24 });
    if (ui.button(big, '⛏️ DIG', { color: '#a0522d', size: big.w < 170 ? 22 : 28 })) os.game.action(rt.id, 'dig');
  },
};
