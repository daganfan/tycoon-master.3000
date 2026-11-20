/// <reference types="vite-plugin-pwa/client" />
/** Service worker registration (offline play + installable app) with a tiny "update available" toast. */

export function isElectron(): boolean {
  return navigator.userAgent.includes('Electron');
}

function toast(onReload: () => void): void {
  if (document.getElementById('tm-update')) return;
  const el = document.createElement('div');
  el.id = 'tm-update';
  el.setAttribute('role', 'status');
  el.style.cssText =
    'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9000;display:flex;gap:12px;align-items:center;' +
    'padding:10px 14px;border-radius:12px;background:#1b1830;color:#eee;box-shadow:0 6px 24px #0008;' +
    'font:14px system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:auto;';
  const text = document.createElement('span');
  text.textContent = 'New version available';
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.style.cssText = 'font:inherit;font-weight:700;border:0;border-radius:8px;padding:6px 12px;background:#f6c537;color:#3a2604;cursor:pointer;';
  reload.onclick = onReload;
  const later = document.createElement('button');
  later.textContent = 'Later';
  later.style.cssText = 'font:inherit;border:0;background:none;color:#aaa;cursor:pointer;';
  later.onclick = () => el.remove();
  el.append(text, reload, later);
  document.body.append(el);
}

/** `beforeReload` lets the game save before the new version takes over. */
export async function registerPwa(beforeReload: () => Promise<void> = async () => {}): Promise<void> {
  if (import.meta.env.DEV || isElectron() || !('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const update = registerSW({
      onNeedRefresh: () =>
        toast(async () => {
          try {
            await beforeReload();
          } finally {
            await update(true);
          }
        }),
      onRegisteredSW: (_url, reg) => {
        // Check for a new version every hour while the game stays open.
        if (reg) setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
      },
    });
  } catch (e) {
    console.warn('Offline support unavailable', e);
  }
}
