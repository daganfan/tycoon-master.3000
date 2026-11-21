import { formatNum } from '@/core/num';
import type { TycoonRuntime } from '@/sim/types';
import {
  GRID_H, GRID_W, ROADS, ROAD_INFO, bestTiles, dogPrice, maxCarts, traffic, type HotDogState, type RoadKind,
} from '@/sim/tycoons/hotDogHighway';
import { bayCount, carPrice, lotSize, washTime, REBEL_GIVE_UP, type CarWashState } from '@/sim/tycoons/roboCarWash';
import type { TycoonOS } from '../os';
import type { Rect, Ui } from '../ui';

type View = (ui: Ui, r: Rect, rt: TycoonRuntime, os: TycoonOS) => void;

const ROAD_ICON: Record<RoadKind, string> = { highway: '🛣️', downtown: '🏙️', suburb: '🏡', stadium: '🏟️', school: '🏫', park: '🌳' };
const ROAD_COL: Record<RoadKind, string> = { highway: '#3b3f46', downtown: '#4a4458', suburb: '#4d5a3f', stadium: '#5a3f3f', school: '#5a523b', park: '#3f5a4a' };

const clock = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

/** Sky colour for the time of day (night → dawn → day → dusk). */
function sky(h: number): [string, string] {
  if (h < 5 || h >= 21) return ['#0b1030', '#1d2550'];
  if (h < 7) return ['#ff9a6b', '#5b6fb0'];
  if (h < 18) return ['#5ec8ff', '#c2ecff'];
  return ['#ff7a45', '#6d4fa0'];
}

/** Garage-phase mini-tycoon views (registered into VIEWS). */
export const GARAGE_VIEWS: Record<string, View> = {
  hot_dog_highway(ui, r, rt, os) {
    const s = rt.state as HotDogState;
    const [a, b] = sky(s.hour);
    ui.gradient(r, a, b);
    const g = ui.g;
    const top = 64;
    const bottom = 128;
    const gw = r.w - 20;
    const gh = r.h - top - bottom;
    const cw = gw / GRID_W;
    const ch = gh / GRID_H;
    const best = new Set(bestTiles(s.hour, maxCarts(rt.upgrades)));
    const maxHeat = Math.max(0.01, ...s.heat);
    ROADS.forEach((kind, i) => {
      const cx = r.x + 10 + (i % GRID_W) * cw;
      const cy = r.y + top + Math.floor(i / GRID_W) * ch;
      const cell = { x: cx + 3, y: cy + 3, w: cw - 6, h: ch - 6 };
      ui.rect(cell, ROAD_COL[kind], 8);
      // Busy-ness glow.
      const tr = traffic(kind, s.hour);
      g.globalAlpha = Math.min(0.55, tr / 6);
      ui.rect(cell, '#ffcf3a', 8);
      g.globalAlpha = 1;
      // Road stripe with little cars driving along it.
      const ry = cell.y + cell.h * 0.62;
      ui.rect({ x: cell.x, y: ry - 9, w: cell.w, h: 18 }, '#222', 0);
      g.save();
      g.beginPath();
      g.rect(cell.x, ry - 14, cell.w, 28);
      g.clip();
      const cars = Math.min(6, Math.round(tr * 1.6));
      for (let k = 0; k < cars; k++) {
        const x = cell.x + ((k * cell.w) / Math.max(1, cars) + ui.time * (30 + 12 * tr) + i * 37) % (cell.w + 30) - 15;
        ui.emoji(k % 3 ? '🚗' : '🚙', x, ry, 18);
      }
      g.restore();
      ui.emoji(ROAD_ICON[kind], cell.x + 22, cell.y + 22, 24);
      ui.text(ROAD_INFO[kind].label, cell.x + 40, cell.y + 22, { size: 13, bold: true, color: '#fff', maxWidth: cell.w - 46 - 24 });
      ui.text(`${tr.toFixed(1)} cars/s`, cell.x + 8, cell.y + cell.h - 12, { size: 11, color: 'rgba(255,255,255,0.8)', maxWidth: cell.w - 70 });
      if (best.has(i)) ui.text('★', cell.x + cell.w - 14, cell.y + 20, { size: 18, bold: true, color: '#ffe066', align: 'center' });
      if (s.carts.includes(i)) {
        const bounce = Math.sin(ui.time * 6 + i) * 3;
        ui.emoji('🌭', cell.x + cell.w / 2, cell.y + cell.h * 0.38 + bounce, 30);
        const heat = (s.heat[i] ?? 0) / maxHeat;
        ui.bar({ x: cell.x + cell.w - 56, y: cell.y + cell.h - 18, w: 48, h: 8 }, heat, '#ff8a3a');
      }
      if (ui.clicked(cell)) os.game.action(rt.id, 'place', i);
    });
    // Header: clock, stock, price.
    ui.rect({ x: r.x + 10, y: r.y + 8, w: r.w - 20, h: 48 }, 'rgba(0,0,0,0.45)', 8);
    ui.text(`🕒 ${clock(s.hour)}`, r.x + 22, r.y + 32, { size: 20, bold: true, color: '#fff' });
    ui.text(`🌭 ${formatNum(s.stock)} ready · H$${dogPrice(rt.upgrades).toFixed(2)} each · carts ${s.carts.length}/${maxCarts(rt.upgrades)}`, r.x + 130, r.y + 32, {
      size: 14, color: '#fff', maxWidth: r.w - 150,
    });
    const by = r.y + r.h - bottom + 8;
    ui.text('Click a road to park / remove a cart. ★ = busiest right now.', r.x + 14, by + 12, { size: 13, color: '#fff', maxWidth: r.w - 250 });
    ui.text(`Sold ${formatNum(s.sold)} · Missed ${formatNum(s.missed)}`, r.x + 14, by + 36, { size: 13, color: '#ffe0b0' });
    if (ui.button({ x: r.x + 14, y: by + 54, w: 170, h: 52 }, '📻 Smart park', { size: 15, disabled: (rt.upgrades.radio ?? 0) > 0 })) os.game.action(rt.id, 'smart');
    if (s.stock < 1 && s.missed > 2) ui.text('Out of hot dogs! GRILL!', r.x + 200, by + 80, { size: 16, bold: true, color: '#ff4d4d' });
    if (ui.button({ x: r.x + r.w - 220, y: r.y + r.h - 112, w: 200, h: 96 }, '🔥 GRILL', { color: '#d9480f', size: 26 })) os.game.action(rt.id, 'grill');
  },

  robo_car_wash(ui, r, rt, os) {
    const s = rt.state as CarWashState;
    const up = rt.upgrades;
    ui.gradient(r, '#0f3d5c', '#1b6d8f');
    const g = ui.g;
    // Bubbles.
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 18; i++) {
      const x = r.x + ((i * 97) % r.w);
      const y = r.y + r.h - ((ui.time * 30 + i * 53) % r.h);
      g.beginPath();
      g.arc(x, y, 4 + (i % 4) * 3, 0, Math.PI * 2);
      g.fill();
    }
    ui.rect({ x: r.x + 10, y: r.y + 8, w: r.w - 20, h: 48 }, 'rgba(0,0,0,0.4)', 8);
    ui.text(`🧽 Washed ${formatNum(s.washed)} · Drove off ${formatNum(s.lost)} · W$${formatNum(carPrice(up))}/car · ${washTime(up).toFixed(1)} s/wash`, r.x + 22, r.y + 32, {
      size: 14, color: '#fff', maxWidth: r.w - 40,
    });
    // Parking lot (queue).
    const lot = { x: r.x + 10, y: r.y + 66, w: 150, h: r.h - 196 };
    ui.rect(lot, 'rgba(0,0,0,0.3)', 8);
    ui.text(`Lot ${Math.floor(s.queue)}/${lotSize(up)}`, lot.x + lot.w / 2, lot.y + 16, { size: 14, bold: true, color: '#fff', align: 'center' });
    const q = Math.min(18, Math.floor(s.queue));
    for (let i = 0; i < q; i++) ui.emoji(['🚗', '🚙', '🚕', '🛻'][i % 4]!, lot.x + 30 + (i % 3) * 44, lot.y + 46 + Math.floor(i / 3) * 34, 26);
    if (s.queue >= lotSize(up)) ui.text('FULL!', lot.x + lot.w / 2, lot.y + lot.h - 14, { size: 15, bold: true, color: '#ff6b6b', align: 'center' });
    // Bays.
    const n = bayCount(up);
    const bx = lot.x + lot.w + 10;
    const bw = (r.x + r.w - 10 - bx) / n;
    const bh = lot.h;
    let rebels = 0;
    s.bays.slice(0, n).forEach((b, i) => {
      const x = bx + i * bw;
      const cell = { x: x + 3, y: lot.y, w: bw - 6, h: bh };
      const rebel = b.rebel >= 0;
      if (rebel) rebels++;
      ui.rect(cell, rebel ? 'rgba(200,30,30,0.55)' : 'rgba(255,255,255,0.12)', 8);
      const shake = rebel ? Math.sin(ui.time * 30 + i) * 4 : 0;
      ui.emoji('🤖', cell.x + cell.w / 2 + shake, cell.y + 34, Math.min(40, cell.w * 0.5));
      if (b.busy && !rebel) {
        const wob = Math.sin(ui.time * 10 + i) * 2;
        ui.emoji('🚗', cell.x + cell.w / 2, cell.y + cell.h * 0.55 + wob, Math.min(42, cell.w * 0.55));
        ui.emoji('🫧', cell.x + cell.w / 2 + Math.sin(ui.time * 4 + i) * 12, cell.y + cell.h * 0.4, 18);
        ui.bar({ x: cell.x + 8, y: cell.y + cell.h - 22, w: cell.w - 16, h: 10 }, b.progress / washTime(up), '#7cf0ff');
      } else if (!rebel) ui.text('idle', cell.x + cell.w / 2, cell.y + cell.h * 0.55, { size: 13, color: 'rgba(255,255,255,0.6)', align: 'center' });
      if (rebel) {
        ui.text('ROBOT', cell.x + cell.w / 2, cell.y + cell.h * 0.48, { size: 12, bold: true, color: '#fff', align: 'center', maxWidth: cell.w - 6 });
        ui.text(b.demand, cell.x + cell.w / 2, cell.y + cell.h * 0.48 + 18, { size: 11, bold: true, color: '#ffe066', align: 'center', maxWidth: cell.w - 6 });
        ui.bar({ x: cell.x + 8, y: cell.y + cell.h - 22, w: cell.w - 16, h: 8 }, 1 - b.rebel / REBEL_GIVE_UP, '#ff6b6b');
      }
    });
    const py = r.y + r.h - 120;
    if (rebels > 0) {
      if (ui.button({ x: r.x + 14, y: py, w: 230, h: 100 }, `🔌 REBOOT (${rebels})`, { color: '#c92a2a', size: 22 })) os.game.action(rt.id, 'reboot');
    } else ui.text('Robots: content (for now).', r.x + 20, py + 50, { size: 14, color: '#c8f7ff' });
    if (ui.button({ x: r.x + r.w - 220, y: py + 8, w: 200, h: 96 }, '🧽 SCRUB', { color: '#1c7ed6', size: 26 })) os.game.action(rt.id, 'scrub');
  },
};
