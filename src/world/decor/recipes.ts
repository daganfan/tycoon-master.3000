import * as THREE from 'three';
import { M, at, box, capsule, cone, cyl, googly, heartPts, labelMap, lathe, pivot, slab, sph, starPts, torus, tube } from './kit';
import type { Behavior, Recipe } from './types';

/**
 * Junk Mart model recipes, keyed by decor id. All sizes are metres; models sit
 * on y = 0 and face +Z. Colliders are derived from the bounding box.
 */

const PI = Math.PI;
const H = PI / 2;

function duck(g: THREE.Object3D, x: number, z: number, s: number, ry = 0, color = '#ffd21f'): void {
  const y = M.plastic(color, { roughness: 0.3 });
  const d = pivot([x, 0, z]);
  d.rotation.y = ry;
  d.add(sph(0.05 * s, y, [0, 0.042 * s, 0], [1.25, 0.85, 1]));
  d.add(sph(0.032 * s, y, [0.04 * s, 0.095 * s, 0]));
  d.add(cone(0.012 * s, 0.03 * s, M.plastic('#ff7a1a'), [0.077 * s, 0.09 * s, 0], [0, 0, -H]));
  for (const k of [-1, 1]) d.add(sph(0.005 * s, M.plastic('#111'), [0.06 * s, 0.105 * s, k * 0.017 * s]));
  d.add(cone(0.02 * s, 0.03 * s, y, [-0.06 * s, 0.07 * s, 0], [0, 0, 0.9]));
  g.add(d);
}

function pot(g: THREE.Object3D, r: number, h: number, color: string, glaze = false): void {
  g.add(lathe([[r * 0.72, 0], [r * 0.8, 0.02], [r, h * 0.92], [r * 1.07, h * 0.93], [r * 1.07, h], [r * 0.92, h], [r * 0.9, h * 0.94]], glaze ? M.ceramic(color) : M.matte(color)));
  g.add(cyl(r * 0.88, r * 0.88, 0.01, M.matte('#3b2a1e'), [0, h * 0.9, 0]));
}

function frame(g: THREE.Object3D, w: number, h: number, wood: THREE.Material, inner: THREE.Material, y = h / 2): void {
  g.add(box(w, h, 0.025, wood, [0, y, 0.0125], undefined, 0.004));
  g.add(box(w - 0.04, h - 0.04, 0.006, inner, [0, y, 0.026]));
}

function bill(color = '#6aa56a'): THREE.MeshStandardMaterial {
  return M.paper(color);
}

/* ---------------------------------------------------------------- recipes */

export const DECOR_RECIPES: Record<string, Recipe> = {
  /* ---------- Desk Toys ---------- */
  rubber_chicken: {
    density: 250, restitution: 0.55,
    build(g) {
      const y = M.rubber('#f4d03f');
      const o = M.rubber('#f39c12');
      const r = M.rubber('#e5322d');
      g.add(capsule(0.032, 0.13, y, [0, 0.034, 0], [0, 0, H]));
      g.add(tube([[0.07, 0.04, 0], [0.1, 0.08, 0], [0.115, 0.13, 0]], 0.016, y));
      g.add(sph(0.025, y, [0.12, 0.15, 0]));
      g.add(cone(0.01, 0.035, o, [0.155, 0.148, 0], [0, 0, -H]));
      for (const s of [-1, 1]) g.add(sph(0.005, M.plastic('#111'), [0.135, 0.16, s * 0.018]));
      g.add(cone(0.009, 0.022, r, [0.112, 0.18, 0]), cone(0.009, 0.02, r, [0.127, 0.178, 0]));
      g.add(sph(0.007, r, [0.145, 0.128, 0], [1, 1.6, 0.6]));
      g.add(tube([[-0.08, 0.04, 0], [-0.115, 0.06, 0], [-0.125, 0.09, 0]], 0.012, y));
      for (const s of [-1, 1]) g.add(box(0.035, 0.006, 0.022, o, [0.0, 0.003, s * 0.022], undefined, 0.002));
      return [{ k: 'squeak', pitch: 1.35 }];
    },
  },
  bobblehead: {
    density: 500,
    build(g) {
      g.add(cyl(0.045, 0.05, 0.02, M.wood('#3b2618', 0.4), [0, 0.01, 0]));
      g.add(box(0.06, 0.07, 0.035, M.plastic('#1f2a44'), [0, 0.056, 0], undefined, 0.012));
      g.add(box(0.012, 0.045, 0.004, M.plastic('#c0392b'), [0, 0.06, 0.018]));
      g.add(box(0.03, 0.02, 0.003, M.plastic('#ffffff'), [0, 0.082, 0.0165]));
      const head = pivot([0, 0.092, 0]);
      head.add(cyl(0.006, 0.006, 0.02, M.metal('#999'), [0, 0.008, 0]));
      head.add(sph(0.038, M.plastic('#f1c27d'), [0, 0.04, 0]));
      head.add(sph(0.04, M.plastic('#3a2a1a'), [0, 0.052, -0.006], [1, 0.75, 1]));
      head.add(googly(0.008, 0.014, [0, 0.045, 0.034]));
      head.add(torus(0.012, 0.003, M.plastic('#7a2a1a'), [0, 0.024, 0.033], [0, 0, PI], PI));
      g.add(head);
      return [{ k: 'wobble', node: head, amp: 0.5 }];
    },
  },
  desk_cactus: {
    density: 600, collider: 'cyl',
    build(g) {
      pot(g, 0.04, 0.06, '#c96b4a');
      const green = M.matte('#3c8d4a', { roughness: 0.6 });
      g.add(capsule(0.024, 0.07, green, [0, 0.11, 0]));
      g.add(capsule(0.012, 0.025, green, [0.03, 0.12, 0], [0, 0, -0.9]));
      g.add(capsule(0.011, 0.02, green, [-0.028, 0.1, 0], [0, 0, 0.9]));
      g.add(sph(0.011, M.plastic('#ff6fa8'), [0, 0.168, 0]));
      const spine = M.matte('#f6f1d5');
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        g.add(cone(0.0015, 0.008, spine, [Math.cos(a) * 0.025, 0.085 + (i % 5) * 0.012, Math.sin(a) * 0.025], [Math.sin(a) * H, 0, -Math.cos(a) * H], 4));
      }
    },
  },
  ball_pendulum: {
    density: 900,
    build(g) {
      g.add(box(0.18, 0.016, 0.1, M.wood('#2c1d12', 0.35), [0, 0.008, 0], undefined, 0.004));
      const c = M.chrome();
      for (const z of [-0.035, 0.035]) {
        for (const x of [-0.08, 0.08]) g.add(cyl(0.003, 0.003, 0.13, c, [x, 0.081, z]));
        g.add(cyl(0.003, 0.003, 0.16, c, [0, 0.146, z], [0, 0, H]));
      }
      const fx: Behavior[] = [];
      for (let i = 0; i < 5; i++) {
        const x = -0.04 + i * 0.02;
        const p = pivot([x, 0.146, 0]);
        for (const z of [-0.035, 0.035]) p.add(tube([[0, 0, z], [0, -0.08, 0]], 0.0006, c, 2));
        p.add(sph(0.01, c, [0, -0.09, 0]));
        g.add(p);
        if (i === 0) fx.push({ k: 'sway', node: p, axis: 'z', amp: 0.6, freq: 0.7, half: -1 });
        if (i === 4) fx.push({ k: 'sway', node: p, axis: 'z', amp: 0.6, freq: 0.7, half: 1, phase: PI });
      }
      return fx;
    },
  },
  stress_brain: {
    density: 150, restitution: 0.75, collider: 'ball',
    build(g) {
      const pink = M.rubber('#f29bb0');
      g.add(sph(0.045, pink, [0, 0.04, 0], [1.15, 0.85, 1]));
      const fold = M.rubber('#e07f98');
      for (let i = 0; i < 6; i++) g.add(torus(0.03, 0.006, fold, [-0.03 + i * 0.012, 0.05, 0], [0, H, 0.3 * (i % 2 ? 1 : -1)], PI));
      g.add(box(0.002, 0.03, 0.08, M.rubber('#c96a82'), [0, 0.075, 0]));
      return [{ k: 'squeak', pitch: 0.85 }];
    },
  },
  desk_spinner: {
    density: 1500, collider: 'cyl',
    build(g) {
      g.add(cyl(0.04, 0.045, 0.012, M.metal('#2b2b30', 0.25), [0, 0.006, 0]));
      g.add(cyl(0.004, 0.004, 0.05, M.chrome(), [0, 0.035, 0]));
      const top = pivot([0, 0.06, 0]);
      const c = M.plastic('#e8443a');
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        top.add(box(0.05, 0.008, 0.012, c, [Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025], [0, -a, 0], 0.003));
        top.add(cyl(0.012, 0.012, 0.012, M.chrome(), [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05]));
      }
      top.add(cyl(0.01, 0.01, 0.014, M.gold()));
      g.add(top);
      return [{ k: 'spin', node: top, axis: 'y', speed: 9 }];
    },
  },
  zen_garden: {
    density: 700,
    build(g) {
      const wood = M.wood('#6b4a2e', 0.5);
      g.add(box(0.24, 0.01, 0.16, wood, [0, 0.005, 0]));
      for (const [w, d, x, z] of [[0.24, 0.012, 0, 0.074], [0.24, 0.012, 0, -0.074], [0.012, 0.16, 0.114, 0], [0.012, 0.16, -0.114, 0]] as const)
        g.add(box(w, 0.03, d, wood, [x, 0.02, z], undefined, 0.002));
      g.add(box(0.215, 0.012, 0.135, M.matte('#e6d7b2', { roughness: 1 }), [0, 0.014, 0]));
      const rake = M.matte('#d9c79f');
      for (let i = 0; i < 6; i++) g.add(torus(0.02 + i * 0.008, 0.0015, rake, [0.05, 0.02, 0.01], [H, 0, 0], PI * 1.1));
      g.add(sph(0.022, M.stone('#6e6a66'), [0.05, 0.028, 0.01], [1, 0.6, 0.85], 10));
      g.add(sph(0.016, M.stone('#8a857f'), [-0.06, 0.024, -0.03], [1.2, 0.55, 1], 10));
      g.add(sph(0.01, M.stone('#55524f'), [-0.03, 0.022, 0.035], [1, 0.6, 1], 8));
      g.add(cyl(0.002, 0.002, 0.12, wood, [-0.04, 0.03, 0.05], [0, 0.4, H]));
      g.add(box(0.004, 0.006, 0.04, wood, [-0.095, 0.026, 0.074], [0, 0.4, 0]));
    },
  },
  fortune_ball: {
    density: 900,
    build(g) {
      g.add(torus(0.026, 0.008, M.wood('#2a1a10', 0.4), [0, 0.008, 0], [H, 0, 0]));
      g.add(sph(0.04, M.plastic('#0d0d10', { roughness: 0.08, clearcoat: 1 }), [0, 0.047, 0]));
      g.add(cyl(0.017, 0.017, 0.004, M.plastic('#f4f4f4'), [0, 0.06, 0.034], [1.2, 0, 0]));
      g.add(cone(0.009, 0.006, M.glow('#3b6bff', 0.8), [0, 0.06, 0.0365], [1.2 - H, 0, 0], 3));
    },
  },
  duck_squad: {
    density: 200,
    build(g) {
      duck(g, 0.06, 0, 1, 0);
      duck(g, 0.0, -0.05, 0.8, 0);
      duck(g, 0.0, 0.05, 0.8, 0);
      duck(g, -0.06, -0.09, 0.7, 0, '#ff6fa8');
      duck(g, -0.06, 0.09, 0.7, 0, '#6fd3ff');
      return [{ k: 'squeak', pitch: 1.7 }];
    },
  },
  dipping_bird: {
    density: 700,
    build(g) {
      g.add(box(0.09, 0.01, 0.07, M.wood('#7b5233'), [0, 0.005, 0], undefined, 0.003));
      const brass = M.brass();
      for (const x of [-0.03, 0.03]) g.add(cyl(0.003, 0.004, 0.1, brass, [x, 0.055, 0]));
      g.add(cyl(0.025, 0.022, 0.045, M.glass('#d8f4ff'), [0.0, 0.032, 0.045]));
      g.add(cyl(0.021, 0.019, 0.03, M.water('#8fd6ff'), [0.0, 0.026, 0.045]));
      const bird = pivot([0, 0.1, 0]);
      bird.add(cyl(0.004, 0.004, 0.065, M.metal('#888'), [0, 0, 0], [H, 0, 0]));
      bird.add(cyl(0.005, 0.005, 0.11, M.glass(), [0, 0.0, 0]));
      bird.add(sph(0.018, M.glow('#e8303a', 0.25), [0, -0.055, 0]));
      bird.add(sph(0.016, M.plastic('#e8303a'), [0, 0.06, 0]));
      bird.add(cone(0.005, 0.03, M.plastic('#222'), [0, 0.058, 0.026], [H, 0, 0]));
      bird.add(cyl(0.014, 0.014, 0.022, M.plastic('#111'), [0, 0.082, 0]));
      bird.add(cyl(0.022, 0.022, 0.003, M.plastic('#111'), [0, 0.072, 0]));
      g.add(bird);
      return [{ k: 'sway', node: bird, axis: 'x', amp: 0.9, freq: 0.35, half: 1 }];
    },
  },

  /* ---------- Wall Stuff ---------- */
  neon_open: {
    density: 300, light: { color: '#ff3d9a', intensity: 0.9, distance: 2.4, y: 0.14 },
    build(g) {
      g.add(box(0.62, 0.28, 0.015, M.plastic('#15151a', { roughness: 0.2 }), [0, 0.14, 0.0075], undefined, 0.01));
      const pink = M.glow('#ff3d9a', 2.2);
      const blue = M.glow('#3dd8ff', 2);
      const w = 0.56;
      const h = 0.22;
      g.add(tube([[-w / 2, 0.03, 0.03], [w / 2, 0.03, 0.03]], 0.005, blue, 2));
      g.add(tube([[-w / 2, 0.25, 0.03], [w / 2, 0.25, 0.03]], 0.005, blue, 2));
      g.add(tube([[-w / 2, 0.03, 0.03], [-w / 2, 0.03 + h, 0.03]], 0.005, blue, 2));
      g.add(tube([[w / 2, 0.03, 0.03], [w / 2, 0.03 + h, 0.03]], 0.005, blue, 2));
      const map = labelMap('OPEN 24/7', '#000000', '#ffffff', 512, 160, 'bold 110px "Trebuchet MS", sans-serif');
      if (map) {
        const m = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff3d9a', emissiveIntensity: 2.2, emissiveMap: map, transparent: true, alphaMap: map });
        m.userData.noSkin = true;
        g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), m), 0, 0.14, 0.022));
        return [{ k: 'pulse', mat: m, base: 2.1, amp: 0.5, freq: 0.8 }, { k: 'pulse', mat: blue, base: 1.8, amp: 0.3, freq: 0.8 }];
      }
      for (let i = 0; i < 4; i++) g.add(torus(0.035, 0.005, pink, [-0.18 + i * 0.12, 0.14, 0.03]));
      return [{ k: 'pulse', mat: pink, base: 2, amp: 0.6, freq: 0.8 }];
    },
  },
  singing_bass: {
    density: 400,
    build(g) {
      g.add(box(0.38, 0.2, 0.02, M.wood('#5a3920', 0.45), [0, 0.1, 0.01], undefined, 0.01));
      g.add(box(0.1, 0.03, 0.004, M.gold(), [0, 0.03, 0.022]));
      const body = M.plastic('#5d7a3a', { roughness: 0.35 });
      g.add(sph(0.06, body, [0, 0.11, 0.05], [2, 0.9, 0.45]));
      g.add(sph(0.05, M.plastic('#d8d6a8'), [0.0, 0.09, 0.058], [1.9, 0.55, 0.38]));
      g.add(sph(0.011, M.plastic('#ffffff', { roughness: 0.2 }), [0.08, 0.125, 0.07]), sph(0.005, M.plastic('#111'), [0.083, 0.124, 0.08]));
      const mouth = pivot([0.115, 0.105, 0.05]);
      mouth.add(sph(0.022, M.plastic('#3a1a1a'), [0, -0.005, 0], [0.8, 0.5, 0.8]));
      g.add(mouth);
      const tail = pivot([-0.115, 0.11, 0.05]);
      tail.add(slab([[0, 0], [-0.06, 0.04], [-0.05, 0], [-0.06, -0.04]], 0.008, body));
      g.add(tail);
      g.add(slab([[-0.03, 0], [0.03, 0], [0, 0.035]], 0.004, body, [0, 0.155, 0.045]));
      return [{ k: 'sing', node: tail, mouth }];
    },
  },
  backwards_clock: {
    density: 400, collider: 'box',
    build(g) {
      g.add(cyl(0.15, 0.15, 0.03, M.plastic('#f6f3ec'), [0, 0.15, 0.015], [H, 0, 0], 48));
      g.add(torus(0.15, 0.012, M.metal('#2c2c2c', 0.3), [0, 0.15, 0.025]));
      const mark = M.matte('#222');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        g.add(box(0.008, i % 3 ? 0.012 : 0.025, 0.003, mark, [Math.sin(a) * 0.12, 0.15 + Math.cos(a) * 0.12, 0.032], [0, 0, -a]));
      }
      const hr = pivot([0, 0.15, 0.034], box(0.01, 0.07, 0.003, mark, [0, 0.03, 0]));
      const mn = pivot([0, 0.15, 0.037], box(0.006, 0.105, 0.003, mark, [0, 0.045, 0]));
      const sc = pivot([0, 0.15, 0.04], box(0.003, 0.12, 0.002, M.plastic('#d33'), [0, 0.04, 0]));
      g.add(hr, mn, sc, cyl(0.008, 0.008, 0.01, M.metal('#333'), [0, 0.15, 0.04], [H, 0, 0]));
      return [{ k: 'spin', node: sc, axis: 'z', speed: PI / 30 }, { k: 'spin', node: mn, axis: 'z', speed: PI / 1800 * 20 }, { k: 'spin', node: hr, axis: 'z', speed: PI / 21600 * 20 }];
    },
  },
  dartboard: {
    density: 500,
    build(g) {
      const rings: [number, string][] = [[0.2, '#1b1b1b'], [0.17, '#c33a2c'], [0.16, '#efe2c4'], [0.105, '#2f8a3b'], [0.095, '#1b1b1b'], [0.025, '#2f8a3b'], [0.012, '#c33a2c']];
      rings.forEach(([r, c], i) => g.add(cyl(r, r, 0.03 + i * 0.002, M.matte(c), [0, 0.2, 0.015 + i * 0.001], [H, 0, 0], 48)));
      const wire = M.metal('#ccc', 0.3);
      for (let i = 0; i < 10; i++) g.add(box(0.002, 0.34, 0.002, wire, [0, 0.2, 0.033], [0, 0, (i / 10) * PI]));
      g.add(cyl(0.004, 0.0015, 0.08, M.metal('#888'), [0.04, 0.23, 0.07], [H, 0, 0]));
      g.add(cone(0.012, 0.03, M.plastic('#2f7bff'), [0.04, 0.23, 0.12], [-H, 0, 0], 3));
    },
  },
  platinum_disc: {
    density: 500,
    build(g) {
      frame(g, 0.34, 0.42, M.plastic('#111', { roughness: 0.2 }), M.matte('#f4f1ea'));
      g.add(cyl(0.11, 0.11, 0.004, M.metal('#e5e4e2', 0.12), [0, 0.24, 0.03], [H, 0, 0], 48));
      g.add(cyl(0.035, 0.035, 0.005, M.matte('#b2263a'), [0, 0.24, 0.031], [H, 0, 0]));
      g.add(cyl(0.004, 0.004, 0.006, M.matte('#111'), [0, 0.24, 0.032], [H, 0, 0]));
      g.add(box(0.14, 0.03, 0.004, M.metal('#d7d7d7', 0.2), [0, 0.07, 0.03]));
    },
  },
  mounted_sock: {
    density: 300,
    build(g) {
      g.add(slab([[-0.12, 0], [0.12, 0], [0.13, 0.2], [0, 0.28], [-0.13, 0.2]], 0.02, M.wood('#5a3920', 0.4), [0, 0, 0.01]));
      g.add(box(0.08, 0.02, 0.004, M.gold(), [0, 0.04, 0.026]));
      const sock = M.fabric('#d9473b');
      g.add(capsule(0.03, 0.09, sock, [0, 0.16, 0.05]));
      g.add(capsule(0.028, 0.06, sock, [0.035, 0.09, 0.05], [0, 0, H]));
      g.add(cyl(0.032, 0.032, 0.03, M.fabric('#f2f2f2'), [0, 0.23, 0.05]));
      g.add(sph(0.029, M.fabric('#f2f2f2'), [0.075, 0.09, 0.05]));
    },
  },
  first_dollar: {
    density: 400,
    build(g) {
      frame(g, 0.26, 0.18, M.wood('#3a2416', 0.35), M.matte('#f3ead2'));
      g.add(box(0.17, 0.075, 0.002, bill('#86b37e'), [0, 0.095, 0.03]));
      g.add(cyl(0.022, 0.022, 0.002, M.paper('#5e8a57'), [0, 0.095, 0.0315], [H, 0, 0]));
      g.add(box(0.06, 0.012, 0.003, M.gold(), [0, 0.035, 0.03]));
    },
  },
  pennant: {
    density: 150,
    build(g, v) {
      const c = ['#1f4fa8', '#b8262f'][v % 2]!;
      g.add(cyl(0.005, 0.005, 0.12, M.wood('#a07d55'), [-0.2, 0.06, 0.006]));
      g.add(slab([[-0.2, 0.0], [0.22, 0.04], [-0.2, 0.11]], 0.004, M.fabric(c), [0, 0.01, 0.006]));
      g.add(slab([[-0.17, 0.035], [0.05, 0.05], [-0.17, 0.075]], 0.004, M.fabric('#ffffff'), [0, 0.01, 0.009]));
    },
  },
  moose_head: {
    density: 250,
    build(g) {
      g.add(slab([[-0.14, 0], [0.14, 0], [0.16, 0.22], [0, 0.32], [-0.16, 0.22]], 0.025, M.wood('#4a2f1b', 0.4), [0, 0, 0.0125]));
      const fur = M.matte('#6b4528', { roughness: 0.9 });
      g.add(sph(0.08, fur, [0, 0.17, 0.08], [0.9, 1, 1.1]));
      g.add(capsule(0.05, 0.1, fur, [0, 0.13, 0.17], [1.25, 0, 0]));
      g.add(sph(0.055, M.matte('#4d311d'), [0, 0.095, 0.24], [1, 0.85, 1.1]));
      for (const s of [-1, 1]) {
        g.add(sph(0.01, M.plastic('#111', { roughness: 0.1 }), [s * 0.045, 0.2, 0.15]));
        g.add(sph(0.006, M.matte('#2a1a10'), [s * 0.02, 0.09, 0.29]));
        g.add(cone(0.02, 0.06, fur, [s * 0.085, 0.24, 0.07], [0, 0, -s * 1.1]));
        const antler = M.matte('#d9c8a2', { roughness: 0.7 });
        const a = pivot([s * 0.07, 0.26, 0.06]);
        a.rotation.z = -s * 0.5;
        a.add(cyl(0.01, 0.012, 0.08, antler, [0, 0.04, 0]));
        a.add(slab([[-0.02, 0], [0.12, 0.02], [0.14, 0.09], [0.1, 0.06], [0.08, 0.11], [0.05, 0.06], [0.02, 0.1], [-0.01, 0.05]], 0.012, antler, [0, 0.07, 0], [0, s > 0 ? 0 : PI, 0]));
        g.add(a);
      }
    },
  },
  fake_window: {
    density: 300, light: { color: '#ffa860', intensity: 0.8, distance: 2.6, y: 0.25 },
    build(g) {
      const fr = M.plastic('#f5f2ea');
      g.add(box(0.5, 0.5, 0.02, fr, [0, 0.25, 0.01], undefined, 0.005));
      const sky = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff9a55', emissiveIntensity: 1.3 });
      sky.userData.noSkin = true;
      if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 128;
        const x = c.getContext('2d');
        if (x) {
          const gr = x.createLinearGradient(0, 0, 0, 128);
          for (const [s, col] of [[0, '#2b2f7a'], [0.45, '#c2508a'], [0.7, '#ff9a55'], [0.72, '#ffe08a'], [0.74, '#1c2a4a'], [1, '#0d1626']] as const) gr.addColorStop(s, col);
          x.fillStyle = gr;
          x.fillRect(0, 0, 64, 128);
          x.fillStyle = '#fff4b0';
          x.beginPath();
          x.arc(40, 88, 12, PI, 0);
          x.fill();
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace;
          sky.emissiveMap = t;
          sky.emissive.set('#ffffff');
        }
      }
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), sky), 0, 0.25, 0.021));
      g.add(box(0.02, 0.44, 0.02, fr, [0, 0.25, 0.028]), box(0.44, 0.02, 0.02, fr, [0, 0.25, 0.028]));
      g.add(box(0.56, 0.025, 0.07, fr, [0, 0.0125, 0.035], undefined, 0.005));
      return [{ k: 'pulse', mat: sky, base: 1.2, amp: 0.15, freq: 0.1 }];
    },
  },

  /* ---------- Floor Junk ---------- */
  traffic_cone: {
    density: 220, collider: 'cyl',
    build(g) {
      g.add(box(0.3, 0.025, 0.3, M.rubber('#1d1d1d'), [0, 0.0125, 0], undefined, 0.02));
      g.add(lathe([[0.13, 0.02], [0.11, 0.1], [0.035, 0.44], [0.0, 0.45]], M.plastic('#ff6a13', { roughness: 0.45 })));
      const refl = M.plastic('#f6f6f6', { roughness: 0.15, metalness: 0.2 });
      g.add(cyl(0.077, 0.093, 0.06, refl, [0, 0.21, 0], undefined, 28, true));
      g.add(cyl(0.052, 0.064, 0.04, refl, [0, 0.33, 0], undefined, 28, true));
    },
  },
  giant_pencil: {
    density: 250,
    build(g) {
      const L = 0.9;
      const r = 0.045;
      const body = pivot([0, r, 0]);
      body.rotation.z = H;
      body.add(cyl(r, r, L, M.plastic('#f6c90e', { roughness: 0.4 }), [0, 0, 0], undefined, 6));
      body.add(cone(r, 0.13, M.wood('#e4c08b', 0.7), [0, -L / 2 - 0.065, 0], [PI, 0, 0], 6));
      body.add(cone(r * 0.32, 0.04, M.metal('#2a2a2a', 0.5), [0, -L / 2 - 0.11, 0], [PI, 0, 0], 12));
      body.add(cyl(r * 1.04, r * 1.04, 0.05, M.metal('#bfbfbf', 0.3), [0, L / 2 + 0.025, 0]));
      body.add(cyl(r, r, 0.06, M.rubber('#f08a9a'), [0, L / 2 + 0.08, 0]));
      g.add(body);
    },
  },
  bowling_pin: {
    density: 260, collider: 'cyl', restitution: 0.3,
    build(g) {
      g.add(lathe([[0.03, 0], [0.058, 0.04], [0.062, 0.1], [0.045, 0.18], [0.024, 0.24], [0.026, 0.28], [0.034, 0.32], [0.028, 0.36], [0.0, 0.38]], M.ceramic('#fbfbf7')));
      const red = M.plastic('#d32a2a');
      g.add(cyl(0.0255, 0.0245, 0.012, red, [0, 0.245, 0], undefined, 28, true));
      g.add(cyl(0.0265, 0.0258, 0.008, red, [0, 0.265, 0], undefined, 28, true));
    },
  },
  beanbag_shark: {
    density: 90, restitution: 0.25, friction: 0.9,
    build(g) {
      const grey = M.fabric('#6f8798');
      g.add(sph(0.2, grey, [0, 0.16, 0], [2, 0.8, 1]));
      g.add(sph(0.17, M.fabric('#eef1f3'), [0.03, 0.11, 0], [2, 0.55, 0.92]));
      g.add(slab([[-0.08, 0], [0.08, 0], [-0.03, 0.15]], 0.04, grey, [0, 0.29, 0], undefined, 0.012));
      g.add(slab([[0, 0], [-0.16, 0.14], [-0.1, 0], [-0.16, -0.1]], 0.04, grey, [-0.38, 0.17, 0], undefined, 0.012));
      for (const s of [-1, 1]) {
        g.add(slab([[0, 0], [-0.1, -0.03], [-0.06, 0.03]], 0.02, grey, [0.1, 0.1, s * 0.16], [0, 0, -0.3], 0.008));
        g.add(sph(0.014, M.plastic('#111', { roughness: 0.1 }), [0.3, 0.2, s * 0.09]));
      }
      for (let i = 0; i < 7; i++) g.add(cone(0.008, 0.018, M.fabric('#ffffff'), [0.33 + Math.sin(i) * 0.005, 0.12, -0.06 + i * 0.02], [PI, 0, 0], 6));
      g.add(torus(0.065, 0.008, M.fabric('#c24b5a'), [0.33, 0.135, 0], [H, -0.15, H], PI));
    },
  },
  pool_flamingo: {
    density: 25, restitution: 0.6, linearDamping: 0.6,
    build(g) {
      const pink = M.plastic('#ff7fae', { roughness: 0.25, clearcoat: 0.8 });
      g.add(torus(0.22, 0.08, pink, [0, 0.08, 0], [H, 0, 0]));
      g.add(tube([[-0.0, 0.14, -0.2], [0.0, 0.35, -0.24], [0.0, 0.5, -0.17], [0, 0.48, -0.08]], 0.035, pink));
      g.add(sph(0.06, pink, [0, 0.5, -0.12]));
      g.add(cone(0.025, 0.08, M.plastic('#2a2a2a'), [0, 0.47, -0.05], [H + 0.5, 0, 0]));
      g.add(googly(0.012, 0.03, [0, 0.52, -0.075]));
      g.add(slab([[0, 0], [0.12, 0.05], [0.02, 0.1]], 0.03, pink, [0, 0.12, 0.2], [0, -H, 0], 0.01));
      return [{ k: 'float', gravity: 0.35 }];
    },
  },
  cardboard_me: {
    density: 120,
    build(g) {
      const card = M.paper('#b98a5a');
      const pts: [number, number][] = [[-0.18, 0], [0.18, 0], [0.17, 0.78], [0.25, 1.0], [0.22, 1.18], [0.09, 1.25], [0.11, 1.42], [0, 1.5], [-0.11, 1.42], [-0.09, 1.25], [-0.22, 1.18], [-0.25, 1.0], [-0.17, 0.78]];
      g.add(slab(pts, 0.008, card, [0, 0, 0], undefined, 0));
      g.add(slab([[-0.16, 0.02], [0.16, 0.02], [0.15, 0.78], [-0.15, 0.78]], 0.002, M.paper('#3a5a8c'), [0, 0, 0.006], undefined, 0));
      g.add(slab([[-0.2, 0.75], [0.2, 0.75], [0.22, 1.18], [0.08, 1.24], [-0.08, 1.24], [-0.22, 1.18]], 0.002, M.paper('#e8833a'), [0, 0, 0.006], undefined, 0));
      g.add(cyl(0.09, 0.09, 0.003, M.paper('#f1c27d'), [0, 1.36, 0.006], [H, 0, 0]));
      g.add(slab([[-0.1, 1.38], [0.1, 1.38], [0.08, 1.47], [-0.08, 1.47]], 0.002, M.paper('#3a2414'), [0, 0, 0.008], undefined, 0));
      g.add(torus(0.035, 0.005, M.paper('#5a2a1a'), [0, 1.33, 0.008], [0, 0, PI], PI));
      for (const s of [-1, 1]) g.add(cyl(0.008, 0.008, 0.002, M.paper('#111'), [s * 0.03, 1.375, 0.009], [H, 0, 0]));
      g.add(slab([[0, 0], [0.32, 0], [0, 0.7]], 0.008, card, [0, 0, -0.004], [0, H, 0], 0));
    },
  },
  boom_box: {
    density: 300,
    build(g) {
      g.add(box(0.48, 0.24, 0.12, M.plastic('#c9ccd1', { metalness: 0.5, roughness: 0.3 }), [0, 0.12, 0], undefined, 0.02));
      g.add(box(0.48, 0.05, 0.122, M.plastic('#26272b'), [0, 0.215, 0], undefined, 0.015));
      g.add(tube([[-0.18, 0.24, 0], [-0.17, 0.31, 0], [0.17, 0.31, 0], [0.18, 0.24, 0]], 0.01, M.chrome(), 16));
      const fx: Behavior[] = [];
      for (const x of [-0.15, 0.15]) {
        g.add(torus(0.075, 0.008, M.chrome(), [x, 0.11, 0.062]));
        const sp = pivot([x, 0.11, 0.058]);
        sp.add(cone(0.07, 0.03, M.rubber('#1a1a1a'), [0, 0, 0.0], [-H, 0, 0], 32));
        sp.add(sph(0.02, M.rubber('#333'), [0, 0, 0.005], [1, 1, 0.5]));
        g.add(sp);
        fx.push({ k: 'thump', node: sp, bpm: 96 });
      }
      g.add(box(0.1, 0.06, 0.01, M.plastic('#1a1a1a', { roughness: 0.1 }), [0, 0.12, 0.06]));
      g.add(box(0.05, 0.025, 0.012, M.glass('#ccdfff'), [0, 0.12, 0.062]));
      const led = M.glow('#ff3030', 2);
      g.add(sph(0.006, led, [-0.02, 0.18, 0.062]), sph(0.006, M.glow('#30ff60', 2), [0.0, 0.18, 0.062]));
      for (let i = 0; i < 6; i++) g.add(box(0.016, 0.012, 0.01, M.plastic('#777'), [-0.1 + i * 0.04, 0.24, 0.035], undefined, 0.002));
      return fx;
    },
  },
  hamster_wheel: {
    density: 400,
    build(g) {
      const base = M.plastic('#3aa0d8');
      g.add(box(0.26, 0.02, 0.18, base, [0, 0.01, 0], undefined, 0.008));
      for (const x of [-0.08, 0.08]) g.add(box(0.012, 0.18, 0.025, base, [x, 0.1, 0], undefined, 0.004));
      const wheel = pivot([0, 0.17, 0]);
      const wire = M.metal('#d7d9dc', 0.25);
      for (const x of [-0.07, 0.07]) wheel.add(torus(0.14, 0.006, wire, [x, 0, 0], [0, H, 0]));
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * PI * 2;
        wheel.add(cyl(0.003, 0.003, 0.14, wire, [0, Math.cos(a) * 0.14, Math.sin(a) * 0.14], [0, 0, H]));
      }
      wheel.add(cyl(0.01, 0.01, 0.17, M.chrome(), [0, 0, 0], [0, 0, H]));
      g.add(wheel);
      return [{ k: 'spin', node: wheel, axis: 'x', speed: 2.2 }];
    },
  },
  gnome: {
    density: 600,
    build(g) {
      g.add(box(0.05, 0.03, 0.08, M.plastic('#2a1d14'), [-0.035, 0.015, 0.01], undefined, 0.01), box(0.05, 0.03, 0.08, M.plastic('#2a1d14'), [0.035, 0.015, 0.01], undefined, 0.01));
      g.add(lathe([[0.075, 0.02], [0.08, 0.1], [0.06, 0.18], [0.0, 0.2]], M.plastic('#2f5fb0')));
      g.add(cyl(0.077, 0.077, 0.02, M.plastic('#4a2a14'), [0, 0.1, 0]));
      g.add(sph(0.05, M.plastic('#f2c29a'), [0, 0.22, 0]));
      g.add(cone(0.055, 0.12, M.plastic('#f6f6f2', { roughness: 0.6 }), [0, 0.17, 0.03], [PI + 0.2, 0, 0]));
      g.add(sph(0.017, M.plastic('#f29b8a'), [0, 0.22, 0.05]));
      for (const s of [-1, 1]) g.add(sph(0.006, M.plastic('#111'), [s * 0.02, 0.24, 0.044]));
      g.add(cone(0.056, 0.17, M.plastic('#d4282f'), [0, 0.32, -0.01], [-0.18, 0, 0]));
      return [{ k: 'haunt', mode: 'hop', interval: 9 }];
    },
  },
  exercise_ball: {
    density: 40, restitution: 0.82, collider: 'ball', friction: 0.6,
    build(g) {
      g.add(sph(0.3, M.plastic('#7b4fd6', { roughness: 0.25, clearcoat: 0.6 }), [0, 0.3, 0], undefined, 40));
      g.add(cyl(0.012, 0.012, 0.01, M.plastic('#5b36a8'), [0, 0.6, 0]));
    },
  },

  /* ---------- Trophies & Shrines ---------- */
  participation_trophy: {
    density: 600,
    build(g) {
      g.add(box(0.08, 0.04, 0.08, M.stone('#1d1d1f'), [0, 0.02, 0], undefined, 0.004));
      g.add(box(0.05, 0.015, 0.002, M.gold(0.3), [0, 0.02, 0.041]));
      const gold = M.metal('#e8c04a', 0.3);
      g.add(lathe([[0.025, 0.04], [0.02, 0.05], [0.006, 0.08], [0.006, 0.1], [0.012, 0.11], [0.04, 0.17], [0.042, 0.19], [0.038, 0.19], [0.0, 0.13]], gold));
      for (const s of [-1, 1]) g.add(torus(0.022, 0.004, gold, [s * 0.042, 0.155, 0], [0, 0, s > 0 ? -H : H], PI));
      g.add(slab(starPts(0.018, 0.008), 0.004, gold, [0, 0.215, 0]));
    },
  },
  golden_mouse: {
    density: 1200,
    build(g) {
      g.add(box(0.14, 0.05, 0.12, M.marble(), [0, 0.025, 0], undefined, 0.006));
      g.add(box(0.08, 0.015, 0.002, M.gold(0.3), [0, 0.025, 0.061]));
      const gold = M.gold(0.12);
      g.add(sph(0.035, gold, [0, 0.068, 0], [0.9, 0.55, 1.4]));
      g.add(box(0.002, 0.01, 0.03, M.metal('#b88a20', 0.3), [0, 0.082, 0.025]));
      g.add(cyl(0.006, 0.006, 0.01, M.metal('#b88a20', 0.3), [0, 0.085, 0.022], [H, 0, 0]));
      g.add(tube([[0, 0.06, 0.05], [0.0, 0.055, 0.07], [0.03, 0.052, 0.08]], 0.003, gold, 12));
    },
  },
  coin_shrine: {
    density: 500, light: { color: '#ffc04a', intensity: 0.5, distance: 1.4, y: 0.1 },
    build(g) {
      const red = M.plastic('#b3261e', { roughness: 0.5 });
      g.add(box(0.18, 0.02, 0.12, M.wood('#2c1a0f', 0.5), [0, 0.01, 0], undefined, 0.004));
      for (const x of [-0.07, 0.07]) g.add(cyl(0.007, 0.007, 0.13, red, [x, 0.085, 0.03]));
      g.add(box(0.2, 0.012, 0.025, red, [0, 0.14, 0.03], undefined, 0.003));
      g.add(box(0.23, 0.014, 0.03, M.plastic('#222'), [0, 0.155, 0.03], [0, 0, 0], 0.004));
      const coin = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.2, emissive: '#ff9a00', emissiveIntensity: 0.4 });
      coin.userData.noSkin = true;
      const c = pivot([0, 0.075, -0.01], cyl(0.035, 0.035, 0.008, coin, [0, 0, 0], [H, 0, 0], 40));
      g.add(c);
      g.add(cyl(0.008, 0.008, 0.02, M.paper('#f6efe0'), [0.05, 0.03, -0.03]));
      return [{ k: 'pulse', mat: coin, base: 0.45, amp: 0.3, freq: 0.5 }, { k: 'spin', node: c, axis: 'y', speed: 0.8 }];
    },
  },
  employee_plaque: {
    density: 500,
    build(g) {
      g.add(box(0.15, 0.19, 0.012, M.wood('#5a3920', 0.4), [0, 0.095, 0], [-0.15, 0, 0], 0.004));
      g.add(box(0.11, 0.1, 0.003, M.paper('#dfe8f4'), [0, 0.12, 0.0075], [-0.15, 0, 0]));
      g.add(sph(0.025, M.paper('#f1c27d'), [0, 0.125, 0.012], [1, 1, 0.15]));
      g.add(box(0.1, 0.03, 0.003, M.gold(0.3), [0, 0.04, 0.01], [-0.15, 0, 0]));
      g.add(box(0.012, 0.12, 0.012, M.wood('#5a3920'), [0, 0.06, -0.04], [0.35, 0, 0]));
    },
  },
  blue_ribbon: {
    density: 300,
    build(g) {
      g.add(slab([[-0.02, 0], [0.0, -0.08], [0.012, -0.06], [0.025, -0.085], [0.025, 0]], 0.003, M.fabric('#1f4fa8'), [0, 0.003, 0.0], [H, 0, 0], 0));
      for (let i = 0; i < 16; i++) g.add(box(0.03, 0.004, 0.012, M.fabric('#2a62c9'), [Math.cos(i * 0.39) * 0.035, 0.006, Math.sin(i * 0.39) * 0.035], [0, -i * 0.39, 0]));
      g.add(cyl(0.03, 0.03, 0.008, M.fabric('#1f4fa8'), [0, 0.008, 0]));
      g.add(cyl(0.02, 0.02, 0.01, M.gold(0.3), [0, 0.01, 0]));
    },
  },
  skull_candle: {
    density: 700, light: { color: '#ff9a3c', intensity: 0.6, distance: 1.6, y: 0.2 },
    build(g) {
      const bone = M.ceramic('#efe8d8');
      g.add(sph(0.06, bone, [0, 0.075, 0], [1, 0.95, 1.1]));
      g.add(box(0.07, 0.035, 0.05, bone, [0, 0.025, 0.035], undefined, 0.015));
      const dark = M.matte('#1a1412');
      for (const s of [-1, 1]) g.add(sph(0.016, dark, [s * 0.024, 0.08, 0.055], [1, 1.1, 0.5]));
      g.add(cone(0.008, 0.014, dark, [0, 0.055, 0.064], [-H + 0.4, 0, 0], 3));
      for (let i = 0; i < 5; i++) g.add(box(0.008, 0.012, 0.004, dark, [-0.02 + i * 0.01, 0.03, 0.061]));
      g.add(cyl(0.02, 0.022, 0.06, M.ceramic('#f4efe6'), [0, 0.155, 0]));
      for (let i = 0; i < 4; i++) g.add(capsule(0.004, 0.015 + (i % 2) * 0.01, M.ceramic('#f4efe6'), [Math.cos(i * 1.6) * 0.021, 0.16 - (i % 2) * 0.01, Math.sin(i * 1.6) * 0.021]));
      g.add(cyl(0.001, 0.001, 0.01, dark, [0, 0.19, 0]));
      const flame = M.glow('#ffb14a', 3);
      g.add(sph(0.008, flame, [0, 0.202, 0], [1, 2, 1]));
      return [{ k: 'flicker', mat: flame, base: 3 }];
    },
  },
  desk_globe: {
    density: 500,
    build(g) {
      const brass = M.brass();
      g.add(cyl(0.05, 0.06, 0.015, M.wood('#3a2416', 0.4), [0, 0.0075, 0]));
      g.add(cyl(0.006, 0.008, 0.04, brass, [0, 0.035, 0]));
      const tilt = pivot([0, 0.13, 0]);
      tilt.rotation.z = 0.41;
      tilt.add(torus(0.085, 0.004, brass, [0, 0, 0], [0, 0, 0], PI * 1.2));
      const globe = pivot();
      globe.add(sph(0.075, M.plastic('#2d7fc4', { roughness: 0.3 }), [0, 0, 0], undefined, 32));
      const land = M.matte('#6aa84f', { roughness: 0.7 });
      const blobs: [number, number, number][] = [[0.3, 0.5, 1.3], [0.9, -0.4, 1], [2.2, 0.3, 1.2], [3.1, -0.2, 0.9], [4.2, 0.6, 1.1], [5.2, -0.5, 0.8], [1.6, 1.0, 0.7]];
      for (const [lon, lat, s] of blobs) {
        const m = sph(0.03 * s, land, [Math.cos(lon) * Math.cos(lat) * 0.068, Math.sin(lat) * 0.068, Math.sin(lon) * Math.cos(lat) * 0.068], [1, 1, 1], 12);
        m.scale.set(1, 1, 1);
        m.lookAt(0, 0, 0);
        m.scale.set(1, 0.7, 0.28);
        globe.add(m);
      }
      tilt.add(globe);
      g.add(tilt);
      return [{ k: 'spin', node: globe, axis: 'y', speed: 0.6 }];
    },
  },
  marble_bust: {
    density: 700,
    build(g) {
      const mb = M.marble();
      g.add(box(0.36, 0.06, 0.36, mb, [0, 0.03, 0], undefined, 0.01));
      g.add(cyl(0.12, 0.13, 0.7, mb, [0, 0.41, 0], undefined, 16));
      g.add(box(0.32, 0.05, 0.32, mb, [0, 0.785, 0], undefined, 0.01));
      g.add(sph(0.16, mb, [0, 0.86, 0], [1.1, 0.55, 0.7]));
      g.add(cyl(0.05, 0.055, 0.08, mb, [0, 0.96, 0]));
      g.add(sph(0.09, mb, [0, 1.06, 0.01], [0.9, 1.1, 1]));
      g.add(cone(0.018, 0.04, mb, [0, 1.06, 0.1], [H, 0, 0], 12));
      g.add(sph(0.095, M.stone('#e4e1d8'), [0, 1.11, -0.01], [0.95, 0.7, 1]));
      for (const s of [-1, 1]) g.add(sph(0.022, mb, [s * 0.085, 1.06, 0], [0.5, 1, 0.8]));
      g.add(box(0.14, 0.03, 0.004, M.gold(0.3), [0, 0.7, 0.13]));
    },
  },
  velvet_rope: {
    density: 400,
    build(g) {
      const brass = M.brass();
      for (const x of [-0.35, 0.35]) {
        g.add(cyl(0.12, 0.13, 0.03, brass, [x, 0.015, 0]));
        g.add(cyl(0.02, 0.02, 0.85, brass, [x, 0.45, 0]));
        g.add(sph(0.04, brass, [x, 0.9, 0]));
      }
      g.add(tube([[-0.33, 0.84, 0], [-0.15, 0.68, 0], [0, 0.64, 0], [0.15, 0.68, 0], [0.33, 0.84, 0]], 0.022, M.fabric('#9e1b2c'), 32));
    },
  },
  tiny_podium: {
    density: 500,
    build(g) {
      const white = M.plastic('#f5f5f2');
      const blocks: [number, number, string][] = [[0, 0.08, '#e8b730'], [-0.06, 0.055, '#c0c4c8'], [0.06, 0.04, '#c07a3a']];
      for (const [x, h, c] of blocks) {
        g.add(box(0.06, h, 0.06, white, [x, h / 2, 0], undefined, 0.004));
        g.add(box(0.062, 0.006, 0.062, M.metal(c, 0.25), [x, h + 0.003, 0]));
      }
      g.add(box(0.012, 0.03, 0.002, M.matte('#222'), [0, 0.04, 0.031]));
    },
  },

  /* ---------- Gadgets ---------- */
  lava_ocean: {
    density: 600, collider: 'cyl', light: { color: '#3dbbff', intensity: 1.1, distance: 2.6, y: 0.4 },
    build(g) {
      const chrome = M.chrome();
      g.add(lathe([[0.11, 0], [0.11, 0.02], [0.07, 0.2], [0.075, 0.21], [0.0, 0.21]], chrome));
      g.add(lathe([[0.072, 0.21], [0.11, 0.45], [0.06, 0.68], [0.0, 0.68]], M.glass('#6fd7ff', { thickness: 0.08 })));
      const goo = M.glow('#2a9dff', 1.3);
      const fx: Behavior[] = [];
      for (let i = 0; i < 4; i++) {
        const p = pivot([Math.sin(i * 2) * 0.03, 0.32 + i * 0.07, Math.cos(i * 2) * 0.03], sph(0.03 - i * 0.003, goo, [0, 0, 0], [1, 1.3, 1]));
        g.add(p);
        fx.push({ k: 'bob', node: p, amp: 0.08, freq: 0.08 + i * 0.03, phase: i * 1.7 });
      }
      g.add(lathe([[0.06, 0.68], [0.04, 0.78], [0.0, 0.79]], chrome));
      fx.push({ k: 'pulse', mat: goo, base: 1.2, amp: 0.3, freq: 0.2 });
      return fx;
    },
  },
  lava_cosmic: {
    density: 700, collider: 'cyl', light: { color: '#b03dff', intensity: 0.7, distance: 2, y: 0.2 },
    build(g) {
      const base = M.metal('#202028', 0.25);
      g.add(lathe([[0.055, 0], [0.055, 0.01], [0.035, 0.09], [0.0, 0.09]], base));
      g.add(lathe([[0.035, 0.09], [0.055, 0.2], [0.03, 0.31], [0.0, 0.31]], M.glass('#e0d0ff')));
      const goo = M.glow('#b03dff', 1.4);
      const fx: Behavior[] = [];
      for (let i = 0; i < 3; i++) {
        const p = pivot([Math.sin(i * 2.2) * 0.012, 0.14 + i * 0.05, 0], sph(0.017, goo, [0, 0, 0], [1, 1.4, 1]));
        g.add(p);
        fx.push({ k: 'bob', node: p, amp: 0.04, freq: 0.12 + i * 0.05, phase: i * 2.1 });
      }
      g.add(lathe([[0.03, 0.31], [0.02, 0.35], [0.0, 0.355]], base));
      fx.push({ k: 'hue', mat: goo, speed: 0.06, light: 1 });
      return fx;
    },
  },
  disco_ball: {
    density: 300, light: { color: '#ffffff', intensity: 0.9, distance: 3, y: 1.0 },
    build(g) {
      const black = M.metal('#1c1c1f', 0.4);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        g.add(cyl(0.008, 0.008, 0.5, black, [Math.cos(a) * 0.1, 0.22, Math.sin(a) * 0.1], [Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42]));
      }
      g.add(cyl(0.012, 0.012, 0.42, black, [0, 0.62, 0]));
      const ball = pivot([0, 0.95, 0]);
      const mirror = new THREE.MeshStandardMaterial({ color: '#f4f6fa', metalness: 1, roughness: 0.05, flatShading: true });
      ball.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 3), mirror));
      ball.add(cyl(0.006, 0.006, 0.12, M.chrome(), [0, -0.19, 0]));
      g.add(ball);
      return [{ k: 'spin', node: ball, axis: 'y', speed: 0.9 }, { k: 'hue', speed: 0.15, light: 1, sat: 0.8 }];
    },
  },
  plasma_orb: {
    density: 600, collider: 'cyl', light: { color: '#c06bff', intensity: 0.6, distance: 1.6, y: 0.14 },
    build(g) {
      g.add(lathe([[0.06, 0], [0.06, 0.02], [0.04, 0.06], [0.0, 0.06]], M.metal('#18181c', 0.3)));
      g.add(sph(0.075, M.glass('#f0e6ff'), [0, 0.135, 0], undefined, 32));
      const core = M.glow('#e6c4ff', 3);
      g.add(sph(0.015, core, [0, 0.135, 0]));
      const arcs = pivot([0, 0.135, 0]);
      const bolt = M.glow('#c06bff', 2.4);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        const b = Math.sin(i * 1.7) * 0.9;
        const end: [number, number, number] = [Math.cos(a) * Math.cos(b) * 0.07, Math.sin(b) * 0.07, Math.sin(a) * Math.cos(b) * 0.07];
        arcs.add(tube([[0, 0, 0], [end[0] * 0.4 + 0.01, end[1] * 0.5 - 0.01, end[2] * 0.4], [end[0] * 0.75, end[1] * 0.7 + 0.01, end[2] * 0.75], end], 0.0012, bolt, 12));
      }
      g.add(arcs);
      return [{ k: 'spin', node: arcs, axis: 'y', speed: 1.7 }, { k: 'pulse', mat: bolt, base: 2.2, amp: 1, freq: 3.1 }];
    },
  },
  retro_console: {
    density: 500,
    build(g) {
      const grey = M.plastic('#c7c3bb', { roughness: 0.5 });
      g.add(box(0.2, 0.05, 0.15, grey, [0, 0.025, 0], undefined, 0.01));
      g.add(box(0.09, 0.012, 0.03, M.plastic('#3a3a3e'), [0, 0.052, -0.02], undefined, 0.003));
      g.add(box(0.07, 0.04, 0.012, M.plastic('#6a3ad6'), [0, 0.07, -0.02], undefined, 0.003));
      g.add(sph(0.004, M.glow('#ff3030', 2), [-0.07, 0.04, 0.076]));
      for (const x of [-0.06, 0.06]) {
        const c = pivot([x, 0, 0.14]);
        c.rotation.y = x > 0 ? -0.3 : 0.3;
        c.add(box(0.1, 0.018, 0.045, M.plastic('#2c2c30'), [0, 0.009, 0], undefined, 0.008));
        c.add(box(0.022, 0.006, 0.007, M.plastic('#111'), [-0.025, 0.02, 0]), box(0.007, 0.006, 0.022, M.plastic('#111'), [-0.025, 0.02, 0]));
        c.add(cyl(0.006, 0.006, 0.006, M.plastic('#d33'), [0.02, 0.02, 0.005]), cyl(0.006, 0.006, 0.006, M.plastic('#33d'), [0.035, 0.02, -0.006]));
        g.add(c);
        g.add(tube([[x * 0.6, 0.02, 0.075], [x, 0.006, 0.1], [x, 0.008, 0.12]], 0.002, M.plastic('#222'), 12));
      }
    },
  },
  robo_vac: {
    density: 600, collider: 'cyl', friction: 0.5,
    build(g) {
      g.add(cyl(0.16, 0.16, 0.07, M.plastic('#2a2b30', { roughness: 0.25 }), [0, 0.04, 0], undefined, 40));
      g.add(torus(0.16, 0.012, M.metal('#9aa0a8', 0.3), [0, 0.035, 0], [H, 0, 0]));
      g.add(cyl(0.06, 0.06, 0.012, M.plastic('#111', { roughness: 0.1 }), [0, 0.08, -0.02]));
      g.add(cyl(0.012, 0.012, 0.006, M.glow('#3dff8a', 2), [0, 0.088, 0.06]));
      g.add(googly(0.022, 0.05, [0, 0.06, 0.15]));
      g.add(cyl(0.02, 0.02, 0.01, M.rubber('#111'), [0.0, 0.005, 0.1]));
      return [{ k: 'haunt', mode: 'roam', interval: 2.5 }];
    },
  },
  walkie_talkies: {
    density: 600,
    build(g) {
      for (const [x, c] of [[-0.035, '#f2c21b'], [0.035, '#2c2c30']] as const) {
        g.add(box(0.05, 0.13, 0.03, M.plastic(c), [x, 0.065, 0], undefined, 0.008));
        g.add(cyl(0.004, 0.005, 0.09, M.rubber('#111'), [x + 0.012, 0.175, 0]));
        g.add(box(0.035, 0.03, 0.004, M.plastic('#111'), [x, 0.045, 0.016], undefined, 0.002));
        g.add(box(0.03, 0.02, 0.003, M.glow('#9dff7a', 0.6), [x, 0.1, 0.016]));
      }
    },
  },
  mood_cube: {
    density: 600,
    build(g) {
      g.add(box(0.08, 0.015, 0.08, M.metal('#26262b', 0.3), [0, 0.0075, 0], undefined, 0.004));
      const glow = M.glow('#ff66cc', 1.2);
      g.add(box(0.07, 0.07, 0.07, glow, [0, 0.051, 0], undefined, 0.01));
      return [{ k: 'hue', mat: glow, speed: 0.08, sat: 0.7 }];
    },
  },
  typewriter: {
    density: 900,
    build(g) {
      const body = M.metal('#24402f', 0.35);
      g.add(box(0.3, 0.06, 0.22, body, [0, 0.03, 0], undefined, 0.02));
      g.add(box(0.28, 0.05, 0.1, body, [0, 0.08, -0.05], [-0.2, 0, 0], 0.02));
      g.add(cyl(0.025, 0.025, 0.34, M.rubber('#111'), [0, 0.12, -0.08], [0, 0, H]));
      g.add(box(0.2, 0.16, 0.002, M.paper('#f9f6ee'), [0, 0.2, -0.09], [-0.25, 0, 0]));
      const key = M.plastic('#efe8da');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 10; c++) g.add(cyl(0.008, 0.008, 0.008, key, [-0.11 + c * 0.024 + r * 0.008, 0.065 + r * 0.004, 0.08 - r * 0.025]));
      g.add(box(0.12, 0.008, 0.014, key, [0, 0.062, 0.1]));
      g.add(cyl(0.006, 0.006, 0.05, M.chrome(), [-0.18, 0.13, -0.08], [0, 0, H]));
    },
  },
  landline: {
    density: 700,
    build(g) {
      const beige = M.plastic('#e8dcc4', { roughness: 0.45 });
      g.add(box(0.16, 0.05, 0.18, beige, [0, 0.025, 0], [0.12, 0, 0], 0.015));
      g.add(box(0.07, 0.006, 0.09, M.plastic('#c9bda5'), [0.025, 0.06, 0.02], [0.12, 0, 0], 0.003));
      const handset = pivot([0, 0.075, -0.015]);
      handset.add(box(0.035, 0.022, 0.19, beige, [0, 0, 0], undefined, 0.01));
      for (const z of [-0.08, 0.08]) handset.add(box(0.05, 0.03, 0.05, beige, [0, -0.005, z], undefined, 0.012));
      handset.rotation.y = H;
      g.add(handset);
      const coil: [number, number, number][] = [];
      for (let i = 0; i <= 60; i++) coil.push([-0.09 - i * 0.0015, 0.03 + Math.sin(i * 1.2) * 0.008, 0.02 + Math.cos(i * 1.2) * 0.008 - i * 0.001]);
      g.add(tube(coil, 0.002, M.plastic('#d8ccb4'), 160));
    },
  },

  /* ---------- Plants & Pets ---------- */
  bonsai: {
    density: 700,
    build(g) {
      g.add(box(0.22, 0.05, 0.14, M.ceramic('#2d5b8c'), [0, 0.025, 0], undefined, 0.008));
      g.add(box(0.2, 0.008, 0.12, M.matte('#4b3a2a'), [0, 0.051, 0]));
      const bark = M.matte('#5a4130', { roughness: 0.9 });
      g.add(tube([[0, 0.05, 0], [0.02, 0.1, 0], [-0.03, 0.15, 0.01], [-0.01, 0.2, 0]], 0.012, bark, 20));
      g.add(tube([[-0.02, 0.14, 0.005], [0.04, 0.17, 0.01], [0.08, 0.18, 0]], 0.006, bark, 12));
      const leaf = M.matte('#3f7a3a', { roughness: 0.8 });
      for (const [x, y, z, s] of [[-0.01, 0.22, 0, 1], [0.08, 0.195, 0.0, 0.8], [-0.06, 0.19, 0.02, 0.7], [0.03, 0.235, -0.02, 0.6]] as const)
        g.add(sph(0.05 * s, leaf, [x, y, z], [1.4, 0.55, 1.1], 14));
      g.add(sph(0.012, M.stone('#9a958f'), [0.06, 0.06, 0.03], [1, 0.6, 1], 8));
    },
  },
  fish_tank: {
    density: 400, light: { color: '#5fd0ff', intensity: 0.7, distance: 2.2, y: 0.85 },
    build(g) {
      const cab = M.wood('#2b2622', 0.45);
      g.add(box(0.7, 0.5, 0.34, cab, [0, 0.25, 0], undefined, 0.01));
      g.add(box(0.32, 0.4, 0.004, M.wood('#3a332c', 0.4), [-0.165, 0.25, 0.171]), box(0.32, 0.4, 0.004, M.wood('#3a332c', 0.4), [0.165, 0.25, 0.171]));
      for (const x of [-0.03, 0.03]) g.add(box(0.008, 0.06, 0.012, M.chrome(), [x, 0.3, 0.178]));
      g.add(box(0.66, 0.4, 0.3, M.glass('#e8fbff', { thickness: 0.3 }), [0, 0.7, 0]));
      g.add(box(0.64, 0.34, 0.28, M.water('#5fc7e8'), [0, 0.68, 0]));
      g.add(box(0.64, 0.04, 0.28, M.stone('#d8c7a4'), [0, 0.52, 0]));
      g.add(box(0.68, 0.025, 0.32, M.plastic('#1b1b1b'), [0, 0.9125, 0], undefined, 0.006));
      const leaf = M.leaf('#2f9e4f');
      for (let i = 0; i < 6; i++) g.add(slab([[-0.01, 0], [0.01, 0], [0.005, 0.18 + (i % 3) * 0.04], [-0.005, 0.15]], 0.002, leaf, [-0.28 + i * 0.03 + (i > 2 ? 0.45 : 0), 0.54, -0.08 + (i % 2) * 0.06], [0, i, Math.sin(i) * 0.2], 0));
      g.add(sph(0.04, M.stone('#7a756e'), [0.1, 0.55, -0.06], [1.4, 0.8, 1]));
      const fx: Behavior[] = [];
      const fishCols = ['#ff7a1a', '#ffd21f', '#3d8bff'];
      for (let i = 0; i < 3; i++) {
        const f = pivot([0, 0.62 + i * 0.07, -0.06 + i * 0.06]);
        const m = M.plastic(fishCols[i]!, { roughness: 0.2 });
        f.add(sph(0.025, m, [0, 0, 0], [1.5, 1, 0.5]));
        f.add(cone(0.018, 0.03, m, [-0.045, 0, 0], [0, 0, H], 4));
        f.add(sph(0.004, M.plastic('#111'), [0.025, 0.006, 0.01]));
        g.add(f);
        fx.push({ k: 'swim', node: f, amp: 0.2, freq: 0.1 + i * 0.04, phase: i * 2 }, { k: 'bob', node: f, amp: 0.015, freq: 0.6, phase: i });
      }
      return fx;
    },
  },
  pet_rock: {
    density: 2400,
    build(g) {
      const geo = new THREE.IcosahedronGeometry(0.035, 1);
      const p = geo.attributes.position!;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + Math.sin(i * 12.9898) * 0.12;
        p.setXYZ(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.8, p.getZ(i) * k);
      }
      geo.computeVertexNormals();
      g.add(at(new THREE.Mesh(geo, M.stone('#8a8580')), 0, 0.028, 0));
      g.add(googly(0.009, 0.013, [0.0, 0.042, 0.03]));
    },
  },
  flytrap: {
    density: 500,
    build(g) {
      pot(g, 0.045, 0.07, '#5b7c99', true);
      const stem = M.matte('#4f8a3a');
      const fx: Behavior[] = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        const p = pivot([Math.cos(a) * 0.015, 0.07, Math.sin(a) * 0.015]);
        p.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
        p.add(cyl(0.003, 0.004, 0.09, stem, [0, 0.045, 0]));
        const trap = pivot([0, 0.1, 0]);
        for (const s of [-1, 1]) {
          const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 8, 0, PI), M.matte('#6aa84f', { side: THREE.DoubleSide }));
          lobe.rotation.set(0, s > 0 ? 0 : PI, s * 0.5);
          lobe.scale.set(1, 1, 0.5);
          trap.add(lobe);
          const inner = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 8, 0, PI), M.matte('#c0392b', { side: THREE.BackSide }));
          inner.rotation.copy(lobe.rotation);
          inner.scale.copy(lobe.scale);
          trap.add(inner);
        }
        p.add(trap);
        g.add(p);
        fx.push({ k: 'sway', node: trap, axis: 'z', amp: 0.3, freq: 0.3 + i * 0.1, phase: i });
      }
      return fx;
    },
  },
  sunflower: {
    density: 500,
    build(g) {
      g.add(cyl(0.035, 0.035, 0.09, M.metal('#c8ccd2', 0.25), [0, 0.045, 0]));
      g.add(cyl(0.0355, 0.0355, 0.05, M.paper('#d93a2b'), [0, 0.045, 0], undefined, 28, true));
      const stem = M.matte('#4f8a3a');
      g.add(tube([[0, 0.09, 0], [0.005, 0.18, 0], [0, 0.26, 0.02]], 0.004, stem, 12));
      g.add(slab([[0, 0], [0.04, 0.02], [0.05, 0.035], [0.01, 0.015]], 0.002, M.leaf('#4f8a3a'), [0.0, 0.15, 0]));
      const head = pivot([0, 0.28, 0.025]);
      head.rotation.x = -0.35;
      head.add(cyl(0.025, 0.025, 0.012, M.matte('#5a3417'), [0, 0, 0], [H, 0, 0]));
      const petal = M.matte('#f6c90e');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * PI * 2;
        head.add(sph(0.016, petal, [Math.cos(a) * 0.038, Math.sin(a) * 0.038, -0.002], [0.45, 1.1, 0.12], 10)).children.at(-1)!.rotation.set(0, 0, a - H);
      }
      g.add(head);
    },
  },
  goldfish_bowl: {
    density: 600, collider: 'cyl',
    build(g) {
      g.add(lathe([[0.03, 0], [0.07, 0.04], [0.08, 0.08], [0.07, 0.13], [0.05, 0.15], [0.055, 0.155]], M.glass('#e8fbff', { thickness: 0.15, side: THREE.DoubleSide })));
      g.add(lathe([[0.028, 0.005], [0.066, 0.04], [0.075, 0.08], [0.066, 0.12], [0.0, 0.12]], M.water('#7fd4ff')));
      g.add(cyl(0.045, 0.045, 0.015, M.stone('#e09a5a'), [0, 0.012, 0]));
      const f = pivot([0, 0.075, 0]);
      const orange = M.plastic('#ff7a1a', { roughness: 0.2 });
      f.add(sph(0.016, orange, [0, 0, 0], [1.4, 1, 0.6]));
      f.add(cone(0.012, 0.02, orange, [-0.026, 0, 0], [0, 0, H], 4));
      g.add(f);
      return [{ k: 'swim', node: f, amp: 0.035, freq: 0.25 }, { k: 'bob', node: f, amp: 0.008, freq: 0.5 }];
    },
  },
  office_palm: {
    density: 300,
    build(g) {
      pot(g, 0.13, 0.26, '#e8e4dc', true);
      const bark = M.matte('#7a5a3a', { roughness: 0.9 });
      for (let i = 0; i < 5; i++) g.add(cyl(0.025 - i * 0.002, 0.03 - i * 0.002, 0.13, bark, [Math.sin(i) * 0.01, 0.32 + i * 0.12, 0], undefined, 10));
      const leaf = M.leaf('#3f8f4a');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        const f = pivot([0, 0.88, 0]);
        f.rotation.y = a;
        f.add(tube([[0, 0, 0], [0.15, 0.08, 0], [0.32, 0.0, 0], [0.4, -0.16, 0]], 0.004, M.matte('#4a7a2a'), 12));
        for (let k = 0; k < 6; k++) f.add(slab([[0, 0], [0.04, 0.015], [0.08, 0]], 0.002, leaf, [0.06 + k * 0.055, 0.06 - k * k * 0.006, 0], [H - 0.3, 0, -0.2 - k * 0.1], 0));
        g.add(f);
      }
    },
  },
  cat_bed: {
    density: 100, collider: 'cyl', restitution: 0.1,
    build(g) {
      g.add(torus(0.22, 0.07, M.fabric('#7a8794'), [0, 0.07, 0], [H, 0, 0]));
      g.add(cyl(0.2, 0.2, 0.05, M.fabric('#d9d4cb'), [0, 0.03, 0], undefined, 36));
      g.add(cyl(0.03, 0.03, 0.01, M.fabric('#9aa5b0'), [0.08, 0.06, 0.04]), cyl(0.02, 0.02, 0.01, M.fabric('#9aa5b0'), [0.04, 0.06, 0.1]));
    },
  },
  glow_shroom: {
    density: 500, light: { color: '#5cf2ff', intensity: 0.45, distance: 1.4, y: 0.1 },
    build(g) {
      g.add(sph(0.06, M.matte('#4a3a2a'), [0, 0.0, 0], [1, 0.35, 1]));
      const glow = M.glow('#5cf2ff', 1.4);
      const stem = M.ceramic('#f2efe6');
      for (const [x, z, h, r] of [[0, 0, 0.12, 0.045], [0.04, 0.025, 0.07, 0.028], [-0.035, 0.02, 0.05, 0.022]] as const) {
        g.add(cyl(r * 0.3, r * 0.4, h, stem, [x, h / 2, z]));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, PI * 2, 0, H), glow)).children.at(-1)!.position.set(x, h - 0.003, z);
      }
      return [{ k: 'pulse', mat: glow, base: 1.3, amp: 0.5, freq: 0.25 }];
    },
  },
  ant_farm: {
    density: 700,
    build(g) {
      const green = M.plastic('#3aa35a');
      g.add(box(0.2, 0.02, 0.05, green, [0, 0.01, 0], undefined, 0.004));
      g.add(box(0.18, 0.14, 0.012, M.matte('#c9a46a', { roughness: 1 }), [0, 0.09, 0]));
      g.add(box(0.18, 0.04, 0.0125, M.matte('#e8d8b0'), [0, 0.17, 0]));
      const dark = M.matte('#6b4a2a');
      g.add(tube([[-0.07, 0.15, 0.0065], [-0.05, 0.1, 0.0065], [0.0, 0.08, 0.0065], [0.05, 0.05, 0.0065], [0.07, 0.11, 0.0065]], 0.004, dark, 20));
      for (let i = 0; i < 6; i++) g.add(sph(0.002, M.plastic('#111'), [-0.06 + i * 0.024, 0.06 + Math.sin(i * 2) * 0.04, 0.008]));
      g.add(box(0.2, 0.17, 0.02, M.glass(), [0, 0.105, 0]));
      g.add(box(0.2, 0.012, 0.022, green, [0, 0.196, 0], undefined, 0.003));
    },
  },

  /* ---------- Absurd Luxuries ---------- */
  gold_toilet: {
    density: 1400, friction: 0.9,
    build(g) {
      const gold = M.gold(0.12);
      g.add(lathe([[0.1, 0], [0.11, 0.015], [0.075, 0.08], [0.07, 0.2], [0.0, 0.2]], gold, [0, 0, 0.06]));
      const bowl = lathe([[0.0, 0.2], [0.12, 0.22], [0.18, 0.33], [0.19, 0.4], [0.16, 0.405], [0.15, 0.39], [0.1, 0.3]], gold, [0, 0, 0.06]);
      bowl.scale.set(1, 1, 1.25);
      g.add(bowl);
      const seat = torus(0.15, 0.022, M.gold(0.25), [0, 0.42, 0.065], [H, 0, 0]);
      seat.scale.set(1, 1.25, 1);
      g.add(seat);
      g.add(box(0.36, 0.33, 0.17, gold, [0, 0.58, -0.17], undefined, 0.03));
      g.add(box(0.38, 0.03, 0.19, gold, [0, 0.76, -0.17], undefined, 0.01));
      g.add(box(0.05, 0.015, 0.02, M.chrome(), [0.12, 0.7, -0.075]));
      const lid = box(0.34, 0.02, 0.38, M.gold(0.25), [0, 0.6, -0.05], [-1.35, 0, 0], 0.03);
      g.add(lid);
    },
  },
  diamond_weight: {
    density: 1000,
    build(g) {
      g.add(box(0.12, 0.035, 0.12, M.fabric('#8c1c2c'), [0, 0.0175, 0], undefined, 0.015));
      for (const [x, z] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]] as const) g.add(sph(0.007, M.gold(), [x, 0.035, z]));
      const ice = new THREE.MeshPhysicalMaterial({ color: '#eaf6ff', roughness: 0, metalness: 0, transmission: 1, ior: 2.4, thickness: 0.05, flatShading: true, dispersion: 0.4, iridescence: 0.3 });
      ice.userData.noSkin = true;
      const gem = pivot([0, 0.08, 0]);
      gem.add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.045, 8), ice)).children[0]!.rotation.set(PI, 0, 0);
      gem.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.015, 8), ice), 0, 0.03, 0));
      gem.children[0]!.position.y = 0.0;
      g.add(gem);
    },
  },
  caviar_tin: {
    density: 900,
    build(g) {
      g.add(cyl(0.05, 0.05, 0.03, M.metal('#24406b', 0.3), [0, 0.015, 0], undefined, 40));
      g.add(cyl(0.046, 0.046, 0.001, M.matte('#1a1a1a'), [0, 0.0305, 0]));
      g.add(torus(0.05, 0.003, M.gold(), [0, 0.03, 0], [H, 0, 0]));
      const lid = pivot([0, 0.03, -0.05]);
      lid.rotation.x = -1.2;
      lid.add(cyl(0.052, 0.052, 0.006, M.metal('#24406b', 0.3), [0, 0, 0.05], undefined, 40));
      lid.add(cyl(0.03, 0.03, 0.007, M.gold(), [0, 0, 0.05]));
      g.add(lid);
      g.add(box(0.008, 0.003, 0.09, M.ceramic('#f4eee6'), [0.065, 0.002, 0.01], [0, 0.3, 0]));
    },
  },
  gold_bars: {
    density: 2200,
    build(g) {
      const gold = M.gold(0.2);
      const bar = (x: number, y: number, z: number, ry = 0) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.05, 4), gold);
        b.rotation.y = PI / 4 + ry;
        b.scale.set(1.9, 1, 0.8);
        b.position.set(x, y + 0.025, z);
        g.add(b);
      };
      for (let i = 0; i < 3; i++) bar(-0.14 + i * 0.14, 0, 0);
      for (let i = 0; i < 2; i++) bar(-0.07 + i * 0.14, 0.05, 0);
      bar(0, 0.1, 0);
    },
  },
  juice_tower: {
    density: 500,
    build(g) {
      g.add(cyl(0.16, 0.16, 0.01, M.chrome(), [0, 0.005, 0], undefined, 48));
      const glass = M.glass('#ffffff');
      const juice = M.plastic('#6b1f5a', { roughness: 0.05, transmission: 0.3 });
      const coupe = (x: number, y: number, z: number) => {
        g.add(cyl(0.02, 0.02, 0.003, glass, [x, y + 0.002, z]));
        g.add(cyl(0.003, 0.003, 0.05, glass, [x, y + 0.028, z]));
        g.add(lathe([[0.003, 0.052], [0.035, 0.06], [0.045, 0.075], [0.044, 0.076]], glass, [x, y, z], 24));
        g.add(cyl(0.04, 0.012, 0.014, juice, [x, y + 0.066, z], undefined, 20));
      };
      const lv: [number, number][][] = [
        [[-0.09, -0.05], [0, -0.05], [0.09, -0.05], [-0.045, 0.05], [0.045, 0.05], [0, 0.12]],
        [[-0.045, -0.02], [0.045, -0.02], [0, 0.06]],
        [[0, 0.01]],
      ];
      lv.forEach((row, i) => row.forEach(([x, z]) => coupe(x, 0.01 + i * 0.077, z - 0.02)));
    },
  },
  velvet_throne: {
    density: 250,
    build(g) {
      const gold = M.gold(0.25);
      const velvet = M.fabric('#7a0f24');
      for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]] as const) g.add(lathe([[0.03, 0], [0.04, 0.05], [0.025, 0.2], [0.035, 0.38], [0.0, 0.38]], gold, [x, 0, z], 16));
      g.add(box(0.7, 0.12, 0.62, velvet, [0, 0.44, 0], undefined, 0.05));
      g.add(box(0.72, 0.04, 0.64, gold, [0, 0.38, 0], undefined, 0.01));
      g.add(slab([[-0.33, 0], [0.33, 0], [0.35, 0.65], [0.2, 0.8], [0, 0.86], [-0.2, 0.8], [-0.35, 0.65]], 0.1, velvet, [0, 0.48, -0.27], undefined, 0.03));
      g.add(tube([[-0.36, 0.5, -0.24], [-0.37, 1.1, -0.22], [-0.22, 1.29, -0.22], [0, 1.36, -0.22], [0.22, 1.29, -0.22], [0.37, 1.1, -0.22], [0.36, 0.5, -0.24]], 0.025, gold, 48));
      for (const s of [-1, 1]) {
        g.add(box(0.08, 0.06, 0.6, velvet, [s * 0.36, 0.66, 0], undefined, 0.025));
        g.add(cyl(0.02, 0.02, 0.2, gold, [s * 0.36, 0.55, 0.26]));
        g.add(sph(0.035, gold, [s * 0.36, 0.67, 0.3]));
      }
      for (let i = 0; i < 5; i++) g.add(cone(0.025, 0.08, gold, [-0.12 + i * 0.06, 1.42 - Math.abs(i - 2) * 0.02, -0.22], undefined, 8));
      g.add(sph(0.025, M.glow('#ff2030', 0.5), [0, 1.32, -0.18]));
    },
  },
  abstract_statue: {
    density: 600,
    build(g) {
      const mb = M.marble();
      g.add(box(0.36, 0.5, 0.36, mb, [0, 0.25, 0], undefined, 0.01));
      g.add(box(0.4, 0.04, 0.4, M.stone('#2a2a2a'), [0, 0.02, 0], undefined, 0.01));
      g.add(at(new THREE.Mesh(new THREE.TorusKnotGeometry(0.12, 0.035, 160, 20, 2, 3), mb), 0, 0.72, 0));
      g.add(sph(0.05, M.gold(0.15), [0.0, 0.92, 0]));
      g.add(box(0.12, 0.03, 0.004, M.gold(0.3), [0, 0.42, 0.182]));
    },
  },
  money_plant: {
    density: 350,
    build(g) {
      pot(g, 0.12, 0.22, '#e8b730', true);
      const bark = M.matte('#5a4130', { roughness: 0.9 });
      g.add(tube([[0, 0.2, 0], [0.02, 0.45, 0], [-0.02, 0.65, 0]], 0.02, bark, 16));
      const crown = pivot([0, 0.6, 0]);
      const fx: Behavior[] = [];
      const cash = bill('#7fb36e');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        const br = pivot([0, 0, 0]);
        br.rotation.y = a;
        br.add(tube([[0, 0, 0], [0.12, 0.08, 0], [0.24, 0.1, 0]], 0.008, bark, 8));
        for (let k = 0; k < 5; k++) {
          const b = box(0.07, 0.002, 0.032, cash, [0.06 + k * 0.045, 0.08 + Math.sin(k) * 0.03, (k % 2 ? 1 : -1) * 0.02], [0.3 * (k % 2 ? 1 : -1), k, 0.4]);
          br.add(b);
        }
        crown.add(br);
      }
      g.add(crown);
      fx.push({ k: 'sway', node: crown, axis: 'z', amp: 0.04, freq: 0.3 });
      return fx;
    },
  },
  indoor_jetski: {
    density: 180,
    build(g) {
      const hull = M.plastic('#f2f4f7', { roughness: 0.2, clearcoat: 1 });
      const teal = M.plastic('#11a3b5', { roughness: 0.2, clearcoat: 1 });
      g.add(box(1.1, 0.22, 0.44, hull, [0, 0.13, 0], undefined, 0.08));
      g.add(cone(0.11, 0.4, hull, [0.75, 0.13, 0], [0, 0, -H], 24)).children.at(-1)!.scale.set(1, 1, 2);
      g.add(box(0.9, 0.08, 0.4, teal, [0, 0.27, 0], undefined, 0.035));
      g.add(box(0.5, 0.1, 0.24, M.rubber('#1b1b1b'), [-0.15, 0.35, 0], undefined, 0.04));
      g.add(cyl(0.03, 0.03, 0.18, M.metal('#333', 0.4), [0.3, 0.38, 0], [0, 0, -0.5]));
      g.add(tube([[0.35, 0.47, -0.22], [0.36, 0.48, 0], [0.35, 0.47, 0.22]], 0.012, M.metal('#222', 0.3), 12));
      for (const s of [-1, 1]) g.add(capsule(0.016, 0.06, M.rubber('#111'), [0.35, 0.47, s * 0.22], [H, 0, 0]));
      g.add(slab([[0, 0], [0.2, 0], [0.08, 0.14]], 0.24, M.glass('#9fd8ff'), [0.42, 0.33, 0], [0, 0, 0], 0.01));
      g.add(box(0.06, 0.04, 0.46, M.metal('#2a2a2a', 0.4), [-0.53, 0.06, 0], undefined, 0.01));
    },
  },
  personal_atm: {
    density: 500,
    build(g) {
      const body = M.metal('#3a4150', 0.35);
      g.add(box(0.5, 1.4, 0.42, body, [0, 0.7, 0], undefined, 0.02));
      g.add(box(0.44, 0.5, 0.06, M.metal('#555c6b', 0.3), [0, 1.0, 0.22], [-0.2, 0, 0], 0.01));
      const scr = M.glow('#2f7bff', 1.1);
      g.add(box(0.26, 0.18, 0.005, scr, [0, 1.08, 0.255], [-0.2, 0, 0]));
      const key = M.metal('#c9ccd1', 0.3);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.add(box(0.03, 0.006, 0.022, key, [-0.035 + c * 0.035, 0.86 - r * 0.006, 0.27 + r * 0.025], [0, 0, 0], 0.003));
      g.add(box(0.14, 0.012, 0.02, M.matte('#111'), [0.13, 0.92, 0.25]));
      g.add(box(0.22, 0.02, 0.03, M.matte('#111'), [0, 0.68, 0.215]));
      const sign = M.glow('#3dff8a', 1.5);
      g.add(box(0.46, 0.12, 0.04, sign, [0, 1.48, 0.0], undefined, 0.01));
      return [{ k: 'pulse', mat: scr, base: 1.1, amp: 0.25, freq: 0.6 }];
    },
  },

  /* ---------- Seasonal ---------- */
  pumpkin: {
    density: 400, light: { color: '#ff8a1a', intensity: 0.5, distance: 1.5, y: 0.12 },
    build(g) {
      const orange = M.plastic('#f07a12', { roughness: 0.5 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        g.add(sph(0.1, orange, [Math.cos(a) * 0.045, 0.1, Math.sin(a) * 0.045], [0.6, 0.85, 0.6]));
      }
      g.add(tube([[0, 0.17, 0], [0.005, 0.21, 0], [0.025, 0.23, 0]], 0.012, M.matte('#4f6b2a'), 8));
      const glow = M.glow('#ffb84a', 2.2);
      for (const s of [-1, 1]) g.add(slab([[-0.02, 0], [0.02, 0], [0, 0.03]], 0.004, glow, [s * 0.04, 0.12, 0.128], [0, s * 0.25, 0], 0));
      g.add(slab([[-0.06, 0], [-0.03, -0.015], [0, 0], [0.03, -0.015], [0.06, 0], [0.04, -0.035], [-0.04, -0.035]], 0.004, glow, [0, 0.08, 0.13], undefined, 0));
      return [{ k: 'flicker', mat: glow, base: 2.2 }];
    },
  },
  tiny_tree: {
    density: 400,
    build(g) {
      g.add(cyl(0.04, 0.032, 0.05, M.plastic('#b3261e'), [0, 0.025, 0]));
      g.add(cyl(0.008, 0.008, 0.04, M.wood('#5a3920'), [0, 0.06, 0]));
      const green = M.matte('#2f6b3a', { roughness: 0.8 });
      for (let i = 0; i < 3; i++) g.add(cone(0.075 - i * 0.018, 0.09, green, [0, 0.1 + i * 0.055, 0], undefined, 16));
      const fx: Behavior[] = [];
      for (let i = 0; i < 9; i++) {
        const y = 0.08 + (i % 3) * 0.055 + Math.floor(i / 3) * 0.01;
        const r = 0.06 - (i % 3) * 0.018;
        const a = i * 2.1;
        const m = M.glow('#ff3030', 1.5);
        g.add(sph(0.008, m, [Math.cos(a) * r, y, Math.sin(a) * r]));
        fx.push({ k: 'hue', mat: m, speed: 0.4, phase: i / 9, sat: 0.9 });
      }
      g.add(slab(starPts(0.022, 0.01), 0.006, M.glow('#ffd84a', 1.4), [0, 0.27, 0]));
      return fx;
    },
  },
  foam_snowman: {
    density: 60, collider: 'cyl',
    build(g) {
      const foam = M.matte('#f7f8fa', { roughness: 0.95 });
      g.add(sph(0.16, foam, [0, 0.15, 0]), sph(0.12, foam, [0, 0.4, 0]), sph(0.09, foam, [0, 0.6, 0]));
      const coal = M.matte('#151515');
      for (const s of [-1, 1]) g.add(sph(0.01, coal, [s * 0.03, 0.63, 0.08]));
      for (let i = 0; i < 3; i++) g.add(sph(0.012, coal, [0, 0.36 + i * 0.06, 0.12 - Math.abs(i - 1) * 0.008]));
      g.add(cone(0.014, 0.08, M.matte('#ff7a1a'), [0, 0.6, 0.12], [H, 0, 0], 12));
      g.add(torus(0.085, 0.022, M.fabric('#c0262e'), [0, 0.52, 0], [H, 0, 0]));
      g.add(box(0.04, 0.15, 0.015, M.fabric('#c0262e'), [0.05, 0.44, 0.08], [0, 0, 0.2], 0.005));
      const stick = M.wood('#5a3920', 0.9);
      for (const s of [-1, 1]) g.add(tube([[s * 0.1, 0.42, 0], [s * 0.2, 0.5, 0], [s * 0.26, 0.56, 0.02]], 0.007, stick, 8));
      g.add(cyl(0.065, 0.065, 0.008, coal, [0, 0.68, 0]), cyl(0.045, 0.045, 0.09, coal, [0, 0.725, 0]));
    },
  },
  spotted_egg: {
    density: 300, collider: 'ball',
    build(g) {
      const shell = M.ceramic('#f3e6cf');
      g.add(lathe([[0, 0], [0.09, 0.03], [0.13, 0.12], [0.12, 0.22], [0.07, 0.31], [0.0, 0.34]], shell, undefined, 40));
      const spot = M.ceramic('#4aa37a');
      for (let i = 0; i < 18; i++) {
        const y = 0.05 + (i % 6) * 0.045;
        const r = y < 0.12 ? 0.09 + y * 0.35 : 0.13 - (y - 0.12) * 0.45;
        const a = i * 2.39;
        const s = sph(0.018 + (i % 3) * 0.005, spot, [Math.cos(a) * r, y, Math.sin(a) * r], undefined, 10);
        s.lookAt(0, y, 0);
        s.scale.set(1, 1, 0.25);
        g.add(s);
      }
      return [{ k: 'haunt', mode: 'rock', interval: 6 }];
    },
  },
  heart_balloon: {
    density: 8, restitution: 0.5, linearDamping: 1.6,
    build(g) {
      const red = M.plastic('#e0203a', { roughness: 0.15, clearcoat: 1 });
      g.add(slab(heartPts(0.16), 0.08, red, [0, 0.55, 0], [0, 0, PI], 0.04));
      g.add(cone(0.012, 0.02, red, [0, 0.41, 0], undefined, 12));
      g.add(tube([[0, 0.4, 0], [0.02, 0.28, 0.01], [-0.01, 0.14, 0], [0, 0.02, 0]], 0.0012, M.matte('#f5f5f5'), 24));
      g.add(cyl(0.015, 0.018, 0.02, M.plastic('#e8b730'), [0, 0.01, 0]));
      return [{ k: 'float', gravity: -0.12 }];
    },
  },
  popper_crate: {
    density: 300,
    build(g) {
      const wood = M.wood('#b98a5a', 0.75);
      for (let i = 0; i < 3; i++) for (const z of [-0.14, 0.14]) g.add(box(0.36, 0.06, 0.015, wood, [0, 0.04 + i * 0.075, z]));
      for (let i = 0; i < 3; i++) for (const x of [-0.17, 0.17]) g.add(box(0.015, 0.06, 0.28, wood, [x, 0.04 + i * 0.075, 0]));
      g.add(box(0.33, 0.01, 0.27, wood, [0, 0.005, 0]));
      const cols = ['#ff3d7f', '#3dd5ff', '#ffd23d', '#7a3dff', '#3dff8a'];
      for (let i = 0; i < 7; i++) {
        const c = cone(0.025, 0.12, M.plastic(cols[i % 5]!), [-0.11 + (i % 4) * 0.07, 0.24, -0.06 + Math.floor(i / 4) * 0.1], [PI + Math.sin(i) * 0.3, 0, Math.cos(i) * 0.3], 16);
        g.add(c);
      }
      g.add(slab([[-0.08, 0], [0.08, 0], [0.08, 0.06], [-0.08, 0.06]], 0.004, M.paper('#e03a2a'), [0, 0.09, 0.15], undefined, 0));
    },
  },
  party_hats: {
    density: 150,
    build(g) {
      const cols = ['#ff3d7f', '#3dd5ff', '#ffd23d', '#7a3dff', '#3dff8a', '#ff8a3d'];
      const spots: [number, number, number][] = [[-0.06, 0, 0], [0, 0, 0], [0.06, 0, 0], [-0.03, 0.075, 0], [0.03, 0.075, 0], [0, 0.15, 0]];
      spots.forEach(([x, y, z], i) => {
        g.add(cone(0.03, 0.09, M.paper(cols[i]!), [x, y + 0.045, z], undefined, 20));
        g.add(sph(0.01, M.fabric('#ffffff'), [x, y + 0.093, z]));
      });
    },
  },
  plastic_roast: {
    density: 400,
    build(g) {
      g.add(cyl(0.12, 0.09, 0.015, M.ceramic('#fafafa'), [0, 0.0075, 0], undefined, 40));
      const skin = M.plastic('#b8702c', { roughness: 0.25, clearcoat: 1 });
      g.add(sph(0.07, skin, [0, 0.055, 0], [1.3, 0.8, 1]));
      for (const s of [-1, 1]) {
        g.add(capsule(0.022, 0.05, skin, [0.07, 0.05, s * 0.045], [0, 0, -1.1]));
        g.add(sph(0.012, M.ceramic('#f4efe6'), [0.11, 0.075, s * 0.045]));
      }
      for (let i = 0; i < 5; i++) g.add(sph(0.014, M.matte('#3f8f4a'), [Math.cos(i * 1.3) * 0.095, 0.022, Math.sin(i * 1.3) * 0.095]));
    },
  },
  cauldron: {
    density: 600, collider: 'cyl', light: { color: '#5dff5a', intensity: 0.6, distance: 1.8, y: 0.35 },
    build(g) {
      const iron = M.metal('#232325', 0.55);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        g.add(cyl(0.015, 0.012, 0.08, iron, [Math.cos(a) * 0.14, 0.04, Math.sin(a) * 0.14]));
      }
      g.add(lathe([[0.0, 0.06], [0.12, 0.08], [0.2, 0.16], [0.2, 0.26], [0.16, 0.33], [0.18, 0.345], [0.17, 0.35], [0.15, 0.33]], iron));
      const goo = M.glow('#5dff5a', 1.3);
      g.add(cyl(0.158, 0.158, 0.01, goo, [0, 0.31, 0], undefined, 36));
      const fx: Behavior[] = [{ k: 'pulse', mat: goo, base: 1.2, amp: 0.4, freq: 0.5 }];
      for (let i = 0; i < 5; i++) {
        const b = pivot([Math.cos(i * 1.9) * 0.08, 0.315, Math.sin(i * 1.9) * 0.08], sph(0.018 - i * 0.002, goo, [0, 0, 0], [1, 0.6, 1]));
        g.add(b);
        fx.push({ k: 'bob', node: b, amp: 0.012, freq: 0.7 + i * 0.23, phase: i });
      }
      return fx;
    },
  },
  creepy_doll: {
    density: 400,
    build(g) {
      g.add(lathe([[0.06, 0], [0.055, 0.02], [0.03, 0.1], [0.022, 0.12], [0.0, 0.12]], M.fabric('#6a3a7a')));
      g.add(cyl(0.062, 0.062, 0.015, M.fabric('#f2efe6'), [0, 0.008, 0]));
      const porcelain = M.ceramic('#f6efe8');
      g.add(sph(0.042, porcelain, [0, 0.16, 0]));
      g.add(sph(0.045, M.matte('#4a2a18'), [0, 0.17, -0.012], [1, 1, 0.9]));
      for (const s of [-1, 1]) {
        g.add(sph(0.007, M.plastic('#111', { roughness: 0.05 }), [s * 0.015, 0.165, 0.037]));
        g.add(sph(0.008, M.matte('#f2a0a0'), [s * 0.024, 0.15, 0.033], [1, 0.6, 0.4]));
        g.add(capsule(0.008, 0.04, porcelain, [s * 0.035, 0.08, 0.01], [0, 0, s * 0.3]));
      }
      g.add(sph(0.004, M.matte('#b3261e'), [0, 0.142, 0.04]));
      return [{ k: 'haunt', mode: 'hop', interval: 14 }];
    },
  },
};
