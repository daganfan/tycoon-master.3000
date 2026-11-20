import type { Game } from '@/sim/game';
import { formatCash } from '@/core/num';
import { cosmeticById } from '@/content/cosmetics';
import { Ui, inset, type Rect } from './ui';
import { themeFor } from './theme';
import { builtinApps, tycoonApp } from './apps/apps';

export interface OsApp {
  id: string;
  title: string;
  icon: string;
  draw(ui: Ui, r: Rect, os: TycoonOS): void;
}

/** Things the OS asks the outside world to do. */
export interface OsHost {
  openSkillTree(): void;
  exportSave(): void;
  importSave(): void;
  resetSave(): void;
}

type Screen = 'off' | 'boot' | 'lock' | 'desktop';

const WALLPAPERS: [string, string][] = [
  ['', ''],
  ['#2b5876', '#4e4376'],
  ['#ff9966', '#ff5e62'],
  ['#134e5e', '#71b280'],
  ['#232526', '#414345'],
];

export class TycoonOS {
  readonly canvas: HTMLCanvasElement;
  readonly ui: Ui;
  screen: Screen = 'off';
  windows: string[] = [];
  private bootT = 0;
  private time = 0;
  private dt = 0;
  private toasts: { text: string; tone: string; t: number }[] = [];
  private rates = new Map<string, { last: number; rate: number }>();
  private rateT = 0;
  /** Set when anything visible changed; the world uploads the texture only then. */
  dirty = true;

  constructor(
    readonly game: Game,
    readonly host: OsHost,
    readonly width = 1280,
    readonly height = 800,
    readonly label = 'main',
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.ui = new Ui(g, themeFor(0));
    game.bus.on('notify', (n) => this.toast(n.text, n.tone));
    game.bus.on('token', (n) => this.toast(`+${n.amount} ${n.token} token · ${n.reason}`, 'token'));
    game.bus.on('levelUp', (n) => this.toast(`⭐ Level ${n.level}!`, 'good'));
  }

  get tier(): number {
    return Math.floor(this.game.stat('os.tier'));
  }

  maxWindows(): number {
    return this.tier + 1;
  }

  apps(): OsApp[] {
    const tycoons = Object.keys(this.game.state.tycoons).map((id) => tycoonApp(id));
    return [...tycoons, ...builtinApps];
  }

  boot(skip = false): void {
    if (this.screen !== 'off') return;
    this.screen = skip ? 'desktop' : 'boot';
    this.bootT = 0;
    this.game.setFlag('booted');
    this.dirty = true;
  }

  open(id: string): void {
    if (this.screen !== 'desktop') return;
    this.windows = this.windows.filter((w) => w !== id);
    this.windows.push(id);
    while (this.windows.length > this.maxWindows()) this.windows.shift();
    this.dirty = true;
  }

  close(id: string): void {
    this.windows = this.windows.filter((w) => w !== id);
    this.dirty = true;
  }

  /** The tycoon in the front-most window, if any (used for autoclick focus). */
  focusedTycoon(): string | null {
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const id = this.windows[i]!;
      if (this.game.state.tycoons[id]) return id;
    }
    return null;
  }

  toast(text: string, tone = 'info'): void {
    this.toasts.push({ text, tone, t: 4 });
    if (this.toasts.length > 4) this.toasts.shift();
    this.dirty = true;
  }

  rate(id: string): number {
    return this.rates.get(id)?.rate ?? 0;
  }

  /* ---- input (canvas pixel coordinates) ---- */
  pointerMove(x: number, y: number): void {
    this.ui.pointer(x, y);
    this.dirty = true;
  }
  click(x: number, y: number): void {
    this.ui.pushClick(x, y);
    this.dirty = true;
  }
  wheel(dy: number): void {
    this.ui.pushWheel(dy);
    this.dirty = true;
  }

  /* ---- frame ---- */
  update(dt: number): void {
    this.dt = dt;
    this.time += dt;
    this.rateT += dt;
    if (this.rateT >= 1) {
      for (const rt of Object.values(this.game.state.tycoons)) {
        const r = this.rates.get(rt.id);
        if (!r) this.rates.set(rt.id, { last: rt.lifetime, rate: 0 });
        else {
          const inst = (rt.lifetime - r.last) / this.rateT;
          r.rate = r.rate * 0.8 + inst * 0.2;
          r.last = rt.lifetime;
        }
      }
      this.rateT = 0;
    }
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    const skin = this.game.state.cosmetics.equipped.screen?.skin;
    this.ui.theme = themeFor(this.tier, skin ? cosmeticById(skin)?.visual.theme : undefined);
    this.draw();
  }

  private draw(): void {
    const ui = this.ui;
    const g = ui.g;
    ui.begin(this.time);
    g.clearRect(0, 0, this.width, this.height);
    const full = { x: 0, y: 0, w: this.width, h: this.height };
    if (this.screen === 'off') {
      ui.rect(full, '#050607', 0);
      ui.text('Press E (or click) to power on', this.width / 2, this.height / 2, { color: '#2a3a2a', size: 28, align: 'center' });
      if (ui.clicked(full)) this.boot();
    } else if (this.screen === 'boot') this.drawBoot(full);
    else if (this.screen === 'lock') this.drawLock(full);
    else this.drawDesktop(full);
    this.drawToasts();
    ui.end();
  }

  private drawBoot(full: Rect): void {
    const ui = this.ui;
    this.bootT += this.dt;
    ui.rect(full, '#000', 0);
    const cx = this.width / 2;
    ui.text('🪙', cx, 300, { size: 120, align: 'center' });
    ui.text(ui.theme.name, cx, 440, { size: 54, bold: true, color: '#fff', align: 'center' });
    ui.text('Starting up... please do not kick the PC', cx, 500, { size: 22, color: '#999', align: 'center' });
    ui.bar({ x: cx - 220, y: 560, w: 440, h: 18 }, this.bootT / 2.2, '#3d95ff', '#222');
    if (this.bootT > 2.2 || ui.clicked(full)) this.screen = 'lock';
    this.dirty = true;
  }

  private drawLock(full: Rect): void {
    const ui = this.ui;
    this.drawWallpaper(full);
    ui.rect(full, 'rgba(0,0,0,0.35)', 0);
    const d = new Date();
    ui.text(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), this.width / 2, 300, { size: 110, bold: true, color: '#fff', align: 'center' });
    ui.text('Broke Gamer', this.width / 2, 430, { size: 36, color: '#fff', align: 'center' });
    if (ui.button({ x: this.width / 2 - 140, y: 480, w: 280, h: 60 }, 'Log in ▶', { primary: true, size: 24 })) {
      this.screen = 'desktop';
      if (this.label === 'main' && this.windows.length === 0) this.open('lemon_mogul');
    }
    this.dirty = true;
  }

  private drawWallpaper(r: Rect): void {
    const wp = WALLPAPERS[this.game.state.settings.wallpaper % WALLPAPERS.length]!;
    const [a, b] = wp[0] ? wp : this.ui.theme.desktop;
    this.ui.gradient(r, a, b);
    this.ui.text('TYCOON MASTER 3000', r.x + r.w - 24, r.y + r.h - 90, { size: 34, bold: true, color: 'rgba(255,255,255,0.18)', align: 'right' });
  }

  private drawDesktop(full: Rect): void {
    const ui = this.ui;
    const taskH = 52;
    const desk = { x: 0, y: 0, w: this.width, h: this.height - taskH };
    this.drawWallpaper(desk);
    // Icons
    const apps = this.apps();
    const iconW = 112;
    const iconH = 104;
    const perCol = Math.floor((desk.h - 16) / iconH);
    apps.forEach((app, i) => {
      const r = { x: 12 + Math.floor(i / perCol) * iconW, y: 12 + (i % perCol) * iconH, w: iconW - 8, h: iconH - 8 };
      if (ui.inside(r)) ui.rect(r, 'rgba(255,255,255,0.18)', 6);
      ui.emoji(app.icon, r.x + r.w / 2, r.y + 36, 44);
      ui.text(app.title, r.x + r.w / 2, r.y + 80, { size: 14, color: '#fff', bold: true, align: 'center', maxWidth: r.w });
      if (ui.clicked(r)) this.open(app.id);
    });
    // Windows (tiled)
    const area = { x: 250, y: 12, w: this.width - 262, h: desk.h - 24 };
    const n = this.windows.length;
    const gap = 12;
    const ww = n > 0 ? (area.w - gap * (n - 1)) / n : 0;
    this.windows.forEach((id, i) => {
      const app = apps.find((a) => a.id === id);
      if (!app) return;
      this.drawWindow(app, { x: area.x + i * (ww + gap), y: area.y, w: ww, h: area.h });
    });
    if (n === 0) {
      ui.panel({ x: area.x + area.w / 2 - 260, y: area.y + area.h / 2 - 70, w: 520, h: 140 }, 'rgba(0,0,0,0.35)', false);
      ui.text('Click an app to start earning.', area.x + area.w / 2, area.y + area.h / 2 - 20, { size: 24, color: '#fff', bold: true, align: 'center' });
      const q = this.game.activeQuest();
      if (q) ui.text(`📝 ${q.text}`, area.x + area.w / 2, area.y + area.h / 2 + 24, { size: 16, color: '#fff', align: 'center', maxWidth: 500 });
    }
    // Taskbar
    const tb = { x: 0, y: this.height - taskH, w: this.width, h: taskH };
    ui.rect(tb, ui.theme.taskbar, 0);
    ui.bevel(tb);
    if (ui.button({ x: 6, y: tb.y + 6, w: 110, h: taskH - 12 }, '🪙 Start', { primary: ui.theme.bevel ? false : true, size: 17 })) {
      this.windows = [];
    }
    this.windows.forEach((id, i) => {
      const app = apps.find((a) => a.id === id);
      if (!app) return;
      ui.button({ x: 126 + i * 190, y: tb.y + 6, w: 180, h: taskH - 12 }, `${app.icon} ${app.title}`, { size: 14 });
    });
    const s = this.game.state;
    ui.text(`${formatCash(s.cash)}`, this.width - 190, tb.y + taskH / 2, { size: 18, bold: true, color: ui.theme.bevel ? '#111' : '#fff', align: 'right' });
    ui.text(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), this.width - 16, tb.y + taskH / 2, {
      size: 16, color: ui.theme.bevel ? '#111' : '#fff', align: 'right',
    });
    void full;
  }

  private drawWindow(app: OsApp, r: Rect): void {
    const ui = this.ui;
    const t = ui.theme;
    ui.rect(r, t.window);
    ui.bevel(r);
    const title = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: 38 };
    const gr = ui.g.createLinearGradient(title.x, 0, title.x + title.w, 0);
    gr.addColorStop(0, t.titlebar[0]);
    gr.addColorStop(1, t.titlebar[1]);
    ui.g.fillStyle = gr;
    if (t.radius) {
      ui.g.beginPath();
      ui.g.roundRect(title.x, title.y, title.w, title.h, [t.radius, t.radius, 0, 0]);
      ui.g.fill();
    } else ui.g.fillRect(title.x, title.y, title.w, title.h);
    ui.emoji(app.icon, title.x + 22, title.y + title.h / 2, 22);
    ui.text(app.title, title.x + 42, title.y + title.h / 2, { size: 18, bold: true, color: t.titleText });
    if (ui.button({ x: title.x + title.w - 36, y: title.y + 5, w: 30, h: 28 }, '✕', { size: 15, color: t.bevel ? undefined : '#d9412b' })) {
      this.close(app.id);
      return;
    }
    app.draw(ui, inset({ x: r.x, y: title.y + title.h, w: r.w, h: r.h - title.h - 3 }, 10), this);
  }

  private drawToasts(): void {
    const ui = this.ui;
    this.toasts.forEach((t, i) => {
      const w = 440;
      const r = { x: this.width - w - 16, y: 16 + i * 62, w, h: 54 };
      ui.g.globalAlpha = Math.min(1, t.t * 2);
      const col = t.tone === 'good' ? '#1f7a35' : t.tone === 'warn' ? '#a3561a' : t.tone === 'token' ? '#5b2a99' : '#1c2a44';
      ui.rect(r, col, 8);
      ui.text(t.text, r.x + 16, r.y + r.h / 2, { size: 17, bold: true, color: '#fff', maxWidth: w - 32 });
      ui.g.globalAlpha = 1;
    });
    if (this.toasts.length) this.dirty = true;
  }
}
