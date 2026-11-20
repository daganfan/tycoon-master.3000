/**
 * Fixed-step loop: `step(dt)` runs at a fixed rate regardless of frame rate,
 * `render(alpha)` runs once per animation frame with an interpolation factor.
 */
export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  running = false;

  constructor(
    private readonly stepSeconds: number,
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
    private readonly maxStepsPerFrame = 8,
  ) {}

  /** Advance manually (used by tests and by the RAF driver). */
  advance(seconds: number): number {
    this.acc += seconds;
    let steps = 0;
    while (this.acc >= this.stepSeconds && steps < this.maxStepsPerFrame) {
      this.step(this.stepSeconds);
      this.acc -= this.stepSeconds;
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.acc = 0; // drop backlog instead of spiraling
    return steps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;
      this.advance(dt);
      this.render(this.acc / this.stepSeconds, dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
