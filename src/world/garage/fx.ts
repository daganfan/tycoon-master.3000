import * as THREE from 'three';

const MAX = 600;

/**
 * One pooled particle system for build pops, furnace sparks and poofs.
 * Additive points that fade to black (= invisible) over their lifetime.
 */
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private base = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private next = 0;

  constructor(scene: THREE.Object3D) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const m = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.layers.set(1);
    scene.add(this.points);
  }

  burst(at: THREE.Vector3Like, color: string | THREE.Color, n: number, speed = 2.5, life = 1, gravity = 4, up = 1.2): void {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 1;
      const sp = speed * (0.35 + Math.random() * 0.65);
      const r = Math.sqrt(1 - e * e);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * r * sp, Math.abs(e) * sp * up + sp * 0.3, Math.sin(a) * r * sp], i * 3);
      const v = 0.7 + Math.random() * 0.3;
      this.base.set([c.r * v, c.g * v, c.b * v], i * 3);
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.4);
      this.grav[i] = gravity;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.life[i]! -= dt;
      this.vel[i * 3 + 1]! -= this.grav[i]! * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k]! += this.vel[i * 3 + k]! * dt;
      if (this.pos[i * 3 + 1]! < 0.01) {
        this.pos[i * 3 + 1] = 0.01;
        this.vel[i * 3 + 1] = -this.vel[i * 3 + 1]! * 0.3;
      }
      const f = Math.max(0, this.life[i]! / this.maxLife[i]!);
      for (let k = 0; k < 3; k++) this.col[i * 3 + k] = this.base[i * 3 + k]! * f;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.color!.needsUpdate = true;
  }
}

/** Synthesized garage sounds (no audio files). */
export class GarageSound {
  private ctx: AudioContext | null = null;
  private lastPlop = 0;
  private lastMelt = 0;

  constructor(private readonly volume: () => number) {}

  private ac(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0): void {
    const ac = this.ac();
    const vol = this.volume();
    if (!ac || vol <= 0) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq = 1200, delay = 0): void {
    const ac = this.ac();
    const vol = this.volume();
    if (!ac || vol <= 0) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = gain * vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(ac.currentTime + delay);
  }

  build(): void {
    [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.08, i * 0.05));
    this.noise(0.35, 0.25, 900);
    this.tone(90, 0.3, 'sine', 0.25, 0.25, -40);
  }
  deny(): void {
    this.tone(140, 0.18, 'square', 0.05);
    this.tone(110, 0.22, 'square', 0.05, 0.12);
  }
  plop(): void {
    const now = performance.now();
    if (now - this.lastPlop < 120) return;
    this.lastPlop = now;
    this.tone(300 + Math.random() * 200, 0.08, 'sine', 0.05, 0, -150);
  }
  melt(): void {
    const now = performance.now();
    if (now - this.lastMelt < 180) return;
    this.lastMelt = now;
    this.noise(0.18, 0.12, 2400);
    this.tone(1200 + Math.random() * 600, 0.06, 'sine', 0.03);
  }
  collect(): void {
    [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.08, i * 0.07));
  }
  rebirth(): void {
    [262, 330, 392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.04, i * 0.08));
    this.noise(1.2, 0.3, 500);
  }
  creak(): void {
    this.tone(180, 0.9, 'sawtooth', 0.03, 0, 120);
    this.tone(240, 0.7, 'triangle', 0.02, 0.2, -60);
  }
  rattle(): void {
    for (let i = 0; i < 4; i++) this.noise(0.05, 0.25, 600, i * 0.07);
  }
  poof(): void {
    this.noise(0.25, 0.12, 400);
  }
}
