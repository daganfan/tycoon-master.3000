import * as THREE from 'three';
import type { TycoonOS } from '@/os/os';

/** What the scheduler needs from a world screen entry. */
export interface ScheduledScreen {
  os: TycoonOS;
  mesh: THREE.Mesh;
  tex: THREE.CanvasTexture;
  redraw: number;
  acc: number;
}

const FOCUSED_FPS = 30;
const NEAR_FPS = 6;
const FAR_FPS = 3;
const HIDDEN_FPS = 0.25;
/** The main screen lights the room (glow light), so it keeps a slow pulse even off-screen. */
const MAIN_HIDDEN_FPS = 1;

/**
 * Redraw + upload policy for the in-world TycoonOS screens.
 *
 * Every redraw is a full 2D canvas draw plus a full texture upload (and
 * mipmap generation), so: the focused screen redraws at 30 fps, visible
 * screens at 3-6 fps by distance, off-screen/back-facing ones almost never,
 * and at most ONE unfocused screen redraws per frame (none on a frame that
 * already redraws the focused screen, or right after a slow frame) so
 * redraws never pile up into a hitch.
 *
 * It also reads the main screen's average colour back from the GPU
 * asynchronously (1x1 mip, pixel buffer + fence) for the screen glow light.
 */
export class ScreenScheduler {
  /** Average sRGB colour of the main screen, once known. */
  readonly glow = new THREE.Color(0.35, 0.55, 0.8);
  glowKnown = false;
  redrawsPerSec = 0;
  private redraws = 0;
  private statT = 0;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly gl: WebGL2RenderingContext;
  private mainUploaded = false;
  private readT = 0;
  private read: { buf: WebGLBuffer; fbo: WebGLFramebuffer; sync: WebGLSync | null } | null = null;
  private readBroken = false;
  private readonly px = new Uint8Array(4);
  private avgMs = 16.7;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
  }

  update(dt: number, screens: readonly ScheduledScreen[], focus: ScheduledScreen | null, camera: THREE.Camera, lastFrameMs: number): void {
    this.statT += dt;
    if (this.statT >= 1) {
      this.redrawsPerSec = this.redraws / this.statT;
      this.redraws = 0;
      this.statT = 0;
    }
    this.pollGlow(dt);
    this.avgMs += (dt * 1000 - this.avgMs) * 0.05;
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const cam = camera.position;
    let focusedDrew = false;
    let best: ScheduledScreen | null = null;
    let bestLate = 0;
    for (let i = 0; i < screens.length; i++) {
      const s = screens[i]!;
      s.redraw -= dt;
      s.acc += dt;
      if (s === focus) {
        if (s.redraw <= 0) {
          this.draw(s, FOCUSED_FPS, i === 0);
          focusedDrew = true;
        }
        continue;
      }
      if (s.redraw > 0) continue;
      // Late by how many of its own frames: the most overdue screen goes first.
      const late = -s.redraw;
      if (!best || late > bestLate) {
        best = s;
        bestLate = late;
      }
    }
    // Skip right after a hitch (relative to the usual frame time) so work doesn't pile up.
    if (best && !focusedDrew && Math.min(lastFrameMs, dt * 1000) < Math.max(40, this.avgMs * 1.5)) this.draw(best, this.rate(best, best === screens[0], cam), best === screens[0]);
  }

  private rate(s: ScheduledScreen, main: boolean, cam: THREE.Vector3): number {
    const mesh = s.mesh;
    mesh.getWorldPosition(this.p);
    this.n.set(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(this.q));
    const p = this.p;
    const facing = this.n.x * (cam.x - p.x) + this.n.y * (cam.y - p.y) + this.n.z * (cam.z - p.z) > 0;
    const visible = facing && mesh.visible && this.frustum.intersectsObject(mesh);
    if (!visible) return main ? MAIN_HIDDEN_FPS : HIDDEN_FPS;
    return this.p.distanceTo(cam) < 2.5 ? NEAR_FPS : FAR_FPS;
  }

  private draw(s: ScheduledScreen, fps: number, main: boolean): void {
    s.redraw = 1 / fps;
    s.os.update(s.acc);
    s.acc = 0;
    s.tex.needsUpdate = true;
    this.redraws++;
    if (main) this.mainUploaded = true;
  }

  /* ---- async glow readback ---- */

  /** Called after the frame rendered: start a readback of the main screen's smallest mip. */
  afterRender(main: ScheduledScreen | undefined): void {
    if (!main || this.readBroken || this.read?.sync || !this.mainUploaded || this.readT > 0) return;
    this.mainUploaded = false;
    this.readT = 0.4;
    const gl = this.gl;
    const props = this.renderer.properties.get(main.tex) as { __webglTexture?: WebGLTexture };
    const tex = props.__webglTexture;
    const img = main.tex.image as { width: number; height: number } | undefined;
    if (!tex || !img || !main.tex.generateMipmaps) return;
    const level = Math.floor(Math.log2(Math.max(img.width, img.height)));
    try {
      if (!this.read) {
        const buf = gl.createBuffer();
        const fbo = gl.createFramebuffer();
        if (!buf || !fbo) throw new Error('no buffers');
        this.read = { buf, fbo, sync: null };
        const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
      }
      const r = this.read;
      const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.fbo);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, level);
      const ok = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (ok) {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.buf);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        r.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
      if (!ok) this.readBroken = true;
    } catch {
      this.readBroken = true;
    }
  }

  private pollGlow(dt: number): void {
    this.readT -= dt;
    const r = this.read;
    if (!r?.sync) return;
    const gl = this.gl;
    if (gl.getSyncParameter(r.sync, gl.SYNC_STATUS) !== gl.SIGNALED) return;
    const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.px);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
    gl.deleteSync(r.sync);
    r.sync = null;
    this.glow.setRGB(this.px[0]! / 255, this.px[1]! / 255, this.px[2]! / 255);
    this.glowKnown = true;
  }
}
