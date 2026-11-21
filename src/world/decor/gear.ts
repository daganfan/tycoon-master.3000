import { M, box, capsule, cone, cyl, pivot, sph, torus, tube } from './kit';
import type { Behavior, Recipe } from './types';

/** Models for the useful eBuy gear (prop key = record key). */

const PI = Math.PI;
const H = PI / 2;

export const GEAR_RECIPES: Record<string, Recipe> = {
  headset: {
    spot: 'desk', density: 500,
    build(g) {
      const black = M.plastic('#1c1d21', { roughness: 0.35 });
      g.add(cyl(0.05, 0.055, 0.012, black, [0, 0.006, 0]));
      g.add(cyl(0.008, 0.008, 0.2, M.metal('#3a3a40', 0.3), [0, 0.11, 0]));
      g.add(torus(0.085, 0.012, black, [0, 0.17, 0], [0, H, 0], PI));
      const rgb = M.glow('#29f0ff', 1.6);
      for (const s of [-1, 1]) {
        g.add(cyl(0.045, 0.045, 0.035, black, [0, 0.11, s * 0.085], [H, 0, 0]));
        g.add(torus(0.035, 0.012, M.fabric('#2c2c30'), [0, 0.11, s * 0.065]));
        g.add(torus(0.044, 0.003, rgb, [0, 0.11, s * 0.103]));
      }
      g.add(tube([[0, 0.09, 0.1], [0.05, 0.07, 0.11], [0.09, 0.08, 0.09]], 0.004, black, 12));
      g.add(sph(0.01, M.rubber('#222'), [0.09, 0.08, 0.09]));
      return [{ k: 'hue', mat: rgb, speed: 0.1, sat: 0.9 }];
    },
  },
  router: {
    spot: 'desk', density: 600,
    build(g) {
      g.add(box(0.22, 0.035, 0.14, M.plastic('#17181b', { roughness: 0.25 }), [0, 0.0175, 0], undefined, 0.01));
      for (let i = 0; i < 6; i++) {
        const x = -0.09 + i * 0.036;
        g.add(cyl(0.006, 0.008, 0.14, M.plastic('#17181b'), [x, 0.1, -0.06], [-0.15 * (i % 2), 0, (i - 2.5) * 0.12]));
      }
      for (let i = 0; i < 5; i++) g.add(sph(0.003, M.glow(i === 4 ? '#ffb030' : '#3dff8a', 2), [-0.06 + i * 0.03, 0.03, 0.071]));
    },
  },
  monarm: {
    spot: 'desk', density: 800,
    build(g) {
      const m = M.metal('#2a2b2f', 0.3);
      g.add(box(0.08, 0.03, 0.08, m, [0, 0.015, 0], undefined, 0.006));
      g.add(cyl(0.015, 0.015, 0.35, M.chrome(), [0, 0.2, 0]));
      g.add(box(0.2, 0.02, 0.035, m, [0.09, 0.3, 0.04], [0, -0.4, 0], 0.008));
      g.add(box(0.16, 0.02, 0.03, m, [0.16, 0.33, 0.12], [0, 0.6, 0], 0.008));
      g.add(box(0.1, 0.1, 0.012, m, [0.2, 0.34, 0.17], undefined, 0.006));
    },
  },
  ups: {
    spot: 'floor', density: 900,
    build(g) {
      g.add(box(0.16, 0.3, 0.36, M.plastic('#1d1e22', { roughness: 0.4 }), [0, 0.15, 0], undefined, 0.012));
      const lcd = M.glow('#46c8ff', 1.2);
      g.add(box(0.08, 0.04, 0.004, lcd, [0, 0.24, 0.181]));
      g.add(cyl(0.012, 0.012, 0.008, M.glow('#3dff8a', 1.5), [0, 0.18, 0.181], [H, 0, 0]));
      for (let i = 0; i < 6; i++) g.add(box(0.12, 0.006, 0.004, M.plastic('#2c2d33'), [0, 0.05 + i * 0.018, 0.181]));
      return [{ k: 'pulse', mat: lcd, base: 1.1, amp: 0.2, freq: 0.3 }];
    },
  },
  server: {
    spot: 'floor', density: 300,
    build(g) {
      const frame = M.metal('#18191c', 0.35);
      g.add(box(0.6, 1.1, 0.6, frame, [0, 0.55, 0], undefined, 0.012));
      const fx: Behavior[] = [];
      for (let i = 0; i < 9; i++) {
        g.add(box(0.52, 0.09, 0.02, M.metal('#3a3d44', 0.3), [0, 0.12 + i * 0.105, 0.3], undefined, 0.004));
        const led = M.glow(i % 3 ? '#3dff8a' : '#ffb030', 2);
        g.add(sph(0.007, led, [-0.22, 0.12 + i * 0.105, 0.312]));
        fx.push({ k: 'pulse', mat: led, base: 1.6, amp: 1.4, freq: 1.3 + i * 0.37 });
        for (let k = 0; k < 4; k++) g.add(box(0.06, 0.05, 0.004, M.plastic('#111'), [0.0 + k * 0.07, 0.12 + i * 0.105, 0.312]));
      }
      return fx;
    },
  },
  ringlight: {
    spot: 'floor', density: 250, light: { color: '#fff4e0', intensity: 1.2, distance: 3, y: 1.35 },
    build(g) {
      const black = M.metal('#1b1b1e', 0.35);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        g.add(cyl(0.008, 0.008, 0.5, black, [Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
      }
      g.add(cyl(0.012, 0.012, 0.95, black, [0, 0.88, 0]));
      g.add(torus(0.2, 0.025, M.glow('#fff4e0', 1.8), [0, 1.35, 0]));
      g.add(box(0.07, 0.13, 0.008, M.plastic('#111', { roughness: 0.1 }), [0, 1.35, 0.01], undefined, 0.008));
    },
  },
  fridge: {
    spot: 'floor', density: 250,
    build(g) {
      const white = M.plastic('#f2f2ef', { roughness: 0.3 });
      g.add(box(0.46, 0.55, 0.46, white, [0, 0.275, 0], undefined, 0.025));
      g.add(box(0.44, 0.003, 0.003, M.matte('#bbb'), [0, 0.47, 0.231]));
      g.add(box(0.02, 0.2, 0.025, M.chrome(), [0.19, 0.3, 0.24], undefined, 0.006));
      const cols = ['#38e07b', '#ff3d7f', '#3dc0ff', '#ffd23d'];
      for (let i = 0; i < 4; i++) {
        g.add(cyl(0.032, 0.032, 0.12, M.metal(cols[i]!, 0.25), [-0.15 + i * 0.1, 0.61, (i % 2) * 0.06 - 0.03]));
        g.add(cyl(0.028, 0.028, 0.004, M.metal('#cfd3d8', 0.2), [-0.15 + i * 0.1, 0.672, (i % 2) * 0.06 - 0.03]));
      }
    },
  },
  whiteboard: {
    spot: 'floor', density: 200,
    build(g) {
      const al = M.metal('#c9ccd1', 0.3);
      for (const s of [-1, 1]) g.add(cyl(0.012, 0.012, 1.4, al, [s * 0.38, 0.68, 0], [-0.08, 0, 0]));
      g.add(cyl(0.01, 0.01, 1.3, al, [0, 0.62, -0.18], [0.55, 0, 0]));
      g.add(box(0.85, 0.6, 0.02, M.ceramic('#fbfbfb'), [0, 1.05, 0.03], [-0.08, 0, 0], 0.006));
      g.add(box(0.8, 0.02, 0.06, al, [0, 0.73, 0.07], [-0.08, 0, 0], 0.004));
      const ink = (c: string) => M.matte(c);
      g.add(tube([[-0.32, 0.86, 0.06], [-0.18, 0.92, 0.055], [-0.05, 0.9, 0.05], [0.1, 1.05, 0.04], [0.28, 1.22, 0.03]], 0.006, ink('#1f9e3f'), 24));
      g.add(cone(0.02, 0.05, ink('#1f9e3f'), [0.3, 1.25, 0.03], [0, 0, -0.8], 3));
      g.add(box(0.3, 0.01, 0.004, ink('#d33'), [-0.15, 1.25, 0.046], [-0.08, 0, 0]));
      g.add(box(0.22, 0.01, 0.004, ink('#2f5fd8'), [-0.19, 1.2, 0.046], [-0.08, 0, 0]));
      g.add(sph(0.05, ink('#d33'), [0.15, 0.85, 0.06], [1, 1, 0.08]));
      g.add(cyl(0.006, 0.006, 0.1, M.plastic('#1f9e3f'), [0.2, 0.75, 0.1], [0, 0, H]));
    },
  },
  mat: {
    spot: 'floor', density: 300, friction: 1,
    build(g) {
      g.add(box(0.7, 0.018, 0.45, M.rubber('#2a2b2e'), [0, 0.009, 0], undefined, 0.008));
      for (let i = 0; i < 4; i++) g.add(box(0.62, 0.003, 0.01, M.rubber('#36373b'), [0, 0.019, -0.15 + i * 0.1]));
    },
  },
  wristrest: {
    spot: 'desk', density: 400,
    build(g) {
      g.add(capsule(0.018, 0.36, M.plastic('#3a7bd5', { roughness: 0.15, transmission: 0.2 }), [0, 0.018, 0], [0, 0, H]));
      g.add(box(0.4, 0.006, 0.05, M.rubber('#1b1b1e'), [0, 0.003, 0], undefined, 0.003));
    },
  },
  coinvac: {
    spot: 'desk', density: 500,
    build(g) {
      const red = M.plastic('#d9312b');
      g.add(capsule(0.035, 0.12, red, [0, 0.035, 0], [0, 0, H]));
      g.add(cone(0.03, 0.12, red, [0.14, 0.03, 0], [0, 0, -H], 16));
      g.add(cyl(0.032, 0.032, 0.07, M.glass('#ffffff'), [-0.05, 0.04, 0], [0, 0, H]));
      for (let i = 0; i < 4; i++) g.add(cyl(0.012, 0.012, 0.003, M.gold(), [-0.07 + i * 0.012, 0.022 + (i % 2) * 0.008, (i % 3) * 0.008 - 0.008], [0.5 * i, 0, 0.3]));
      g.add(torus(0.035, 0.008, M.rubber('#222'), [-0.07, 0.07, 0], [0, 0, 0], PI));
    },
  },
  sorter: {
    spot: 'desk', density: 700,
    build(g) {
      const tray = M.plastic('#2c3e50', { roughness: 0.4 });
      g.add(box(0.24, 0.012, 0.12, tray, [0, 0.006, 0], undefined, 0.004));
      for (let i = 0; i < 5; i++) g.add(box(0.004, 0.025, 0.12, tray, [-0.12 + i * 0.06, 0.02, 0]));
      for (const z of [-0.058, 0.058]) g.add(box(0.24, 0.025, 0.004, tray, [0, 0.02, z]));
      const metals = [M.gold(), M.metal('#d9d9dc', 0.2), M.metal('#b8733a', 0.3), M.gold()];
      for (let i = 0; i < 4; i++) for (let k = 0; k < 2 + i; k++) g.add(cyl(0.017 - i * 0.002, 0.017 - i * 0.002, 0.004, metals[i]!, [-0.09 + i * 0.06, 0.015 + k * 0.0045, 0]));
    },
  },
  rail: {
    spot: 'floor', density: 200,
    build(g) {
      const c = M.chrome();
      for (const s of [-1, 1]) {
        g.add(cyl(0.012, 0.012, 1.35, c, [s * 0.45, 0.7, 0]));
        g.add(cyl(0.01, 0.01, 0.4, c, [s * 0.45, 0.03, 0], [H, 0, 0]));
      }
      g.add(cyl(0.012, 0.012, 0.92, c, [0, 1.37, 0], [0, 0, H]));
      const cols = ['#e63946', '#f1faee', '#457b9d', '#1d3557', '#ffb703'];
      for (let i = 0; i < 5; i++) {
        const x = -0.32 + i * 0.16;
        g.add(torus(0.02, 0.003, M.metal('#888', 0.3), [x, 1.36, 0], [0, H, 0], PI * 1.5));
        g.add(tube([[x - 0.17, 1.24, 0], [x, 1.32, 0], [x + 0.17, 1.24, 0]], 0.004, M.metal('#888', 0.3), 8));
        g.add(box(0.34, 0.55, 0.03, M.fabric(cols[i]!), [x, 0.98, 0], [0, H * 0.9, 0], 0.012));
      }
    },
  },
  powerstrip: {
    spot: 'floor', density: 700,
    build(g) {
      const white = M.plastic('#f2f2ef');
      for (let k = 0; k < 2; k++) {
        g.add(box(0.32, 0.04, 0.06, white, [0, 0.02, k * 0.09], [0, k * 0.15, 0], 0.01));
        for (let i = 0; i < 5; i++) g.add(box(0.03, 0.035, 0.03, M.plastic('#1b1b1b'), [-0.12 + i * 0.06, 0.055, k * 0.09], [0, k * 0.15, 0], 0.005));
        g.add(sph(0.006, M.glow('#ff3030', 2), [0.145, 0.042, k * 0.09]));
      }
      g.add(tube([[0.16, 0.02, 0.0], [0.25, 0.03, 0.05], [0.16, 0.02, 0.09]], 0.006, M.plastic('#1b1b1b'), 12));
    },
  },
  glasses: {
    spot: 'desk', density: 300,
    build(g) {
      const f = M.plastic('#1b1b1e', { roughness: 0.2 });
      for (const s of [-1, 1]) {
        g.add(torus(0.024, 0.004, f, [s * 0.032, 0.026, 0]));
        g.add(cyl(0.023, 0.023, 0.002, M.glass('#9fd0ff'), [s * 0.032, 0.026, 0], [H, 0, 0]));
        g.add(box(0.004, 0.004, 0.12, f, [s * 0.056, 0.03, -0.06]));
      }
      g.add(torus(0.008, 0.003, f, [0, 0.03, 0], [0, 0, 0], PI));
    },
  },
  cables: {
    spot: 'desk', density: 500,
    build(g) {
      g.add(cyl(0.06, 0.06, 0.008, M.wood('#a07d55'), [0, 0.004, 0]), cyl(0.06, 0.06, 0.008, M.wood('#a07d55'), [0, 0.07, 0]));
      g.add(cyl(0.02, 0.02, 0.07, M.wood('#a07d55'), [0, 0.037, 0]));
      for (let i = 0; i < 4; i++) g.add(torus(0.035, 0.012, M.rubber(['#e63946', '#2a9d8f', '#1d3557', '#f4a261'][i]!), [0, 0.016 + i * 0.016, 0], [H, 0, 0]));
      for (let i = 0; i < 5; i++) g.add(box(0.08, 0.002, 0.006, M.plastic('#111'), [0.08 + i * 0.01, 0.002, -0.03 + i * 0.015], [0, i, 0]));
    },
  },
  sidedesk: {
    spot: 'floor', density: 180, friction: 0.9,
    build(g) {
      const top = M.wood('#d8bf96', 0.5);
      g.add(box(1.0, 0.03, 0.5, top, [0, 0.715, 0], undefined, 0.006));
      const leg = M.metal('#f2f2ef', 0.4);
      for (const [x, z] of [[-0.46, -0.21], [0.46, -0.21], [-0.46, 0.21], [0.46, 0.21]] as const) g.add(cyl(0.02, 0.02, 0.7, leg, [x, 0.35, z]));
      g.add(box(0.98, 0.02, 0.46, top, [0, 0.2, 0]));
      for (let i = 0; i < 3; i++) g.add(cyl(0.004, 0.004, 0.012, M.chrome(), [-0.05 + i * 0.05, 0.22, 0.1]));
    },
  },
  mic: {
    spot: 'desk', density: 700,
    build(g) {
      const m = M.metal('#1c1c1f', 0.3);
      g.add(cyl(0.06, 0.065, 0.015, m, [0, 0.0075, 0]));
      g.add(cyl(0.008, 0.008, 0.18, m, [0, 0.1, 0]));
      g.add(tube([[0, 0.19, 0], [0.04, 0.27, 0.04], [0.06, 0.3, 0.1]], 0.006, m, 12));
      const head = pivot([0.06, 0.3, 0.12]);
      head.rotation.x = 0.4;
      head.add(capsule(0.025, 0.06, M.metal('#2a2a2e', 0.4)));
      head.add(capsule(0.0255, 0.03, M.metal('#888', 0.4), [0, 0.02, 0]));
      head.add(torus(0.05, 0.004, m, [0, 0.03, 0.07], [0, 0, 0]));
      head.add(cyl(0.048, 0.048, 0.002, M.fabric('#111'), [0, 0.03, 0.07], [H, 0, 0]));
      g.add(head);
    },
  },
};

export const GEAR_PROPS = Object.keys(GEAR_RECIPES);
