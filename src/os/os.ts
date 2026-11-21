import type { Game } from '@/sim/game';
import { formatCash } from '@/core/num';
import { cosmeticById } from '@/content/cosmetics';
import { screenName } from '@/sim/desk';
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

/** Smallest logical height the OS lays out for; very wide screens get a wider logical canvas instead. */
export const MIN_LOGICAL_H = 576;
export const TASKBAR_H = 48;
const TITLE_H = 34;

/** Logical (layout) size for a physical canvas: 1280 wide on the main PC, 1024 on smaller screens. */
export function logicalSize(width: number, height: number, label: string): { w: number; h: number } {
  let w = label === 'main' ? 1280 : 1024;
  let h = Math.round((w * height) / width);
  if (h < MIN_LOGICAL_H) {
    h = MIN_LOGICAL_H;
    w = Math.round((h * width) / height);
  }
  return { w, h };
}

interface CapacityDialog {
  app: string;
  pauses: string[];
  /** Another screen with a free window, if any. */
  elsewhere: string | null;
}

/**
 * TycoonOS: a fake desktop OS drawn into a canvas. Layout happens in a fixed
 * LOGICAL resolution (`vw` × `vh`, see logicalSize) and is scaled to the
 * physical canvas, so every screen in the room gets the same usable layout.
 *
 * Windows live in the game state (Game.windowsOn) when the OS has a
 * `screenId`, because what is open on which screen decides which games run.
 */
export class TycoonOS {
  readonly canvas: HTMLCanvasElement;
  readonly ui: Ui;
  /** Logical layout size. */
  readonly vw: number;
  readonly vh: number;
  /** Physical pixels per logical pixel. */
  readonly scale: number;
  screen: Screen = 'off';
  private localWindows: string[] = [];
  private bootT = 0;
  private time = 0;
  private dt = 0;
  private toasts: { text: string; tone: string; t: number }[] = [];
  private rates = new Map<string, { last: number; rate: number }>();
  private rateT = 0;
  private startOpen = false;
  private dialog: CapacityDialog | null = null;
  /** Set when anything visible changed; the world uploads the texture only then. */
  dirty = true;

  constructor(
    readonly game: Game,
    readonly host: OsHost,
    readonly width = 1280,
    readonly height = 800,
    readonly label = 'main',
    /** Which screen of the game's desk this OS shows (null = private windows, nothing runs from here). */
    readonly screenId: string | null = label === 'main' ? 'main' : null,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    const size = logicalSize(width, height, label);
    this.vw = size.w;
    this.vh = size.h;
    this.scale = width / size.w;
    this.ui = new Ui(g, themeFor(0));
    game.bus.on('notify', (n) => this.toast(n.text, n.tone));
    game.bus.on('token', (n) => this.toast(`+${n.amount} ${n.token} token · ${n.reason}`, 'token'));
    game.bus.on('levelUp', (n) => this.toast(`⭐ Level ${n.level}!`, 'good'));
  }

  get tier(): number {
    return Math.floor(this.game.stat('os.tier'));
  }

  /** Open windows on this screen, oldest first. */
  get windows(): string[] {
    return this.screenId ? this.game.windowsOn(this.screenId) : this.localWindows;
  }

  set windows(w: string[]) {
    if (this.screenId) this.game.state.desk.screens[this.screenId] = [...w];
    else this.localWindows = [...w];
    this.dirty = true;
  }

  maxWindows(): number {
    return this.game.windowsPerScreen();
  }

  /** Friendly name of this screen ("Main PC", "Monitor 2", …). */
  get name(): string {
    return this.screenId ? screenName(this.screenId) : 'Screen';
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

  /** Open an app in a window here (pushes the oldest window out when full). */
  open(id: string): void {
    if (this.screen !== 'desktop') return;
    if (this.screenId) this.game.openApp(this.screenId, id);
    else {
      this.localWindows = this.localWindows.filter((w) => w !== id);
      this.localWindows.push(id);
      while (this.localWindows.length > this.maxWindows()) this.localWindows.shift();
    }
    this.dirty = true;
  }

  /**
   * What the player clicked to open something. Games that would pause another
   * game ask first (capacity dialog); other apps just open and say what paused.
   */
  launch(id: string): void {
    if (this.screen !== 'desktop') return;
    this.startOpen = false;
    if (!this.screenId) return this.open(id);
    const plan = this.game.planOpen(this.screenId, id);
    if (plan.pauses.length && this.game.isTycoon(id)) {
      const free = this.game.freeScreen();
      this.dialog = { app: id, pauses: plan.pauses, elsewhere: free && free !== this.screenId ? free : null };
      this.dirty = true;
      return;
    }
    this.open(id);
    if (plan.pauses.length) this.toast(`Close ${this.appTitle(id)} to bring the game back.`, 'info');
  }

  close(id: string): void {
    if (this.screenId) this.game.closeApp(this.screenId, id);
    else this.localWindows = this.localWindows.filter((w) => w !== id);
    this.dirty = true;
  }

  minimize(id: string): void {
    if (this.screenId) this.game.minimizeApp(this.screenId, id);
    else this.localWindows = this.localWindows.filter((w) => w !== id);
    this.dirty = true;
  }

  /** The tycoon in the front-most window, if any (used for autoclick focus). */
  focusedTycoon(): string | null {
    const w = this.windows;
    for (let i = w.length - 1; i >= 0; i--) {
      const id = w[i]!;
      if (this.game.state.tycoons[id]) return id;
    }
    return null;
  }

  appTitle(id: string): string {
    return this.apps().find((a) => a.id === id)?.title ?? id;
  }

  toast(text: string, tone = 'info'): void {
    this.toasts.push({ text, tone, t: 4 });
    if (this.toasts.length > 4) this.toasts.shift();
    this.dirty = true;
  }

  rate(id: string): number {
    return this.rates.get(id)?.rate ?? 0;
  }

  /* ---- input (physical canvas pixel coordinates) ---- */
  pointerMove(x: number, y: number): void {
    this.ui.pointer(x / this.scale, y / this.scale);
    this.dirty = true;
  }
  click(x: number, y: number): void {
    this.ui.pushClick(x / this.scale, y / this.scale);
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
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.width, this.height);
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const full = { x: 0, y: 0, w: this.vw, h: this.vh };
    ui.pushBounds(full, 'screen');
    if (this.screen === 'off') {
      ui.rect(full, '#050607', 0);
      ui.text('Press E (or click) to power on', this.vw / 2, this.vh / 2, { size: 28, color: '#2a3a2a', align: 'center' });
      if (ui.clicked(full)) this.boot();
    } else if (this.screen === 'boot') this.drawBoot(full);
    else if (this.screen === 'lock') this.drawLock(full);
    else this.drawDesktop(full);
    this.drawToasts();
    ui.popBounds();
    ui.end();
  }

  private drawBoot(full: Rect): void {
    const ui = this.ui;
    this.bootT += this.dt;
    ui.rect(full, '#000', 0);
    const cx = this.vw / 2;
    ui.text('🪙', cx, 300, { size: 120, align: 'center' });
    ui.text(ui.theme.name, cx, 440, { size: 54, bold: true, color: '#fff', align: 'center' });
    ui.text('Starting up... please do not kick the PC', cx, 500, { size: 22, color: '#999', align: 'center' });
    ui.bar({ x: cx - 220, y: 540, w: 440, h: 18 }, this.bootT / 2.2, '#3d95ff', '#222');
    if (this.bootT > 2.2 || ui.clicked(full)) this.screen = 'lock';
    this.dirty = true;
  }

  private drawLock(full: Rect): void {
    const ui = this.ui;
    this.drawWallpaper(full);
    ui.rect(full, 'rgba(0,0,0,0.35)', 0);
    const d = new Date();
    ui.text(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), this.vw / 2, 300, { size: 110, bold: true, color: '#fff', align: 'center' });
    ui.text('Broke Gamer', this.vw / 2, 430, { size: 36, color: '#fff', align: 'center' });
    if (ui.button({ x: this.vw / 2 - 140, y: 480, w: 280, h: 60 }, 'Log in ▶', { primary: true, size: 24 })) {
      this.screen = 'desktop';
      if (this.screenId === 'main' && this.windows.length === 0 && !this.game.isRunning('lemon_mogul')) this.open('lemon_mogul');
    }
    this.dirty = true;
  }

  private drawWallpaper(r: Rect): void {
    const wp = WALLPAPERS[this.game.state.settings.wallpaper % WALLPAPERS.length]!;
    const [a, b] = wp[0] ? wp : this.ui.theme.desktop;
    this.ui.gradient(r, a, b);
    this.ui.text('TYCOON MASTER 3000', r.x + r.w - 24, r.y + r.h - 40, { size: 30, bold: true, color: 'rgba(255,255,255,0.18)', align: 'right' });
  }

  private drawDesktop(full: Rect): void {
    const ui = this.ui;
    const modal = this.startOpen || this.dialog !== null;
    // While a menu or dialog is open, the desktop underneath ignores input.
    const stash = modal ? ui.suspendInput() : null;
    const desk = { x: 0, y: 0, w: this.vw, h: this.vh - TASKBAR_H };
    this.drawWallpaper(desk);
    const apps = this.apps();
    const wins = this.windows.map((id) => apps.find((a) => a.id === id)).filter((a): a is OsApp => !!a);
    if (wins.length === 0) this.drawIcons(desk, apps);
    else {
      const area = inset(desk, 8);
      const gap = 8;
      const ww = (area.w - gap * (wins.length - 1)) / wins.length;
      wins.forEach((app, i) => this.drawWindow(app, { x: area.x + i * (ww + gap), y: area.y, w: ww, h: area.h }));
    }
    this.drawTaskbar(apps);
    if (stash) ui.resumeInput(stash);
    if (this.startOpen) this.drawStartMenu(full, apps);
    if (this.dialog) this.drawDialog(full, this.dialog);
  }

  private drawIcons(desk: Rect, apps: OsApp[]): void {
    const ui = this.ui;
    const iconW = 104;
    const iconH = 96;
    const perCol = Math.max(1, Math.floor((desk.h - 16) / iconH));
    const cols = Math.ceil(apps.length / perCol);
    apps.forEach((app, i) => {
      const r = { x: 10 + Math.floor(i / perCol) * iconW, y: 10 + (i % perCol) * iconH, w: iconW - 8, h: iconH - 8 };
      if (ui.inside(r)) ui.rect(r, 'rgba(255,255,255,0.18)', 6);
      ui.emoji(app.icon, r.x + r.w / 2, r.y + 32, 40);
      const running = this.game.isRunning(app.id);
      ui.text(`${running ? '▶ ' : ''}${app.title}`, r.x + r.w / 2, r.y + 74, { size: 13, color: '#fff', bold: true, align: 'center', maxWidth: r.w });
      if (ui.clicked(r)) this.launch(app.id);
    });
    // Hint panel next to the icons.
    const left = 10 + cols * iconW + 10;
    const pw = Math.min(520, desk.w - left - 16);
    if (pw < 200) return;
    const p = { x: left + (desk.w - left - pw) / 2, y: desk.h / 2 - 80, w: pw, h: 160 };
    ui.panel(p, 'rgba(0,0,0,0.4)', false);
    ui.text('Open a game to start earning.', p.x + p.w / 2, p.y + 30, { size: 22, color: '#fff', bold: true, align: 'center', maxWidth: p.w - 20 });
    ui.paragraph('Games only earn while their window is open (or minimized into a free background slot).', { x: p.x + 16, y: p.y + 52, w: p.w - 32, h: 40 }, 14, '#dde');
    const q = this.game.activeQuest();
    if (q) ui.paragraph(`📝 ${q.text}`, { x: p.x + 16, y: p.y + 100, w: p.w - 32, h: 50 }, 14, '#fff');
  }

  private drawTaskbar(apps: OsApp[]): void {
    const ui = this.ui;
    const tb = { x: 0, y: this.vh - TASKBAR_H, w: this.vw, h: TASKBAR_H };
    const dark = !ui.theme.bevel;
    const fg = dark ? '#fff' : '#111';
    ui.rect(tb, ui.theme.taskbar, 0);
    ui.bevel(tb);
    if (ui.button({ x: 6, y: tb.y + 6, w: 96, h: TASKBAR_H - 12 }, '🪙 Start', { primary: dark, size: 16 })) this.startOpen = !this.startOpen;
    // Tray: running count, cash, clock (right to left).
    const g = this.game;
    const mid = tb.y + TASKBAR_H / 2;
    const clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let right = tb.w - 10;
    ui.text(clock, right, mid, { size: 14, color: fg, align: 'right' });
    right -= ui.measure(clock, 14) + 14;
    const cash = formatCash(g.state.cash);
    const cashW = Math.min(110, ui.measure(cash, 16, true));
    ui.text(cash, right, mid, { size: 16, bold: true, color: fg, align: 'right', maxWidth: cashW });
    right -= cashW + 14;
    const run = `▶ ${g.running().length}/${g.capacity()}`;
    const runW = ui.measure(run, 13, true);
    ui.text(run, right, mid, { size: 13, bold: true, color: fg, align: 'right' });
    const tray = right - runW - 8;
    // Window + minimized-game buttons.
    const entries: { id: string; state: 'front' | 'open' | 'bg' | 'paused' }[] = [];
    const wins = this.windows;
    wins.forEach((id, i) => entries.push({ id, state: i === wins.length - 1 ? 'front' : 'open' }));
    if (this.screenId) g.state.desk.min.forEach((id, i) => entries.push({ id, state: i < g.slots() ? 'bg' : 'paused' }));
    const x0 = 110;
    const avail = tray - x0 - 8;
    const bw = entries.length ? Math.min(180, (avail - 6 * (entries.length - 1)) / entries.length) : 0;
    entries.forEach((e, i) => {
      const app = apps.find((a) => a.id === e.id);
      if (!app) return;
      const mark = e.state === 'bg' ? '▶ ' : e.state === 'paused' ? '⏸️ ' : '';
      const r = { x: x0 + i * (bw + 6), y: tb.y + 6, w: bw, h: TASKBAR_H - 12 };
      const label = bw < 70 ? `${mark}${app.icon}` : `${mark}${app.icon} ${app.title}`;
      if (ui.button(r, label, { size: 13, primary: e.state === 'front' && dark, textColor: e.state === 'paused' ? '#999' : undefined })) this.launch(e.id);
    });
  }

  private drawStartMenu(full: Rect, apps: OsApp[]): void {
    const ui = this.ui;
    const g = this.game;
    const cols = 2;
    const rowH = 40;
    const w = Math.min(520, this.vw - 12);
    const rows = Math.ceil(apps.length / cols);
    const head = 74;
    const h = Math.min(this.vh - TASKBAR_H - 8, head + rows * rowH + 10);
    const m = { x: 6, y: this.vh - TASKBAR_H - h, w, h };
    ui.pushBounds(m, 'menu');
    ui.panel(m, ui.theme.window, false);
    ui.bevel(m);
    ui.text(`${ui.theme.name} · ${this.name}`, m.x + 14, m.y + 20, { size: 16, bold: true, maxWidth: m.w - 28 });
    ui.text(
      `Running ${g.running().length}/${g.capacity()} · ${g.screenIds().length} screen${g.screenIds().length > 1 ? 's' : ''} × ${g.windowsPerScreen()} window${g.windowsPerScreen() > 1 ? 's' : ''} + ${g.slots()} background`,
      m.x + 14, m.y + 46, { size: 12, color: ui.theme.muted, maxWidth: m.w - 28 },
    );
    const cw = (m.w - 20) / cols;
    apps.forEach((app, i) => {
      const r = { x: m.x + 10 + (i % cols) * cw, y: m.y + head + Math.floor(i / cols) * rowH, w: cw - 6, h: rowH - 4 };
      if (r.y + r.h > m.y + m.h) return;
      const running = g.isRunning(app.id);
      if (ui.button(r, `${app.icon} ${app.title}${running ? '  ▶' : ''}`, { size: 14 })) this.launch(app.id);
    });
    ui.popBounds();
    if (!ui.clicked(m) && ui.clicked(full)) this.startOpen = false;
  }

  private drawDialog(full: Rect, d: CapacityDialog): void {
    const ui = this.ui;
    const g = this.game;
    ui.rect(full, 'rgba(0,0,0,0.45)', 0);
    const w = Math.min(600, this.vw - 40);
    const h = 270;
    const p = { x: (this.vw - w) / 2, y: Math.max(10, (this.vh - TASKBAR_H - h) / 2), w, h };
    ui.pushBounds(p, 'dialog');
    ui.panel(p, ui.theme.window, false);
    ui.bevel(p);
    const title = this.appTitle(d.app);
    const paused = d.pauses.map((id) => this.appTitle(id)).join(', ');
    ui.text(`⚠ No free window for ${title}`, p.x + 18, p.y + 26, { size: 19, bold: true, maxWidth: p.w - 36 });
    let y = p.y + 50;
    y += ui.paragraph(`Opening it here pauses ${paused}: games only earn while open on a screen (or minimized into a free background slot).`, { x: p.x + 18, y, w: p.w - 36, h: 60 }, 14) + 6;
    ui.paragraph(
      `Run more at once: 🖥️ Second-hand Monitor = +1 screen · 💻 Refurbished PC = +1 screen & +1 background slot · 🪟 TycoonOS XP = 2 windows per screen. You have ${g.screenIds().length} screen(s) × ${g.windowsPerScreen()} + ${g.slots()} background.`,
      { x: p.x + 18, y, w: p.w - 36, h: 80 }, 13, ui.theme.muted,
    );
    const by = p.y + p.h - 112;
    const bw = (p.w - 36 - 10) / 2;
    if (d.elsewhere) {
      if (ui.button({ x: p.x + 18, y: by, w: p.w - 36, h: 44 }, `🖥️ Open on ${screenName(d.elsewhere)} instead (free)`, { primary: true, size: 15 })) {
        g.openApp(d.elsewhere, d.app);
        this.dialog = null;
      }
    } else if (ui.button({ x: p.x + 18, y: by, w: p.w - 36, h: 44 }, '🛒 Get another screen in eBuy', { size: 15 })) {
      this.dialog = null;
      this.open('ebuy');
    }
    if (ui.button({ x: p.x + 18, y: by + 54, w: bw, h: 44 }, `Swap: pause ${paused}`, { color: '#a3561a', size: 14 })) {
      this.open(d.app);
      this.dialog = null;
    }
    if (ui.button({ x: p.x + 28 + bw, y: by + 54, w: bw, h: 44 }, 'Cancel', { size: 15 })) this.dialog = null;
    ui.popBounds();
    if (!ui.clicked(p) && ui.clicked(full)) this.dialog = null;
  }

  private drawWindow(app: OsApp, r: Rect): void {
    const ui = this.ui;
    const t = ui.theme;
    ui.pushBounds(r, 'window');
    ui.rect(r, t.window);
    ui.bevel(r);
    const title = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: TITLE_H };
    const gr = ui.g.createLinearGradient(title.x, 0, title.x + title.w, 0);
    gr.addColorStop(0, t.titlebar[0]);
    gr.addColorStop(1, t.titlebar[1]);
    ui.g.fillStyle = gr;
    if (t.radius) {
      ui.g.beginPath();
      ui.g.roundRect(title.x, title.y, title.w, title.h, [t.radius, t.radius, 0, 0]);
      ui.g.fill();
    } else ui.g.fillRect(title.x, title.y, title.w, title.h);
    const game = this.game.isTycoon(app.id);
    const btns = game ? 2 : 1;
    ui.emoji(app.icon, title.x + 20, title.y + title.h / 2, 20);
    ui.text(app.title, title.x + 38, title.y + title.h / 2, { size: 16, bold: true, color: t.titleText, maxWidth: title.w - 46 - btns * 34 });
    const closeR = { x: title.x + title.w - 33, y: title.y + 4, w: 29, h: 26 };
    if (game && ui.button({ ...closeR, x: closeR.x - 33 }, '–', { size: 15 })) {
      this.minimize(app.id);
      ui.popBounds();
      return;
    }
    if (ui.button(closeR, '✕', { size: 14, color: t.bevel ? undefined : '#d9412b' })) {
      this.close(app.id);
      ui.popBounds();
      return;
    }
    const body = inset({ x: r.x, y: title.y + title.h, w: r.w, h: r.h - title.h - 3 }, 8);
    ui.pushBounds(body, 'window');
    const g = ui.g;
    g.save();
    g.beginPath();
    g.rect(body.x - 2, body.y - 2, body.w + 4, body.h + 4);
    g.clip();
    app.draw(ui, body, this);
    g.restore();
    ui.popBounds();
    ui.popBounds();
  }

  private drawToasts(): void {
    const ui = this.ui;
    this.toasts.forEach((t, i) => {
      // Below the window title bars, so close/minimize stay visible.
      const w = Math.min(400, this.vw - 32);
      const r = { x: this.vw - w - 16, y: 50 + i * 48, w, h: 42 };
      ui.g.globalAlpha = Math.min(1, t.t * 2);
      const col = t.tone === 'good' ? '#1f7a35' : t.tone === 'warn' ? '#a3561a' : t.tone === 'token' ? '#5b2a99' : '#1c2a44';
      ui.rect(r, col, 8);
      ui.text(t.text, r.x + 12, r.y + r.h / 2, { size: 14, bold: true, color: '#fff', maxWidth: w - 24 });
      ui.g.globalAlpha = 1;
    });
    if (this.toasts.length) this.dirty = true;
  }
}
