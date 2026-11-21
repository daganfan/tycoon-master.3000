/** Plain-DOM checks and a friendly fallback screen when the game can't start. */

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const TIPS = [
  'Use an up-to-date Chrome, Edge, Firefox or Safari (version 16.4 or newer).',
  'Turn on hardware acceleration / graphics acceleration in your browser settings.',
  'Update your graphics drivers, or try another device.',
  'Private / incognito windows can block saving; a normal window works best.',
];

export function showFatal(title: string, detail?: string): void {
  if (document.getElementById('tm-fatal')) return;
  const el = document.createElement('div');
  el.id = 'tm-fatal';
  el.setAttribute('role', 'alert');
  el.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;' +
    'background:#08090d;color:#e8e6f0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:520px;text-align:center;';
  const icon = document.createElement('img');
  icon.src = 'icon.svg';
  icon.alt = '';
  icon.width = 96;
  icon.height = 96;
  const h = document.createElement('h1');
  h.textContent = title;
  h.style.cssText = 'font-size:24px;margin:16px 0 8px;';
  const list = document.createElement('ul');
  list.style.cssText = 'text-align:left;margin:16px 0;padding-left:20px;color:#b8b4c8;';
  for (const t of TIPS) {
    const li = document.createElement('li');
    li.textContent = t;
    list.append(li);
  }
  const btn = document.createElement('button');
  btn.textContent = 'Try again';
  btn.style.cssText = 'font:inherit;font-weight:700;padding:10px 22px;border:0;border-radius:10px;background:#f6c537;color:#3a2604;cursor:pointer;';
  btn.onclick = () => location.reload();
  box.append(icon, h, list, btn);
  if (detail) {
    const d = document.createElement('p');
    d.textContent = `Details: ${detail}`;
    d.style.cssText = 'margin-top:16px;font-size:12px;color:#77738a;word-break:break-word;';
    box.append(d);
  }
  el.append(box);
  document.body.append(el);
}
