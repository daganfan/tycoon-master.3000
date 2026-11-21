import { SKILL_NODES, nodeById } from '@/content/skilltree';
import type { Game } from '@/sim/game';
import type { SkillNodeDef } from '@/sim/types';
import { costLabel } from '@/os/apps/apps';

export const BRANCH_COLORS: Record<SkillNodeDef['branch'], string> = {
  root: '#ffffff', hustle: '#3ddc84', business: '#4a9dff', automation: '#22d3ee', hardware: '#94a3b8',
  chaos: '#ff8a3d', style: '#c77dff', legacy: '#ffd24a',
};

export interface TreeView {
  x: number;
  y: number;
  zoom: number;
}

const R = 26;

export function nodeAt(view: TreeView, w: number, h: number, mx: number, my: number): SkillNodeDef | undefined {
  const wx = (mx - w / 2) / view.zoom - view.x;
  const wy = (my - h / 2) / view.zoom - view.y;
  return SKILL_NODES.find((n) => Math.hypot(n.pos.x - wx, n.pos.y - wy) < (n.keystone ? R * 1.3 : R) + 4);
}

/** Draws the zoomable skill tree. Canvas-based so it stays fast at 150+ nodes. */
export function drawTree(g: CanvasRenderingContext2D, w: number, h: number, game: Game, view: TreeView, hover: SkillNodeDef | undefined, t: number): void {
  g.clearRect(0, 0, w, h);
  const bg = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h));
  bg.addColorStop(0, '#1b1530');
  bg.addColorStop(1, '#07060d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(view.zoom, view.zoom);
  g.translate(view.x, view.y);
  // Edges
  for (const n of SKILL_NODES) {
    const st = game.nodeState(n.id);
    if (st === 'hidden') continue;
    for (const rid of n.requires) {
      const p = nodeById(rid);
      if (!p || game.nodeState(rid) === 'hidden') continue;
      const lit = st === 'owned' && game.nodeState(rid) === 'owned';
      g.strokeStyle = lit ? BRANCH_COLORS[n.branch] : 'rgba(255,255,255,0.15)';
      g.lineWidth = lit ? 5 : 3;
      g.beginPath();
      g.moveTo(p.pos.x, p.pos.y);
      g.lineTo(n.pos.x, n.pos.y);
      g.stroke();
    }
  }
  // Nodes
  for (const n of SKILL_NODES) {
    const st = game.nodeState(n.id);
    const r = n.keystone ? R * 1.3 : R;
    const col = BRANCH_COLORS[n.branch];
    g.save();
    g.translate(n.pos.x, n.pos.y);
    if (st === 'hidden') {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.font = 'bold 22px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', 0, 1);
      g.restore();
      continue;
    }
    const affordable = st === 'available' && game.canBuyNode(n.id);
    if (st === 'owned' || affordable) {
      g.shadowColor = col;
      g.shadowBlur = st === 'owned' ? 18 : 10 + Math.sin(t * 4) * 6;
    }
    g.beginPath();
    if (n.keystone) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
    } else g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = st === 'owned' ? col : '#14121f';
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = n === hover ? 5 : 3;
    g.strokeStyle = st === 'locked' ? 'rgba(255,255,255,0.25)' : col;
    g.stroke();
    g.fillStyle = st === 'owned' ? '#111' : st === 'locked' ? 'rgba(255,255,255,0.35)' : '#fff';
    g.font = `bold ${n.keystone ? 16 : 13}px system-ui`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.id === 'root' ? '🎮' : n.keystone ? '★' : n.id.toUpperCase(), 0, 1);
    g.restore();
    if (view.zoom > 0.75) {
      g.fillStyle = st === 'locked' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)';
      g.font = '12px system-ui';
      g.textAlign = 'center';
      g.fillText(n.name, n.pos.x, n.pos.y + r + 14);
    }
  }
  g.restore();
  // Tooltip
  if (hover && game.nodeState(hover.id) !== 'hidden') {
    const st = game.nodeState(hover.id);
    const lines = [hover.desc, st === 'owned' ? '✔ Owned' : `Cost: ${costLabel(hover.cost)}`];
    if (st === 'locked') lines.push('Needs a connected node first');
    else if (st === 'available') lines.push(game.canBuyNode(hover.id) ? 'Click to unlock' : 'Not enough tokens');
    const tw = 340;
    const th = 40 + lines.length * 22;
    const x = w - tw - 20;
    const y = h - th - 20;
    g.fillStyle = 'rgba(10,8,20,0.92)';
    g.strokeStyle = BRANCH_COLORS[hover.branch];
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(x, y, tw, th, 10);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = 'bold 18px system-ui';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(`${hover.name}${hover.keystone ? '  ★ KEYSTONE' : ''}`, x + 14, y + 12);
    g.font = '14px system-ui';
    lines.forEach((l, i) => {
      g.fillStyle = i === 0 ? '#ddd' : '#aaa';
      g.fillText(l, x + 14, y + 42 + i * 22, tw - 28);
    });
  }
}
