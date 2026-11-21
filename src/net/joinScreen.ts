import { connectGuest, goHomeUrl, type GuestLink } from './session';

/**
 * Plain-DOM "Knocking on the door…" screen shown while a guest connects
 * (before the HUD exists). On failure it explains why and offers a way home.
 */
export async function joinWithOverlay(code: string): Promise<GuestLink> {
  const el = document.createElement('div');
  el.id = 'tm-join';
  el.setAttribute('role', 'status');
  el.style.cssText =
    'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px;' +
    'background:#08090d;color:#e8e6f0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;';
  el.innerHTML = `<div style="max-width:520px">
    <div style="font-size:72px">🚪</div>
    <h1 style="font-size:24px;margin:12px 0 4px">Visiting room <span data-code style="letter-spacing:3px;color:#f6c537"></span></h1>
    <p data-status style="color:#b8b4c8;min-height:24px">Connecting…</p>
    <p data-hint style="color:#77738a;font-size:13px"></p>
    <a data-home style="display:inline-block;margin-top:12px;color:#9fd2ff">← Back to my own room</a>
  </div>`;
  el.querySelector<HTMLElement>('[data-code]')!.textContent = code;
  el.querySelector<HTMLAnchorElement>('[data-home]')!.href = goHomeUrl();
  document.body.append(el);
  const status = el.querySelector<HTMLElement>('[data-status]')!;
  const hint = el.querySelector<HTMLElement>('[data-hint]')!;
  const slow = setTimeout(
    () =>
      (hint.textContent =
        'Taking a while… peer-to-peer connections can need 10–30 seconds to find each other.'),
    10_000,
  );
  try {
    const link = await connectGuest(code, (s) => (status.textContent = s));
    status.textContent = 'Building their room…';
    // The world is built next; remove the overlay once the HUD is up.
    setTimeout(() => el.remove(), 50);
    return link;
  } catch (e) {
    status.textContent = (e as Error).message;
    status.style.color = '#ff9c9c';
    hint.textContent = 'Ask your friend for a new link, or try again in a minute.';
    const retry = document.createElement('button');
    retry.textContent = 'Try again';
    retry.style.cssText =
      'font:inherit;font-weight:700;padding:10px 22px;border:0;border-radius:10px;background:#f6c537;color:#3a2604;cursor:pointer;margin:12px;';
    retry.onclick = () => location.reload();
    el.firstElementChild!.append(retry);
    throw e;
  } finally {
    clearTimeout(slow);
  }
}
