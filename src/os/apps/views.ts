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
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    if (s.weather === 'sunny' || s.weather === 'heatwave') {
      g.fillStyle = s.weather === 'heatwave' ? '#ff5a1f' : '#ffe14d';
      g.beginPath();
      g.arc(r.x + r.w - 90, r.y + 120, 46 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i++) {
        const cx = r.x + ((i * 220 + t * 20) % (r.w + 200)) - 100;
        g.beginPath();
        g.ellipse(cx, r.y + 110 + i * 12, 70, 26, 0, 0, Math.PI * 2);
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
    ui.rect({ x: r.x, y: r.y + r.h * 0.68, w: r.w, h: r.h * 0.32 }, '#7bc96f', 0);
    const sx = r.x + r.w * 0.5 - 110;
    const sy = r.y + r.h * 0.38;
    ui.rect({ x: sx, y: sy + 60, w: 220, h: 100 }, '#f4c542', 4);
    ui.rect({ x: sx - 10, y: sy, w: 240, h: 30 }, '#e94b4b', 4);
    for (let i = 0; i < 6; i++) ui.rect({ x: sx - 10 + i * 40, y: sy, w: 20, h: 30 }, '#fff', 0);
    ui.text('LEMONADE', sx + 110, sy + 100, { size: 26, bold: true, color: '#8a5a00', align: 'center' });
    const customers = Math.min(8, Math.ceil(WEATHER_MULT[s.weather] * (1 + (rt.upgrades.sign ?? 0)) * 1.5));
    for (let i = 0; i < customers; i++) {
      const x = r.x + ((i * 170 + t * 60) % (r.w + 60)) - 30;
      ui.emoji(['🧍', '🚶', '🧑', '👩', '🧓'][i % 5]!, x, r.y + r.h * 0.76, 34);
    }
    g.restore();
    const forecast = os.game.flag('lemon.forecast') && s.next;
    ui.rect({ x: r.x + 10, y: r.y + 10, w: 380, h: forecast ? 128 : 102 }, 'rgba(0,0,0,0.45)', 8);
    ui.text(`🥤 Cups: ${formatNum(s.cups)}`, r.x + 24, r.y + 32, { size: 18, bold: true, color: '#fff' });
    ui.text(`Weather: ${s.weather} (x${WEATHER_MULT[s.weather]} customers)`, r.x + 24, r.y + 62, { size: 15, color: '#fff' });
    const suggested = lemonSuggested(rt);
    const share = Math.round(buyChance(s.price, refPrice(s.weather, rt.upgrades)) * 100);
    ui.text(`💡 Suggested price: $${suggested.toFixed(2)} · ${share}% buy at yours`, r.x + 24, r.y + 88, { size: 14, color: '#ffe680' });
    if (forecast) ui.text(`📡 Forecast: ${s.next} in ${Math.ceil(s.weatherTimer)}s`, r.x + 24, r.y + 114, { size: 14, color: '#bfe8ff' });
    const py = r.y + r.h - 70;
    ui.rect({ x: r.x + 10, y: py, w: 390, h: 60 }, 'rgba(0,0,0,0.45)', 8);
    ui.text(`Price $${s.price.toFixed(2)}`, r.x + 24, py + 30, { size: 20, bold: true, color: '#fff' });
    if (ui.button({ x: r.x + 170, y: py + 10, w: 60, h: 40 }, '−5¢', { size: 15 })) os.game.action(rt.id, 'priceDown');
    if (ui.button({ x: r.x + 240, y: py + 10, w: 60, h: 40 }, '+5¢', { size: 15 })) os.game.action(rt.id, 'priceUp');
    if (ui.button({ x: r.x + 310, y: py + 10, w: 80, h: 40 }, '💡 Use', { size: 14, disabled: Math.abs(s.price - suggested) < 0.001 }))
      os.game.action(rt.id, 'priceSuggested');
    if ((rt.upgrades.umbrella ?? 0) > 0 && (s.weather === 'rainy' || s.weather === 'cloudy')) ui.emoji('☂️', sx - 40, sy + 120, 48);
    if ((rt.upgrades.ice ?? 0) > 0) ui.emoji('🧊', sx + 250, sy + 130, 34);
    const big = { x: r.x + r.w - 230, y: r.y + r.h - 120, w: 210, h: 100 };
    if (ui.button(big, '🍋 SQUEEZE', { color: '#e0a800', size: 26 })) os.game.action(rt.id, 'squeeze');
    if (share < 15)
      ui.text('Too pricey for this weather! Try the suggested price.', r.x + r.w / 2, r.y + 150, { size: 17, bold: true, color: '#b00020', align: 'center' });
    else if (s.cups < 1 && s.missed > 1)
      ui.text('Customers are leaving thirsty! Squeeze!', r.x + r.w / 2, r.y + 110, {
        size: 18,
        bold: true,
        color: '#b00020',
        align: 'center',
      });
  },

  rubber_duck_works(ui, r, rt, os) {
    const s = rt.state as DuckState;
    const t = ui.time;
    ui.gradient(r, '#2d3142', '#4f5d75');
    const g = ui.g;
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    const by = r.y + r.h * 0.55;
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
      ui.emoji('🦆', x, by - 20 + wob, 46);
    }
    g.restore();
    ui.rect({ x: r.x + 20, y: by - 150, w: 140, h: 120 }, '#c9ada7', 6);
    ui.text('MOLD-O-MATIC', r.x + 90, by - 125, { size: 14, bold: true, color: '#22223b', align: 'center' });
    ui.text(`x${rt.upgrades.mold ?? 0}`, r.x + 90, by - 85, { size: 30, bold: true, color: '#22223b', align: 'center' });
    ui.rect({ x: r.x + 10, y: r.y + 10, w: 330, h: 70 }, 'rgba(0,0,0,0.45)', 8);
    ui.text(`Ducks made: ${formatNum(s.made)}`, r.x + 24, r.y + 32, { size: 18, bold: true, color: '#fff' });
    ui.text(`Price per duck: Q¢${duckPrice(rt.upgrades.quality ?? 0, rt.upgrades.inspector ?? 0, rt.upgrades.export ?? 0).toFixed(2)}`, r.x + 24, r.y + 60, { size: 15, color: '#fff' });
    if ((rt.upgrades.inspector ?? 0) > 0) ui.emoji('🕵️', r.x + 190, by - 40, 40);
    ui.text('Jam risk', r.x + 14, r.y + 102, { size: 13, color: '#fff' });
    ui.bar({ x: r.x + 80, y: r.y + 95, w: Math.min(250, r.w - 100), h: 14 }, s.jamMeter, '#ff6b35');
    if (s.jammed) {
      ui.rect({ x: r.x, y: r.y + r.h * 0.2, w: r.w, h: 90 }, 'rgba(200,0,0,0.75)', 0);
      ui.text('⚠ BELT JAMMED ⚠', r.x + r.w / 2, r.y + r.h * 0.2 + 45, { size: 40, bold: true, color: '#fff', align: 'center' });
      if (ui.button({ x: r.x + r.w / 2 - 120, y: r.y + r.h - 120, w: 240, h: 90 }, '🔧 UNJAM', { color: '#d62828', size: 28 }))
        os.game.action(rt.id, 'unjam');
    } else if (ui.button({ x: r.x + r.w - 230, y: r.y + r.h - 120, w: 210, h: 100 }, '🦆 SQUEAK', { color: '#e0a800', size: 26 }))
      os.game.action(rt.id, 'squeak');
  },

  sock_syndicate(ui, r, rt, os) {
    const s = rt.state as SockState;
    ui.gradient(r, '#3a1c71', '#d76d77');
    const cap = binCapacity(rt.upgrades.bin ?? 0);
    const total = s.bin.reduce((a, b) => a + b, 0);
    const bw = (r.w - 100) / 4;
    s.bin.forEach((count, i) => {
      const x = r.x + 20 + i * (bw + 20);
      const h = r.h * 0.45;
      const y = r.y + 110;
      ui.rect({ x, y, w: bw, h }, 'rgba(0,0,0,0.3)', 10);
      const fill = Math.min(h, (count / Math.max(1, cap / 4)) * h);
      ui.rect({ x, y: y + h - fill, w: bw, h: fill }, SOCK_COLORS[i]!, 10);
      ui.text(`🧦 ${count}`, x + bw / 2, y + h + 26, { size: 20, bold: true, color: '#fff', align: 'center' });
    });
    ui.rect({ x: r.x + 10, y: r.y + 10, w: r.w - 20, h: 80 }, 'rgba(0,0,0,0.4)', 8);
    ui.text(`Bin ${total}/${cap}`, r.x + 24, r.y + 34, { size: 18, bold: true, color: '#fff' });
    ui.bar({ x: r.x + 160, y: r.y + 26, w: r.w - 200, h: 16 }, total / cap, total / cap > 0.85 ? '#ff4d4d' : '#7cf07c');
    ui.text(`Pairs sold: ${formatNum(s.pairs)} · Lost socks: ${formatNum(s.lost)}${s.darned ? ` · Darned: ${formatNum(s.darned)}` : ''}`, r.x + 24, r.y + 66, { size: 15, color: '#fff' });
    if (ui.button({ x: r.x + 20, y: r.y + r.h - 100, w: 220, h: 80 }, `Sell ${formatNum(s.lost)} lost`, { size: 18, disabled: s.lost < 1 }))
      os.game.action(rt.id, 'sellLost');
    if (ui.button({ x: r.x + r.w - 240, y: r.y + r.h - 120, w: 220, h: 100 }, '🧦 MATCH', { color: '#8e44ad', size: 26 }))
      os.game.action(rt.id, 'match');
  },

  couch_coin_mining(ui, r, rt, os) {
    const s = rt.state as CouchState;
    const layers = ['#8d5a3b', '#7a4b31', '#6b3f28', '#5c3421', '#4d2a1a', '#3f2114'];
    const lh = r.h / 7;
    ui.rect({ x: r.x, y: r.y, w: r.w, h: lh }, '#b5651d', 0);
    ui.text('🛋️ THE COUCH', r.x + r.w / 2, r.y + lh / 2, { size: 26, bold: true, color: '#fff', align: 'center' });
    for (let i = 0; i < 6; i++) {
      const d = s.depth + i;
      ui.rect({ x: r.x, y: r.y + lh * (i + 1), w: r.w, h: lh }, layers[d % layers.length]!, 0);
      ui.text(`Layer ${d}`, r.x + 16, r.y + lh * (i + 1.5), { size: 14, color: 'rgba(255,255,255,0.6)' });
      if (i === 0) ui.bar({ x: r.x + 120, y: r.y + lh * 1.5 - 10, w: r.w - 160, h: 20 }, s.hp / s.maxHp, '#ffcf56');
    }
    ui.rect({ x: r.x + 10, y: r.y + r.h - 80, w: r.w - 260, h: 70 }, 'rgba(0,0,0,0.5)', 8);
    ui.text(`Depth ${s.depth} · ${formatNum(s.finds)} finds${s.rares ? ` · ✨${s.rares} rare` : ''}`, r.x + 24, r.y + r.h - 58, { size: 18, bold: true, color: '#fff' });
    ui.text(`Last find: ${s.lastFind}`, r.x + 24, r.y + r.h - 28, { size: 15, color: '#fff', maxWidth: r.w - 290 });
    if (ui.button({ x: r.x + r.w - 230, y: r.y + r.h - 120, w: 210, h: 100 }, '⛏️ DIG', { color: '#a0522d', size: 28 }))
      os.game.action(rt.id, 'dig');
  },
};
