import type { OsTheme } from './theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ButtonOpts {
  disabled?: boolean;
  primary?: boolean;
  size?: number;
  color?: string;
  textColor?: string;
}

/**
 * Tiny immediate-mode UI for canvas screens. Each frame draws everything;
 * a queued click is consumed by the first widget it lands on.
 */
export class Ui {
  mx = -1;
  my = -1;
  private click: { x: number; y: number } | null = null;
  private wheel = 0;
  /** Set whenever any widget is hovered, so the world can show a hand cursor. */
  hovering = false;
  time = 0;

  constructor(
    readonly g: CanvasRenderingContext2D,
    public theme: OsTheme,
  ) {}

  pointer(x: number, y: number): void {
    this.mx = x;
    this.my = y;
  }

  pushClick(x: number, y: number): void {
    this.click = { x, y };
    this.mx = x;
    this.my = y;
  }

  pushWheel(dy: number): void {
    this.wheel += dy;
  }

  begin(time: number): void {
    this.time = time;
    this.hovering = false;
  }

  /** Drop any unconsumed click so it doesn't fire next frame. */
  end(): void {
    this.click = null;
    this.wheel = 0;
  }

  inside(r: Rect, x = this.mx, y = this.my): boolean {
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
  }

  /** Consume a click inside `r` (used by clickable regions without visuals). */
  clicked(r: Rect): boolean {
    if (this.inside(r)) this.hovering = true;
    if (this.click && this.inside(r, this.click.x, this.click.y)) {
      this.click = null;
      return true;
    }
    return false;
  }

  takeWheel(r: Rect): number {
    if (!this.inside(r) || this.wheel === 0) return 0;
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  font(size: number, bold = false): string {
    return `${bold ? 'bold ' : ''}${size}px ${this.theme.font}`;
  }

  rect(r: Rect, fill: string, radius = this.theme.radius): void {
    const g = this.g;
    g.fillStyle = fill;
    if (radius > 0) {
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, radius);
      g.fill();
    } else g.fillRect(r.x, r.y, r.w, r.h);
  }

  bevel(r: Rect, inset = false): void {
    if (!this.theme.bevel) return;
    const g = this.g;
    g.lineWidth = 2;
    g.strokeStyle = inset ? '#808080' : '#ffffff';
    g.beginPath();
    g.moveTo(r.x, r.y + r.h);
    g.lineTo(r.x, r.y);
    g.lineTo(r.x + r.w, r.y);
    g.stroke();
    g.strokeStyle = inset ? '#ffffff' : '#404040';
    g.beginPath();
    g.moveTo(r.x + r.w, r.y);
    g.lineTo(r.x + r.w, r.y + r.h);
    g.lineTo(r.x, r.y + r.h);
    g.stroke();
  }

  panel(r: Rect, fill = this.theme.panel, inset = true): void {
    this.rect(r, fill);
    this.bevel(r, inset);
  }

  text(
    s: string,
    x: number,
    y: number,
    o: { size?: number; color?: string; bold?: boolean; align?: CanvasTextAlign; maxWidth?: number; baseline?: CanvasTextBaseline } = {},
  ): void {
    const g = this.g;
    g.font = this.font(o.size ?? 16, o.bold);
    g.fillStyle = o.color ?? this.theme.text;
    g.textAlign = o.align ?? 'left';
    g.textBaseline = o.baseline ?? 'middle';
    g.fillText(s, x, y, o.maxWidth);
  }

  /** Word-wrapped text. Returns the height used. */
  paragraph(s: string, r: Rect, size = 15, color = this.theme.text): number {
    const g = this.g;
    g.font = this.font(size);
    const words = s.split(' ');
    let line = '';
    let y = r.y + size * 0.7;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > r.w && line) {
        this.text(line, r.x, y, { size, color });
        line = w;
        y += size * 1.35;
      } else line = test;
    }
    if (line) this.text(line, r.x, y, { size, color });
    return y - r.y + size * 0.7;
  }

  button(r: Rect, label: string, o: ButtonOpts = {}): boolean {
    const hover = !o.disabled && this.inside(r);
    const pressed = hover && !!this.click && this.inside(r, this.click.x, this.click.y);
    const t = this.theme;
    let fill = o.color ?? (o.primary ? t.accent : t.button);
    if (hover && !o.color && !o.primary) fill = t.buttonHover;
    this.g.globalAlpha = o.disabled ? 0.45 : 1;
    this.rect(r, fill);
    if (t.bevel) this.bevel(r, pressed);
    else if (hover) {
      this.g.strokeStyle = t.accent;
      this.g.lineWidth = 2;
      this.g.beginPath();
      this.g.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, t.radius);
      this.g.stroke();
    }
    const textColor = o.textColor ?? (o.primary || o.color ? '#fff' : t.buttonText);
    this.text(label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: o.size ?? 16, color: textColor, bold: true, align: 'center', maxWidth: r.w - 8 });
    this.g.globalAlpha = 1;
    if (hover) this.hovering = true;
    if (o.disabled) {
      if (pressed) this.click = null;
      return false;
    }
    return this.clicked(r);
  }

  bar(r: Rect, frac: number, color: string, back = 'rgba(0,0,0,0.25)'): void {
    this.rect(r, back, Math.min(this.theme.radius, r.h / 2));
    const w = Math.max(0, Math.min(1, frac)) * r.w;
    if (w > 0) this.rect({ ...r, w }, color, Math.min(this.theme.radius, r.h / 2));
  }

  emoji(s: string, x: number, y: number, size: number): void {
    this.g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    this.g.textAlign = 'center';
    this.g.textBaseline = 'middle';
    this.g.fillStyle = '#000';
    this.g.fillText(s, x, y);
  }

  gradient(r: Rect, a: string, b: string, vertical = true): void {
    const gr = vertical ? this.g.createLinearGradient(0, r.y, 0, r.y + r.h) : this.g.createLinearGradient(r.x, 0, r.x + r.w, 0);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    this.g.fillStyle = gr;
    this.g.fillRect(r.x, r.y, r.w, r.h);
  }
}

export const inset = (r: Rect, p: number): Rect => ({ x: r.x + p, y: r.y + p, w: r.w - 2 * p, h: r.h - 2 * p });
export const splitH = (r: Rect, at: number, gap = 0): [Rect, Rect] => [
  { x: r.x, y: r.y, w: at, h: r.h },
  { x: r.x + at + gap, y: r.y, w: r.w - at - gap, h: r.h },
];
export const splitV = (r: Rect, at: number, gap = 0): [Rect, Rect] => [
  { x: r.x, y: r.y, w: r.w, h: at },
  { x: r.x, y: r.y + at + gap, w: r.w, h: r.h - at - gap },
];
