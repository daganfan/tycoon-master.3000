/** Tiny synthesized decor sounds (squeaks, jingles, clanks). Lazily creates its own AudioContext. */
class DecorSound {
  private ctx: AudioContext | null = null;
  private recent = 0;
  private last = 0;
  volume = 0.6;

  private ac(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Rate limit so a pile of rubber chickens doesn't deafen anyone. */
  private allow(): boolean {
    const now = performance.now();
    if (now - this.last > 250) this.recent = 0;
    this.last = now;
    return ++this.recent <= 4;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0): void {
    const ac = this.ac();
    if (!ac || this.volume <= 0 || ac.state !== 'running') return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  squeak(pitch = 1): void {
    if (!this.allow()) return;
    const f = 900 * pitch * (0.92 + Math.random() * 0.16);
    this.tone(f, 0.09, 'square', 0.035, 0, f * 0.6);
    this.tone(f * 1.5, 0.12, 'triangle', 0.05, 0.06, -f * 0.7);
  }

  clank(): void {
    if (!this.allow()) return;
    this.tone(220, 0.25, 'triangle', 0.08, 0, -60);
    this.tone(1760, 0.12, 'sine', 0.03);
  }

  /** A short, original little ditty for the singing fish. */
  jingle(): void {
    const notes = [392, 440, 494, 392, 587, 523, 494, 440];
    notes.forEach((f, i) => this.tone(f, 0.2, 'square', 0.03, i * 0.22));
  }
}

export const decorSound = new DecorSound();
