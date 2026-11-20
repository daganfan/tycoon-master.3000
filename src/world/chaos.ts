import * as THREE from 'three';
import type { Game } from '@/sim/game';
import type { PhysObj } from './physics';
import type { Avatar } from './avatar';

const TOYS = new Set(['duck', 'sock', 'remote']);
/** Seconds between flops. Flopping by itself is not mayhem; only real falls count. */
export const FLOP_COOLDOWN = 4;
/** A ragdoll/fall only counts when the avatar drops at least this far (m). */
export const MIN_FALL = 1.5;

/**
 * Watches the physics world for mayhem and reports it to the Chaos Meter with a
 * magnitude, so the sim can apply diminishing returns. Objects the player is
 * handling (carrying, tidying) never count.
 */
export class ChaosDetector {
  private now = 0;
  private lastFlop = -Infinity;
  private avalancheT = 0;
  private airborne = false;
  private peakY = 0;
  private towerArmed = new WeakMap<PhysObj, boolean>();
  /** Last meter gain, for the HUD. */
  last: { text: string; until: number } | null = null;

  constructor(
    private readonly game: Game,
    private readonly avatar: Avatar,
    private readonly busy: (o: PhysObj) => boolean,
    private readonly onTopple: () => void,
  ) {
    game.bus.on('chaos', (e) => {
      this.last = { text: `🟠 Mayhem +${Math.round(e.points)} · meter ${Math.floor(e.meter)}/${e.need}`, until: this.now + 3 };
    });
  }

  /** Try to flop; returns true if the flop happened (it never pays by itself). */
  tryFlop(): boolean {
    if (this.now - this.lastFlop < FLOP_COOLDOWN || this.avatar.ragdoll > 0) return false;
    this.avatar.flop();
    this.lastFlop = this.now;
    return true;
  }

  update(dt: number, tracked: PhysObj[], fastCoins: number): void {
    this.now += dt;
    const g = this.game;
    const up = new THREE.Vector3();
    for (const o of tracked) {
      if (o.kind === 'avatar') continue;
      up.set(0, 1, 0).applyQuaternion(o.mesh.quaternion);
      if (o.wasUpright && up.y < 0.45) {
        o.wasUpright = false;
        if (TOYS.has(o.kind) || this.busy(o)) continue;
        this.onTopple();
        const m = o.body.mass();
        const magnitude = THREE.MathUtils.clamp(0.6 + Math.log2(1 + m) * 0.35, 0.6, 2.5);
        g.reportChaos('topple', { magnitude, object: o.id ?? o.kind });
      } else if (up.y > 0.9) o.wasUpright = true;
    }

    this.avalancheT -= dt;
    if (fastCoins >= 15 && this.avalancheT <= 0) {
      this.avalancheT = 3;
      g.reportChaos('avalanche', { magnitude: fastCoins });
    }

    // Towers: a box that comes to rest high up counts once, until it's been knocked down again.
    for (const o of tracked) {
      if (o.kind !== 'box') continue;
      const y = o.body.translation().y;
      if (!this.towerArmed.has(o)) this.towerArmed.set(o, y < 0.9); // stacks that spawn high don't count
      if (y < 0.9) this.towerArmed.set(o, true);
      else if (y > 1.15 && o.body.isSleeping() && this.towerArmed.get(o)) {
        this.towerArmed.set(o, false);
        g.reportChaos('tower', { magnitude: y, object: o.id ?? 'box' });
      }
    }

    // Real falls: measure the drop from the highest point of the jump/fall to the landing.
    const y = this.avatar.position.y;
    if (this.avatar.airTime > 0) {
      if (!this.airborne) {
        this.airborne = true;
        this.peakY = y;
      }
      this.peakY = Math.max(this.peakY, y);
    } else if (this.airborne) {
      this.airborne = false;
      const drop = this.peakY - y;
      if (drop >= MIN_FALL) g.reportChaos('ragdoll', { magnitude: drop });
    }
  }

  hint(): string {
    return this.last && this.last.until > this.now ? this.last.text : '';
  }
}
