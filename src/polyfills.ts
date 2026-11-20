/**
 * Small polyfills for older Safari / Firefox. Imported first in main.ts.
 * Everything here is a no-op on current browsers.
 */

type Radii = number | DOMPointInit | (number | DOMPointInit)[] | undefined;

function radius(r: number | DOMPointInit | undefined): number {
  if (r === undefined) return 0;
  return typeof r === 'number' ? r : (r.x ?? 0);
}

// CanvasRenderingContext2D.roundRect: Safari < 16, Firefox < 112.
function roundRect(this: CanvasPath, x: number, y: number, w: number, h: number, radii?: Radii): void {
  const v = (Array.isArray(radii) ? radii : [radii]).map(radius);
  const a = v[0] ?? 0, b = v[1] ?? a, c = v[2] ?? a, d = v[3] ?? b;
  // CSS-style shorthand: [all] | [tl/br, tr/bl] | [tl, tr/bl, br] | [tl, tr, br, bl]
  const max = Math.min(Math.abs(w), Math.abs(h)) / 2;
  const [tl, tr, br, bl] = [a, b, c, d].map((n) => Math.max(0, Math.min(n, max))) as [number, number, number, number];
  this.moveTo(x + tl, y);
  this.lineTo(x + w - tr, y);
  this.arcTo(x + w, y, x + w, y + tr, tr);
  this.lineTo(x + w, y + h - br);
  this.arcTo(x + w, y + h, x + w - br, y + h, br);
  this.lineTo(x + bl, y + h);
  this.arcTo(x, y + h, x, y + h - bl, bl);
  this.lineTo(x, y + tl);
  this.arcTo(x, y, x + tl, y, tl);
  this.closePath();
}

for (const proto of [
  globalThis.CanvasRenderingContext2D?.prototype,
  globalThis.OffscreenCanvasRenderingContext2D?.prototype,
  globalThis.Path2D?.prototype,
]) {
  if (proto && !('roundRect' in proto)) Object.defineProperty(proto, 'roundRect', { value: roundRect, configurable: true, writable: true });
}

// Old Safari only exposes the prefixed AudioContext.
const w = globalThis as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
if (!w.AudioContext && w.webkitAudioContext) w.AudioContext = w.webkitAudioContext;

// structuredClone: Safari < 15.4. Saves are plain JSON-safe data.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (<T>(v: T): T => JSON.parse(JSON.stringify(v)) as T) as typeof structuredClone;
}

export {};
