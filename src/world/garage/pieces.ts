import * as THREE from 'three';
import { BELT, FURNACE, LINES, TANK, type PadDef, type UpgradeFx } from '@/content/garage';
import { mat, rbox, shadowed } from '../room';
import { beltTexture, hazard, signTex } from './textures';

/** A static box collider a piece needs (world space). */
export interface BoxSpec {
  half: [number, number, number];
  pos: [number, number, number];
  /** Frictionless (belt surfaces: the belt sets item velocities itself). */
  slick?: boolean;
}

export interface Piece {
  group: THREE.Group;
  colliders: BoxSpec[];
  /** Per-frame animation (t = world time). */
  animate?: (dt: number, t: number) => void;
  /** Kick an action animation (a drop, a melt, a payout). */
  pulse?: () => void;
  /** Animated sub-objects that must not be merged into static geometry. */
  keep?: THREE.Object3D[];
}

const steel = mat('#6b7178', 0.4, 0.75);
const darkSteel = mat('#2f3337', 0.5, 0.6);
const yellow = mat('#f2b705', 0.45, 0.2);

function emojiTex(emoji: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.font = '88px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SCRAP_EMOJI: Record<string, string> = { cap: '🍾', duck: '🦆', phone: '📱', sock: '🧦', gear: '⚙️', crate: '📦' };

/* ------------------------------------------------------------------ belt */

export function buildBelt(line: 'A' | 'B'): Piece & { tex: THREE.Texture } {
  const L = LINES[line];
  const len = L.x1 - L.x0;
  const cx = (L.x0 + L.x1) / 2;
  const w = BELT.width;
  const top = BELT.top;
  const g = new THREE.Group();
  const frame = rbox(len, 0.12, w + 0.06, 0.01, steel);
  frame.position.set(0, top - 0.065, 0);
  g.add(frame);
  const tex = beltTexture();
  tex.repeat.set(len / 0.5, 1);
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat('#ffffff', 0.85, 0, { map: tex }));
  belt.rotation.x = -Math.PI / 2;
  belt.position.y = top + 0.002;
  g.add(belt);
  for (const s of [-1, 1]) {
    const lip = rbox(len, 0.15, 0.03, 0.005, yellow);
    lip.position.set(0, top + 0.06, s * (w / 2 + 0.03));
    g.add(lip);
  }
  for (let x = -len / 2 + 0.3; x <= len / 2 - 0.2; x += 1.2)
    for (const s of [-1, 1]) {
      const leg = rbox(0.05, top - 0.12, 0.05, 0.005, darkSteel);
      leg.position.set(x, (top - 0.12) / 2, s * (w / 2 - 0.02));
      g.add(leg);
    }
  for (const x of [-len / 2, len / 2]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, w + 0.04, 16), darkSteel);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(x, top - 0.06, 0);
    g.add(roller);
  }
  g.position.set(cx, 0, L.z);
  shadowed(g);
  belt.castShadow = false;
  return {
    group: g,
    tex,
    colliders: [
      { half: [len / 2, top / 2, w / 2 + 0.03], pos: [cx, top / 2, L.z], slick: true },
      { half: [len / 2, 0.07, 0.015], pos: [cx, top + 0.07, L.z - w / 2 - 0.03] },
      { half: [len / 2, 0.07, 0.015], pos: [cx, top + 0.07, L.z + w / 2 + 0.03] },
    ],
  };
}

/* ------------------------------------------------------------------ dropper */

export function buildDropper(def: PadDef): Piece {
  const at = def.at!;
  const mega = def.dropper!.scrap === 'crate';
  const g = new THREE.Group();
  const legH = mega ? 1.65 : 1.45;
  const span = 0.46;
  for (const s of [-1, 1]) {
    const leg = rbox(0.08, legH, 0.08, 0.01, darkSteel);
    leg.position.set(0, legH / 2, s * span);
    g.add(leg);
    const foot = rbox(0.2, 0.03, 0.2, 0.01, darkSteel);
    foot.position.set(0, 0.015, s * span);
    g.add(foot);
  }
  const beam = rbox(0.12, 0.1, span * 2 + 0.1, 0.01, darkSteel);
  beam.position.set(0, legH, 0);
  g.add(beam);
  const hopper = new THREE.Group();
  const color = mega ? '#c92a2a' : ['#1c7ed6', '#2f9e44', '#e8590c', '#7048e8', '#0c8599'][def.id.length % 5]!;
  const box = rbox(mega ? 0.7 : 0.48, mega ? 0.5 : 0.36, mega ? 0.7 : 0.48, 0.03, mat(color, 0.4, 0.35));
  box.position.y = mega ? 0.3 : 0.22;
  hopper.add(box);
  const funnel = new THREE.Mesh(new THREE.ConeGeometry(mega ? 0.3 : 0.2, 0.22, 16, 1, true), mat('#adb5bd', 0.35, 0.8, { side: THREE.DoubleSide }));
  funnel.rotation.x = Math.PI;
  funnel.position.y = -0.06;
  hopper.add(funnel);
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(mega ? 0.42 : 0.3, mega ? 0.42 : 0.3), new THREE.MeshBasicMaterial({ map: emojiTex(SCRAP_EMOJI[def.dropper!.scrap]!, '#f8f9fa') }));
  icon.position.set(0, box.position.y, -(mega ? 0.351 : 0.241));
  icon.rotation.y = Math.PI;
  hopper.add(icon);
  const icon2 = icon.clone();
  icon2.position.z *= -1;
  icon2.rotation.y = 0;
  hopper.add(icon2);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), mat('#ffffff', 0.3, 0, { emissive: '#51cf66', emissiveIntensity: 2 }));
  lamp.position.set(0, box.position.y * 2 + 0.04, 0);
  hopper.add(lamp);
  if (mega) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.72), mat('#ffffff', 0.5, 0, { map: hazard() }));
    stripe.position.y = 0.06;
    hopper.add(stripe);
  }
  hopper.position.y = legH + 0.05;
  g.add(hopper);
  g.position.set(at.x, 0, at.z);
  shadowed(g);
  let kick = 0;
  return {
    group: g,
    colliders: [-1, 1].map((s) => ({ half: [0.05, legH / 2, 0.05], pos: [at.x, legH / 2, at.z + s * span] })),
    keep: [hopper],
    pulse: () => (kick = 1),
    animate: (dt, t) => {
      kick = Math.max(0, kick - dt * 4);
      hopper.position.y = legH + 0.05 + Math.sin(kick * Math.PI) * 0.05;
      hopper.rotation.z = Math.sin(t * 40) * 0.03 * kick;
    },
  };
}

/* ------------------------------------------------------------------ upgrader */

const FX_STYLE: Record<UpgradeFx, { color: string; label: string; emoji: string }> = {
  paint: { color: '#e64980', label: 'PAINT', emoji: '🎨' },
  gold: { color: '#fab005', label: 'GOLD', emoji: '✨' },
  wrap: { color: '#74c0fc', label: 'WRAP', emoji: '🎁' },
  hat: { color: '#9775fa', label: 'TOP HAT', emoji: '🎩' },
};

export function buildUpgrader(def: PadDef): Piece {
  const at = def.at!;
  const fx = def.upgrader!.fx;
  const st = FX_STYLE[fx];
  const g = new THREE.Group();
  const H = 1.05;
  const span = 0.42;
  const frameM = mat(fx === 'gold' ? '#d4a017' : '#343a40', fx === 'gold' ? 0.25 : 0.45, fx === 'gold' ? 1 : 0.5);
  for (const s of [-1, 1]) {
    const post = rbox(0.12, H, 0.1, 0.02, frameM);
    post.position.set(0, H / 2, s * span);
    g.add(post);
  }
  const beam = rbox(0.24, 0.16, span * 2 + 0.14, 0.03, frameM);
  beam.position.set(0, H + 0.06, 0);
  g.add(beam);
  const curtainM = new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 0.1, H - BELT.top - 0.02), curtainM);
  curtain.rotation.y = Math.PI / 2;
  curtain.position.y = BELT.top + (H - BELT.top) / 2;
  g.add(curtain);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.26),
    new THREE.MeshBasicMaterial({ map: signTex([{ text: `${st.emoji} ${st.label} x${def.upgrader!.mult}`, size: 64, color: '#fff' }], 'rgba(20,20,26,0.92)', st.color), transparent: true }),
  );
  sign.position.set(0, H + 0.32, 0);
  g.add(sign);
  const sign2 = sign.clone();
  sign2.rotation.y = Math.PI;
  g.add(sign2);
  // Effect-specific dressing.
  if (fx === 'paint') {
    for (const s of [-1, 1]) {
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 10), mat('#e64980', 0.4, 0.3));
      nozzle.rotation.x = (s * Math.PI) / 2;
      nozzle.position.set(0, 0.75, s * (span - 0.1));
      g.add(nozzle);
    }
  } else if (fx === 'wrap') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, span * 2, 18), mat('#d0ebff', 0.1, 0, { transparent: true, opacity: 0.8 }));
    roll.rotation.x = Math.PI / 2;
    roll.position.y = H + 0.24;
    roll.position.x = 0.18;
    g.add(roll);
  } else if (fx === 'hat') {
    const hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24), mat('#111', 0.6));
    hat.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.36, 24), mat('#111', 0.6));
    crown.position.y = 0.19;
    hat.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.06, 24), mat('#c92a2a', 0.5));
    band.position.y = 0.05;
    hat.add(band);
    hat.position.y = H + 0.16;
    hat.rotation.z = 0.15;
    g.add(hat);
    sign.position.x = -0.3;
    sign2.position.x = 0.3;
  } else if (fx === 'gold') {
    for (const s of [-1, 1]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), mat('#ffd43b', 0.2, 1, { emissive: '#ff922b', emissiveIntensity: 0.6 }));
      coil.position.set(0, 0.7, s * (span - 0.05));
      g.add(coil);
    }
  }
  g.position.set(at.x, 0, at.z);
  shadowed(g);
  curtain.castShadow = false;
  let flash = 0;
  return {
    group: g,
    colliders: [-1, 1].map((s) => ({ half: [0.06, H / 2, 0.05], pos: [at.x, H / 2, at.z + s * span] })),
    pulse: () => (flash = 1),
    animate: (dt, t) => {
      flash = Math.max(0, flash - dt * 3);
      curtainM.opacity = 0.22 + 0.1 * Math.sin(t * 6) + 0.5 * flash;
    },
  };
}

/* ------------------------------------------------------------------ furnace + tank */

export function buildFurnace(): Piece & { mouths: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const { hx, hz } = FURNACE;
  const H = 1.7;
  const body = rbox(hx * 2, H, hz * 2, 0.05, mat('#5a3e36', 0.85, 0.1));
  body.position.y = H / 2;
  g.add(body);
  const bandM = mat('#2b2b2b', 0.4, 0.8);
  for (const y of [0.25, 1.45]) {
    const band = rbox(hx * 2 + 0.04, 0.08, hz * 2 + 0.04, 0.02, bandM);
    band.position.y = y;
    g.add(band);
  }
  const mouths = mat('#ff6b00', 0.6, 0, { emissive: '#ff5a00', emissiveIntensity: 3 });
  for (const line of ['A', 'B'] as const) {
    const z = LINES[line].z - FURNACE.z;
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.52), mouths);
    mouth.position.set(-hx - 0.005, BELT.top + 0.26, z);
    mouth.rotation.y = -Math.PI / 2;
    g.add(mouth);
    const hood = rbox(0.24, 0.12, 0.8, 0.02, bandM);
    hood.position.set(-hx - 0.08, BELT.top + 0.6, z);
    g.add(hood);
  }
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 16), bandM);
  chimney.position.set(0.25, H + 0.7, 0.6);
  g.add(chimney);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.3),
    new THREE.MeshBasicMaterial({ map: signTex([{ text: '🔥 FURNACE', size: 70, color: '#ffd8a8' }], 'rgba(30,18,12,0.95)', '#ff922b'), transparent: true }),
  );
  label.position.set(-hx - 0.01, 1.32, 0);
  label.rotation.y = -Math.PI / 2;
  g.add(label);
  g.position.set(FURNACE.x, 0, FURNACE.z);
  shadowed(g);
  let heat = 0;
  return {
    group: g,
    mouths,
    colliders: [{ half: [hx, H / 2, hz], pos: [FURNACE.x, H / 2, FURNACE.z] }],
    pulse: () => (heat = 1),
    animate: (dt, t) => {
      heat = Math.max(0, heat - dt * 2);
      mouths.emissiveIntensity = 2.4 + Math.sin(t * 13) * 0.3 + Math.sin(t * 7.3) * 0.3 + heat * 2;
    },
  };
}

export function buildTank(): Piece & { setFill(f: number): void } {
  const g = new THREE.Group();
  const { r, h } = TANK;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.08, 0.12, 24), darkSteel);
  base.position.y = 0.06;
  g.add(base);
  const cap = base.clone();
  cap.position.y = h + 0.12;
  g.add(cap);
  const liquidM = mat('#ffc078', 0.2, 0.9, { emissive: '#f08c00', emissiveIntensity: 0.9 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.03, r - 0.03, 1, 24), liquidM);
  liquid.position.y = 0.12;
  g.add(liquid);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 28, 1, true),
    new THREE.MeshPhysicalMaterial({ color: '#e7f5ff', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.28, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
  );
  glass.position.y = 0.12 + h / 2;
  g.add(glass);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10), steel);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(-0.48, 0.5, 0);
  g.add(pipe);
  g.position.set(TANK.x, 0, TANK.z);
  shadowed(g);
  glass.castShadow = false;
  let fill = 0;
  let shown = 0;
  return {
    group: g,
    colliders: [{ half: [r, (h + 0.18) / 2, r], pos: [TANK.x, (h + 0.18) / 2, TANK.z] }],
    keep: [liquid],
    setFill: (f) => (fill = THREE.MathUtils.clamp(f, 0, 1)),
    animate: (dt, t) => {
      shown += (fill - shown) * Math.min(1, dt * 4);
      const hh = Math.max(0.001, shown * (h - 0.02));
      liquid.scale.y = hh;
      liquid.position.y = 0.12 + hh / 2;
      liquidM.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.2;
    },
  };
}

/* ------------------------------------------------------------------ robot */

export function buildRobot(): Piece & { celebrate(): void } {
  const g = new THREE.Group();
  const bodyM = mat('#e9ecef', 0.35, 0.4);
  const body = rbox(0.34, 0.36, 0.28, 0.06, bodyM);
  body.position.y = 0.32;
  g.add(body);
  const head = rbox(0.26, 0.2, 0.22, 0.06, bodyM);
  head.position.y = 0.62;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshBasicMaterial({ color: '#3bc9db', toneMapped: false }));
  visor.position.set(0, 0.63, -0.112);
  visor.rotation.y = Math.PI;
  g.add(visor);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), darkSteel);
  antenna.position.y = 0.79;
  g.add(antenna);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat('#ffffff', 0.3, 0, { emissive: '#ff6b6b', emissiveIntensity: 2 }));
  bulb.position.y = 0.87;
  g.add(bulb);
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), darkSteel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 0.17, 0.09, 0);
    g.add(wheel);
  }
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.2, 0.44, 0);
    const arm = rbox(0.05, 0.22, 0.05, 0.02, darkSteel);
    arm.position.y = -0.1;
    pivot.add(arm);
    g.add(pivot);
    arms.push(pivot);
  }
  const home = new THREE.Vector3(6.15, 0, 5.75);
  g.position.copy(home);
  g.rotation.y = Math.PI * 0.85;
  shadowed(g);
  visor.castShadow = false;
  let party = 0;
  return {
    group: g,
    colliders: [],
    keep: [g],
    celebrate: () => (party = 2),
    animate: (dt, t) => {
      party = Math.max(0, party - dt);
      g.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02 + (party > 0 ? Math.abs(Math.sin(party * 8)) * 0.12 : 0);
      g.rotation.y = Math.PI * 0.85 + Math.sin(t * 0.7) * 0.4 + party * Math.PI * 2;
      arms.forEach((a, i) => (a.rotation.x = party > 0 ? Math.sin(t * 18 + i * Math.PI) * 1.4 : Math.sin(t * 2 + i) * 0.15));
    },
  };
}

/* ------------------------------------------------------------------ speed + decor */

export function buildSpeed(def: PadDef, level: number): Piece {
  const g = new THREE.Group();
  const fans: THREE.Object3D[] = [];
  for (const line of ['A', 'B'] as const) {
    const L = LINES[line];
    const motor = new THREE.Group();
    const box = rbox(0.3, 0.32, 0.4, 0.03, mat(level === 1 ? '#f76707' : '#d6336c', 0.4, 0.4));
    box.position.y = 0.16;
    motor.add(box);
    const fan = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blade = rbox(0.02, 0.2, 0.05, 0.01, steel);
      blade.rotation.x = (i * Math.PI * 2) / 3;
      blade.position.set(0, Math.cos((i * Math.PI * 2) / 3) * 0.08, Math.sin((i * Math.PI * 2) / 3) * 0.08);
      fan.add(blade);
    }
    fan.position.set(-0.17, 0.18, 0);
    motor.add(fan);
    fans.push(fan);
    const bolt = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: emojiTex('⚡', '#ffd43b') }));
    bolt.position.set(0, 0.2, -0.205);
    bolt.rotation.y = Math.PI;
    motor.add(bolt);
    motor.position.set(L.x0 - 0.2, 0, L.z + (level === 1 ? -0.12 : 0.12));
    g.add(motor);
  }
  shadowed(g);
  void def;
  return {
    group: g,
    colliders: (['A', 'B'] as const).map((l) => ({ half: [0.15, 0.16, 0.2], pos: [LINES[l].x0 - 0.2, 0.16, LINES[l].z + (level === 1 ? -0.12 : 0.12)] })),
    keep: fans,
    animate: (dt) => fans.forEach((f) => (f.rotation.x += dt * 30)),
  };
}

export function buildDecor(def: PadDef, plot: { x0: number; x1: number; z0: number; z1: number }): Piece {
  const g = new THREE.Group();
  const colliders: BoxSpec[] = [];
  let animate: Piece['animate'];
  const keep: THREE.Object3D[] = [];
  if (def.id === 'deco_rails') {
    // Safety rails along the back of the plot, plus painted walkway arrows.
    const z = plot.z1 + 0.12;
    const x0 = plot.x0;
    const x1 = 4.2;
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 5) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 10), yellow);
      post.position.set(x, 0.45, z);
      g.add(post);
    }
    for (const y of [0.85, 0.45]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, x1 - x0, 10), yellow);
      rail.rotation.z = Math.PI / 2;
      rail.position.set((x0 + x1) / 2, y, z);
      g.add(rail);
    }
    colliders.push({ half: [(x1 - x0) / 2, 0.45, 0.04], pos: [(x0 + x1) / 2, 0.45, z] });
    const arrowTex = signTex([{ text: '➜ ➜ ➜', size: 90, color: '#ffffff' }], 'rgba(0,0,0,0)', 'rgba(0,0,0,0)');
    for (const z2 of [4.45, 7.0]) {
      const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, opacity: 0.55, depthWrite: false }));
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(0.3, 0.005, z2);
      g.add(arrow);
    }
  } else {
    // Neon tubes on the walls + a disco ball.
    const neon = (color: string, len: number, pos: THREE.Vector3, ry: number, vertical = false) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 10), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      if (!vertical) m.rotation.z = Math.PI / 2;
      m.rotation.y = ry;
      m.position.copy(pos);
      g.add(m);
    };
    neon('#ff4fd8', 3.2, new THREE.Vector3(-1.2, 2.55, 2.75), 0);
    neon('#3bf0ff', 3.2, new THREE.Vector3(-1.2, 2.45, 2.75), 0);
    neon('#ff4fd8', 3.6, new THREE.Vector3(-3.35, 2.55, 7.0), Math.PI / 2);
    neon('#3bf0ff', 3.6, new THREE.Vector3(-3.35, 2.45, 7.0), Math.PI / 2);
    neon('#a9ff3b', 2.0, new THREE.Vector3(6.55, 1.6, 6.9), Math.PI / 2);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 2), mat('#dee2e6', 0.08, 1, { flatShading: true, emissive: '#5f3dc4', emissiveIntensity: 0.25 }));
    ball.position.set(1.6, 2.45, 7.0);
    g.add(ball);
    keep.push(ball);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 4), darkSteel);
    string.position.set(1.6, 2.78, 7.0);
    g.add(string);
    animate = (dt, t) => {
      ball.rotation.y += dt * 0.8;
      (ball.material as THREE.MeshStandardMaterial).emissive.setHSL((t * 0.1) % 1, 0.8, 0.35);
    };
  }
  shadowed(g);
  return { group: g, colliders, animate, keep };
}
