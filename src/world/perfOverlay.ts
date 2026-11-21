/**
 * Tiny FPS / performance overlay (F3, or Settings → "FPS counter").
 * Dependency-free so the OS settings app can toggle it without pulling the
 * 3D code into the main bundle. The world registers a text provider.
 */

const KEY = 'tm.perfOverlay';
let provider: (() => string) | null = null;
let el: HTMLDivElement | null = null;
let timer = 0;
let on = read();

function read(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function tick(): void {
  if (el && provider) el.textContent = provider();
}

function sync(): void {
  if (typeof document === 'undefined') return;
  if (on && provider) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'tm-perf';
      el.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:50;pointer-events:none;font:12px/1.35 ui-monospace,Consolas,monospace;' +
        'color:#d8ffd8;background:rgba(0,0,0,.62);padding:6px 8px;border-radius:6px;white-space:pre;';
      document.body.appendChild(el);
    }
    tick();
    if (!timer) timer = window.setInterval(tick, 250);
  } else {
    el?.remove();
    el = null;
    if (timer) window.clearInterval(timer);
    timer = 0;
  }
}

export function perfOverlayEnabled(): boolean {
  return on;
}

export function setPerfOverlay(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* private mode */
  }
  sync();
}

/** Called by the world once rendering is up. */
export function setPerfProvider(p: () => string): void {
  provider = p;
  sync();
}

if (typeof window !== 'undefined')
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      setPerfOverlay(!on);
    }
  });
