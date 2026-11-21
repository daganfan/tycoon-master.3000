import { netActions, netInfo } from '@/net/state';
import type { OsApp, TycoonOS } from '../os';

/**
 * NetPlay: the in-game PC's view of multiplayer (same info as the 👥 HUD panel).
 * Visitors using the host's screens get a read-only view — they can't close the
 * host's room or kick people from the host's computer.
 */

const visitor = (os: TycoonOS): boolean => (os.host as { visitor?: boolean }).visitor === true;

export const netplay: OsApp = {
  id: 'netplay',
  title: 'NetPlay',
  icon: '🌐',
  draw(ui, r, os) {
    const n = netInfo;
    const ro = visitor(os) || n.mode === 'guest' || n.mode === 'lost';
    let y = r.y + 18;
    const title =
      n.mode === 'hosting'
        ? 'Room is OPEN'
        : n.mode === 'guest' || ro
          ? 'Visiting a friend'
          : n.mode === 'off'
            ? 'Offline'
            : n.mode;
    ui.text(`🌐 ${title}`, r.x, y, { size: 22, bold: true });
    y += 34;
    if (n.mode === 'off' && !ro) {
      ui.text('Invite friends into this room: they just open a link.', r.x, y, {
        size: 14,
        color: ui.theme.muted,
        maxWidth: r.w,
      });
      y += 26;
      if (
        ui.button({ x: r.x, y, w: Math.min(260, r.w), h: 48 }, '🏠 Host a room', { primary: true, size: 18 })
      )
        void netActions.startHosting();
      y += 64;
      ui.text('Or use the 👥 Multiplayer button to join a friend.', r.x, y, {
        size: 13,
        color: ui.theme.muted,
        maxWidth: r.w,
      });
      return;
    }
    if (n.code) {
      ui.text(`Code: ${n.code}`, r.x, y, { size: 28, bold: true, color: '#f6a623' });
      y += 30;
      ui.text(n.link, r.x, y, { size: 12, color: ui.theme.muted, maxWidth: r.w });
      y += 22;
    }
    if (n.mode === 'hosting' && !ro) {
      const bw = Math.min(180, (r.w - 8) / 2);
      if (ui.button({ x: r.x, y, w: bw, h: 38 }, '📋 Copy invite', { size: 14 }))
        void navigator.clipboard?.writeText(n.link).catch(() => {});
      if (
        ui.button({ x: r.x + bw + 8, y, w: bw, h: 38 }, n.control ? '🔓 Guests: play' : '🔒 Guests: watch', {
          size: 14,
        })
      )
        netActions.setControl(!n.control);
      y += 50;
    }
    ui.text(`Players ${n.players.length}/8`, r.x, y, { size: 17, bold: true });
    y += 26;
    for (const p of n.players) {
      if (y > r.y + r.h - 70) break;
      ui.rect({ x: r.x, y, w: r.w, h: 40 }, 'rgba(0,0,0,0.06)', 6);
      ui.rect({ x: r.x + 8, y: y + 12, w: 16, h: 16 }, p.color, 8);
      ui.text(`${p.name}${p.host ? ' 👑' : ''}`, r.x + 34, y + 20, {
        size: 15,
        bold: true,
        maxWidth: r.w - 200,
      });
      ui.text(
        p.host ? 'host' : `${p.ping} ms${p.helped ? ` · 🪙${p.helped}` : ''}`,
        r.x + r.w - (n.mode === 'hosting' && !ro && !p.host ? 80 : 10),
        y + 20,
        {
          size: 13,
          color: ui.theme.muted,
          align: 'right',
        },
      );
      if (
        n.mode === 'hosting' &&
        !ro &&
        !p.host &&
        ui.button({ x: r.x + r.w - 70, y: y + 5, w: 64, h: 30 }, 'Kick', { size: 12 })
      )
        netActions.kick(p.id);
      y += 46;
    }
    if (
      n.mode === 'hosting' &&
      !ro &&
      ui.button({ x: r.x, y: r.y + r.h - 44, w: Math.min(220, r.w), h: 40 }, 'Close room', {
        size: 14,
        color: '#8a1c1c',
      })
    )
      netActions.stopHosting();
  },
};
