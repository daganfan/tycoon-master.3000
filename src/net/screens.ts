import * as THREE from 'three';
import { TycoonOS, type OsHost } from '@/os/os';
import type { World } from '@/world/world';
import { SCREEN_FRAME_Q, SCREEN_FRAME_W } from './config';
import { clamp } from './protocol';

/**
 * Co-op screens. When a guest uses one of the host's screens, the host runs a
 * private copy of the TycoonOS for that guest (own cursor; the windows are the
 * screen's real windows, so guests open/close the same games the host sees) against
 * the host's REAL game, feeds it the guest's clicks, and streams small JPEG
 * frames back. The guest shows those frames on their copy of the monitor.
 */

/** What a visitor's OS may ask of the outside world: nothing that touches the host's save. */
export const VISITOR_HOST: OsHost & { visitor: true } = {
  visitor: true,
  openSkillTree: () => {},
  exportSave: () => {},
  importSave: () => {},
  resetSave: () => {},
};

export const isVisitorOs = (os: TycoonOS): boolean =>
  (os.host as Partial<typeof VISITOR_HOST>).visitor === true;

export class VisitorScreen {
  readonly os: TycoonOS;
  private small: HTMLCanvasElement;
  private acc = 0;

  constructor(world: World, index: number) {
    const src = world.screens[index]!.os;
    this.os = new TycoonOS(world.game, VISITOR_HOST, src.width, src.height, src.label, src.screenId);
    // Start from what the host's screen shows right now.
    this.os.screen = src.screen === 'off' ? 'off' : 'desktop';
    // Same screen id = same windows as the host's monitor (co-op: what runs is shared).
    this.small = document.createElement('canvas');
    this.small.width = Math.min(SCREEN_FRAME_W, src.width);
    this.small.height = Math.round((this.small.width * src.height) / src.width);
  }

  input(kind: 'move' | 'click' | 'wheel', x: number, y: number): void {
    const cx = clamp(x, 0, this.os.width);
    const cy = clamp(y, 0, this.os.height);
    if (kind === 'move') this.os.pointerMove(cx, cy);
    else if (kind === 'click') {
      this.os.click(cx, cy);
      // Process right away so rapid clicks are not merged into one.
      this.os.update(0.001);
    } else this.os.wheel(clamp(y, -600, 600));
  }

  /** Advance and encode a frame. */
  frame(dt: number): string {
    this.acc += dt;
    this.os.update(this.acc);
    this.acc = 0;
    const g = this.small.getContext('2d')!;
    g.drawImage(this.os.canvas, 0, 0, this.small.width, this.small.height);
    return this.small.toDataURL('image/jpeg', SCREEN_FRAME_Q);
  }
}

/** Guest side: shows streamed frames on the focused monitor, restores the local copy otherwise. */
export class GuestScreens {
  private remote = new Map<number, { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; ready: boolean }>();
  private decoding = new Set<number>();

  constructor(private readonly world: World) {}

  frame(i: number, img: string): void {
    if (this.decoding.has(i) || !this.world.screens[i]) return;
    this.decoding.add(i);
    const im = new Image();
    im.onload = () => {
      this.decoding.delete(i);
      let r = this.remote.get(i);
      if (!r) {
        const canvas = document.createElement('canvas');
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        r = { canvas, tex, ready: false };
        this.remote.set(i, r);
      }
      const w = Math.min(2048, im.naturalWidth);
      const h = Math.min(2048, im.naturalHeight);
      if (r.canvas.width !== w || r.canvas.height !== h) {
        r.canvas.width = w;
        r.canvas.height = h;
        r.tex.dispose();
      }
      r.canvas.getContext('2d')!.drawImage(im, 0, 0, w, h);
      r.tex.needsUpdate = true;
      r.ready = true;
    };
    im.onerror = () => this.decoding.delete(i);
    im.src = img;
  }

  /** Point each monitor at the right texture (streamed while focused). */
  update(focused: number): void {
    this.world.screens.forEach((s, i) => {
      const r = this.remote.get(i);
      const want = i === focused && r?.ready ? r.tex : s.tex;
      const m = s.mesh.material as THREE.MeshBasicMaterial;
      if (m.map !== want) {
        m.map = want;
        m.needsUpdate = true;
      }
      if (i !== focused && r) r.ready = false;
    });
  }
}
