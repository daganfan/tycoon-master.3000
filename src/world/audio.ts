/** Tiny synthesized sound effects (no audio files needed). */
export class Sfx {
  private ctx: AudioContext | null = null;
  volume = 0.6;

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
    if (!ac || this.volume <= 0) return;
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

  clink(): void {
    const f = 1800 + Math.random() * 900;
    this.tone(f, 0.12, 'sine', 0.08);
    this.tone(f * 1.5, 0.08, 'sine', 0.04, 0.02);
  }
  payout(): void {
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, i * 0.06));
  }
  token(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'square', 0.04, i * 0.07));
  }
  thud(): void {
    this.tone(120, 0.25, 'sine', 0.25, 0, -80);
  }
  click(): void {
    this.tone(900, 0.03, 'square', 0.03);
  }
  quack(): void {
    this.tone(520, 0.15, 'sawtooth', 0.06, 0, -200);
  }
}
