import { ACHIEVEMENTS } from '@/content/achievements';
import type { OsApp } from '../os';

const TOKEN_ICON: Record<string, string> = { grind: '🟢', mogul: '🔵', chaos: '🟠', pixel: '🟣', golden: '🟡' };
let scroll = 0;

/** Trophies: every achievement, locked ones greyed out, secret ones hidden until unlocked. */
export const trophies: OsApp = {
  id: 'trophies',
  title: 'Trophies',
  icon: '🏆',
  draw(ui, r, os) {
    const got = new Set(os.game.state.achievements);
    const done = ACHIEVEMENTS.filter((a) => got.has(a.id)).length;
    ui.text(`🏆 ${done} / ${ACHIEVEMENTS.length} unlocked`, r.x, r.y + 16, { size: 18, bold: true });
    ui.bar({ x: r.x + r.w * 0.45, y: r.y + 8, w: r.w * 0.55, h: 14 }, done / ACHIEVEMENTS.length, '#f5b301');
    const list = { x: r.x, y: r.y + 38, w: r.w, h: r.h - 38 };
    // Unlocked first, then visible goals, then secrets.
    const rows = [...ACHIEVEMENTS].sort((a, b) => Number(got.has(b.id)) - Number(got.has(a.id)) || Number(!!a.secret) - Number(!!b.secret));
    const cols = list.w > 620 ? 2 : 1;
    const rowH = 66;
    const lines = Math.ceil(rows.length / cols);
    const max = Math.max(0, lines * rowH - list.h);
    scroll = Math.min(max, Math.max(0, scroll + ui.takeWheel(list) * 0.6));
    const g = ui.g;
    g.save();
    g.beginPath();
    g.rect(list.x, list.y, list.w, list.h);
    g.clip();
    const cw = (list.w - (cols - 1) * 8 - (max > 0 ? 10 : 0)) / cols;
    rows.forEach((a, i) => {
      const x = list.x + (i % cols) * (cw + 8);
      const y = list.y + Math.floor(i / cols) * rowH - scroll;
      if (y + rowH < list.y || y > list.y + list.h) return;
      const on = got.has(a.id);
      const hidden = a.secret && !on;
      const rr = { x, y, w: cw, h: rowH - 6 };
      ui.rect(rr, on ? 'rgba(245,179,1,0.22)' : 'rgba(0,0,0,0.06)', 6);
      if (!on) g.globalAlpha = 0.5;
      ui.emoji(hidden ? '❔' : a.icon, rr.x + 28, rr.y + rr.h / 2, 28);
      ui.text(hidden ? 'Secret trophy' : a.name, rr.x + 56, rr.y + 20, { size: 15, bold: true, maxWidth: rr.w - 120 });
      ui.text(hidden ? 'Keep messing around to find it…' : a.desc, rr.x + 56, rr.y + 42, { size: 12, color: ui.theme.muted, maxWidth: rr.w - 120 });
      ui.text(`${on ? '✅ ' : ''}${TOKEN_ICON[a.reward.token]}${a.reward.amount}`, rr.x + rr.w - 10, rr.y + rr.h / 2, { size: 14, bold: true, align: 'right' });
      g.globalAlpha = 1;
    });
    g.restore();
  },
};
