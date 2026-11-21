import * as THREE from 'three';

/** Small seeded noise helper so procedural textures look the same every run. */
export function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function toTex(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1], srgb = true): THREE.CanvasTexture {
  const [c, g] = makeCanvas(w, h);
  draw(g);
  return toTex(c, repeat, srgb);
}

/** Turn a grayscale height canvas into a tangent-space normal map. */
function heightToNormal(src: HTMLCanvasElement, strength: number, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const [c, g] = makeCanvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x: number, y: number) => data[(((y + h) % h) * w + ((x + w) % w)) * 4]! / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return toTex(c, repeat, false);
}

/** Value-noise blotches on a canvas (used for stains, plaster, grime). */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, size: number, color: (a: number) => string): void {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = size * (0.3 + r());
    const grad = g.createRadialGradient(x, y, 0, x, y, s);
    grad.addColorStop(0, color(r()));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
}

export interface PbrSet {
  map: THREE.Texture;
  rough?: THREE.Texture;
  normal?: THREE.Texture;
}

/** Oak-ish floor planks: varied colour per board, grain, knots, bevelled seams. */
export function woodFloor(): Required<PbrSet> {
  const S = 1024;
  const plankH = 85;
  const [cc, gc] = makeCanvas(S, S);
  const [ch, gh] = makeCanvas(S, S);
  const [cr, gr] = makeCanvas(S, S);
  gh.fillStyle = '#808080';
  gh.fillRect(0, 0, S, S);
  const r = rand(7);
  for (let row = 0; row * plankH < S; row++) {
    const y = row * plankH;
    let x = -Math.floor(r() * 400);
    while (x < S) {
      const len = 300 + r() * 420;
      const hue = 24 + r() * 10;
      const sat = 28 + r() * 16;
      const lit = 33 + r() * 15;
      gc.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
      gc.fillRect(x, y, len, plankH);
      // long grain
      for (let i = 0; i < 40; i++) {
        const yy = y + r() * plankH;
        const dark = r() < 0.6;
        gc.strokeStyle = dark ? `rgba(50,25,8,${0.06 + r() * 0.14})` : `rgba(255,220,170,${0.04 + r() * 0.08})`;
        gc.lineWidth = 0.6 + r() * 2.2;
        gc.beginPath();
        gc.moveTo(x, yy);
        const wob = 2 + r() * 5;
        gc.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * wob, x + len * 0.7, yy + (r() - 0.5) * wob, x + len, yy + (r() - 0.5) * 2);
        gc.stroke();
        gh.strokeStyle = `rgba(${dark ? 100 : 150},${dark ? 100 : 150},${dark ? 100 : 150},0.25)`;
        gh.lineWidth = gc.lineWidth;
        gh.beginPath();
        gh.moveTo(x, yy);
        gh.lineTo(x + len, yy);
        gh.stroke();
      }
      // knots
      if (r() < 0.35) {
        const kx = x + r() * len;
        const ky = y + 15 + r() * (plankH - 30);
        for (let k = 6; k > 0; k--) {
          gc.strokeStyle = `rgba(45,22,6,${0.12 + k * 0.03})`;
          gc.lineWidth = 1.5;
          gc.beginPath();
          gc.ellipse(kx, ky, k * 4.2, k * 1.8, 0, 0, Math.PI * 2);
          gc.stroke();
        }
      }
      // board-level roughness variation (some boards more worn)
      const rv = 140 + r() * 60;
      gr.fillStyle = `rgb(${rv},${rv},${rv})`;
      gr.fillRect(x, y, len, plankH);
      // end seam
      gc.fillStyle = 'rgba(25,12,3,0.75)';
      gc.fillRect(x, y, 2, plankH);
      gh.fillStyle = '#000';
      gh.fillRect(x - 1, y, 4, plankH);
      gr.fillStyle = '#fff';
      gr.fillRect(x, y, 3, plankH);
      x += len;
    }
    gc.fillStyle = 'rgba(25,12,3,0.7)';
    gc.fillRect(0, y, S, 2);
    gh.fillStyle = '#000';
    gh.fillRect(0, y - 1, S, 4);
    gr.fillStyle = '#fff';
    gr.fillRect(0, y, S, 3);
  }
  // scuffs and subtle dirt
  blotches(gc, S, S, r, 70, 60, (a) => `rgba(20,10,0,${0.04 + a * 0.05})`);
  blotches(gr, S, S, r, 50, 70, (a) => `rgba(255,255,255,${0.05 + a * 0.08})`);
  const rep: [number, number] = [3.4, 3.4];
  return { map: toTex(cc, rep), rough: toTex(cr, rep, false), normal: heightToNormal(ch, 3, rep) };
}

/** Painted plaster: warm off-white with roller texture. Returns colour + normal. */
export function plaster(hue = 38, sat = 22, light = 82): Required<Omit<PbrSet, 'rough'>> {
  const S = 512;
  const r = rand(11);
  const [cc, gc] = makeCanvas(S, S);
  gc.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
  gc.fillRect(0, 0, S, S);
  blotches(gc, S, S, r, 120, 50, (a) => `rgba(${a > 0.5 ? '255,250,240' : '120,100,80'},0.035)`);
  const [ch, gh] = makeCanvas(S, S);
  gh.fillStyle = '#808080';
  gh.fillRect(0, 0, S, S);
  blotches(gh, S, S, r, 2600, 6, (a) => (a > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'));
  for (let i = 0; i < 9000; i++) {
    const v = r() > 0.5 ? 255 : 0;
    gh.fillStyle = `rgba(${v},${v},${v},0.12)`;
    gh.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  return { map: toTex(cc, [3, 1.5]), normal: heightToNormal(ch, 2.2, [3, 1.5]) };
}

/** Kept for compatibility with older callers. */
export function wallPaint(hue = 200): THREE.Texture {
  return plaster(hue, 16, 74).map;
}

/** Stippled ceiling. */
export function ceilingTex(): Required<Omit<PbrSet, 'rough'>> {
  const S = 512;
  const r = rand(19);
  const [cc, gc] = makeCanvas(S, S);
  gc.fillStyle = '#f1ede6';
  gc.fillRect(0, 0, S, S);
  blotches(gc, S, S, r, 40, 80, () => 'rgba(140,120,90,0.03)');
  const [ch, gh] = makeCanvas(S, S);
  gh.fillStyle = '#707070';
  gh.fillRect(0, 0, S, S);
  blotches(gh, S, S, r, 5000, 4, (a) => `rgba(255,255,255,${0.2 + a * 0.3})`);
  return { map: toTex(cc, [4, 3]), normal: heightToNormal(ch, 3, [4, 3]) };
}

/** Wood grain for furniture (desk top, bed frame). */
export function woodGrain(base = [30, 42, 40], seed = 5, repeat: [number, number] = [1, 1]): Required<Omit<PbrSet, 'rough'>> {
  const W = 1024;
  const H = 256;
  const r = rand(seed);
  const [cc, gc] = makeCanvas(W, H);
  const [ch, gh] = makeCanvas(W, H);
  const [hu, sa, li] = base as [number, number, number];
  gc.fillStyle = `hsl(${hu}, ${sa}%, ${li}%)`;
  gc.fillRect(0, 0, W, H);
  gh.fillStyle = '#808080';
  gh.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    const y = r() * H;
    const dark = r() < 0.55;
    const a = 0.05 + r() * 0.16;
    gc.strokeStyle = dark ? `rgba(40,18,4,${a})` : `rgba(255,225,180,${a * 0.6})`;
    gc.lineWidth = 0.5 + r() * 3;
    gc.beginPath();
    gc.moveTo(0, y);
    for (let x = 0; x <= W; x += 64) gc.lineTo(x, y + Math.sin(x * 0.004 + i) * 6 + (r() - 0.5) * 2);
    gc.stroke();
    gh.strokeStyle = dark ? 'rgba(60,60,60,0.3)' : 'rgba(170,170,170,0.3)';
    gh.lineWidth = gc.lineWidth;
    gh.beginPath();
    gh.moveTo(0, y);
    for (let x = 0; x <= W; x += 64) gh.lineTo(x, y + Math.sin(x * 0.004 + i) * 6);
    gh.stroke();
  }
  // cathedral arches
  for (let k = 0; k < 3; k++) {
    const cx = 200 + r() * 600;
    for (let j = 0; j < 9; j++) {
      gc.strokeStyle = `rgba(50,22,6,${0.07 + r() * 0.06})`;
      gc.lineWidth = 2;
      gc.beginPath();
      gc.ellipse(cx, H / 2 + (r() - 0.5) * 40, 60 + j * 34, 10 + j * 9, 0, 0, Math.PI * 2);
      gc.stroke();
    }
  }
  return { map: toTex(cc, repeat), normal: heightToNormal(ch, 1.5, repeat) };
}

/** Aged beige plastic: yellowing, grime in a few places. */
export function crustyPlastic(): Required<Omit<PbrSet, 'normal'>> {
  const S = 256;
  const r = rand(23);
  const [cc, gc] = makeCanvas(S, S);
  gc.fillStyle = '#d9d0b6';
  gc.fillRect(0, 0, S, S);
  blotches(gc, S, S, r, 40, 70, (a) => `rgba(${150 + a * 40},${120 + a * 30},60,0.08)`);
  blotches(gc, S, S, r, 25, 18, () => 'rgba(70,60,40,0.07)');
  for (let i = 0; i < 3000; i++) {
    gc.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
    gc.fillRect(r() * S, r() * S, 1, 1);
  }
  const [cr, gr] = makeCanvas(S, S);
  gr.fillStyle = '#a8a8a8';
  gr.fillRect(0, 0, S, S);
  blotches(gr, S, S, r, 40, 30, (a) => `rgba(${a > 0.5 ? 255 : 60},${a > 0.5 ? 255 : 60},${a > 0.5 ? 255 : 60},0.15)`);
  return { map: toTex(cc), rough: toTex(cr, [1, 1], false) };
}

/** Persian-ish rug with border, medallion and fibre noise. */
export function rug(): THREE.Texture {
  const r = rand(31);
  return canvasTex(1024, 768, (g) => {
    const W = 1024;
    const H = 768;
    g.fillStyle = '#7d2a26';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#e2c48b';
    g.fillRect(28, 28, W - 56, H - 56);
    g.fillStyle = '#2b3d5a';
    g.fillRect(44, 44, W - 88, H - 88);
    // border pattern
    g.fillStyle = '#c9893f';
    for (let x = 60; x < W - 60; x += 32) {
      g.beginPath();
      g.arc(x, 64, 8, 0, Math.PI * 2);
      g.arc(x, H - 64, 8, 0, Math.PI * 2);
      g.fill();
    }
    for (let y = 60; y < H - 60; y += 32) {
      g.beginPath();
      g.arc(64, y, 8, 0, Math.PI * 2);
      g.arc(W - 64, y, 8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#8e2f29';
    g.fillRect(90, 90, W - 180, H - 180);
    // field motifs
    g.fillStyle = 'rgba(226,196,139,0.55)';
    for (let y = 130; y < H - 120; y += 70)
      for (let x = 130; x < W - 120; x += 70) {
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI / 4);
        g.fillRect(-7, -7, 14, 14);
        g.restore();
      }
    // central medallion
    g.save();
    g.translate(W / 2, H / 2);
    const rings = ['#2b3d5a', '#e2c48b', '#a8432f', '#2b3d5a', '#d9a65a', '#7d2a26'];
    rings.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      const rr = 200 - i * 30;
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const rad = rr * (k % 2 ? 0.82 : 1);
        g.lineTo(Math.cos(a) * rad * 1.3, Math.sin(a) * rad);
      }
      g.fill();
    });
    g.restore();
    // corner pieces
    g.fillStyle = '#2b3d5a';
    for (const [cx, cy] of [[90, 90], [W - 90, 90], [90, H - 90], [W - 90, H - 90]] as const) {
      g.beginPath();
      g.arc(cx, cy, 70, 0, Math.PI * 2);
      g.fill();
    }
    // fibre noise + wear
    for (let i = 0; i < 40000; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,240,220,0.05)' : 'rgba(0,0,0,0.07)';
      g.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
    }
    blotches(g, W, H, r, 12, 160, () => 'rgba(255,235,210,0.06)');
  });
}

/** Strands for the rug fringe (alpha-tested). */
export function fringeTex(): THREE.Texture {
  const r = rand(37);
  const t = canvasTex(512, 64, (g) => {
    g.clearRect(0, 0, 512, 64);
    for (let x = 0; x < 512; x += 5) {
      g.strokeStyle = `hsl(40, 40%, ${78 + r() * 10}%)`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(x + 2, 0);
      g.lineTo(x + 2 + (r() - 0.5) * 6, 40 + r() * 22);
      g.stroke();
    }
  });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Woven fabric with matching normal map. */
export function fabric(color: string): THREE.Texture {
  return fabricSet(color).map;
}

const fabricCache = new Map<string, Required<Omit<PbrSet, 'rough'>>>();
export function fabricSet(color: string, repeat: [number, number] = [2, 2]): Required<Omit<PbrSet, 'rough'>> {
  const key = `${color}|${repeat.join(',')}`;
  const hit = fabricCache.get(key);
  if (hit) return hit;
  const r = rand(3);
  const [cc, gc] = makeCanvas(256, 256);
  const [ch, gh] = makeCanvas(256, 256);
  gc.fillStyle = color;
  gc.fillRect(0, 0, 256, 256);
  gh.fillStyle = '#808080';
  gh.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4)
    for (let x = 0; x < 256; x += 4) {
      const odd = ((x + y) / 4) % 2;
      gc.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`;
      gc.fillRect(x, y, odd ? 2 : 4, odd ? 4 : 2);
      gh.fillStyle = odd ? '#b0b0b0' : '#505050';
      gh.fillRect(x, y, odd ? 2 : 4, odd ? 4 : 2);
    }
  for (let i = 0; i < 600; i++) {
    gc.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    gc.fillRect(r() * 256, r() * 256, 3, 1);
  }
  const res = { map: toTex(cc, repeat), normal: heightToNormal(ch, 1.2, repeat) };
  fabricCache.set(key, res);
  return res;
}

/** Sky seen through the window. Day has clouds and a tree line; night has stars and lit windows. */
export function skyTex(night: boolean): THREE.Texture {
  const r = rand(night ? 43 : 41);
  return canvasTex(1024, 512, (g) => {
    const W = 1024;
    const H = 512;
    const grad = g.createLinearGradient(0, 0, 0, H);
    if (night) {
      grad.addColorStop(0, '#060a1c');
      grad.addColorStop(0.65, '#1a2448');
      grad.addColorStop(1, '#2b2a44');
    } else {
      grad.addColorStop(0, '#5f9fe0');
      grad.addColorStop(0.6, '#a9d0f2');
      grad.addColorStop(1, '#e8eef0');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    if (night) {
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,240,${0.3 + r() * 0.7})`;
        const s = r() < 0.1 ? 2 : 1;
        g.fillRect(r() * W, r() * H * 0.6, s, s);
      }
      g.fillStyle = '#f4f1dc';
      g.beginPath();
      g.arc(780, 110, 22, 0, Math.PI * 2);
      g.fill();
    } else {
      for (let i = 0; i < 14; i++) {
        const cx = r() * W;
        const cy = 40 + r() * 200;
        for (let k = 0; k < 8; k++) {
          const rr = 20 + r() * 40;
          const cg = g.createRadialGradient(cx + k * 22, cy + (r() - 0.5) * 20, 0, cx + k * 22, cy, rr);
          cg.addColorStop(0, 'rgba(255,255,255,0.75)');
          cg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = cg;
          g.fillRect(cx + k * 22 - rr, cy - rr, rr * 2, rr * 2);
        }
      }
    }
    // distant houses
    for (let x = 0; x < W; ) {
      const w = 60 + r() * 90;
      const h = 50 + r() * 60;
      g.fillStyle = night ? '#0d1020' : `hsl(${20 + r() * 20}, 15%, ${55 + r() * 15}%)`;
      g.fillRect(x, H - 120 - h, w, h + 120);
      g.beginPath();
      g.moveTo(x - 6, H - 120 - h);
      g.lineTo(x + w / 2, H - 150 - h);
      g.lineTo(x + w + 6, H - 120 - h);
      g.fillStyle = night ? '#090b16' : '#7d4b3c';
      g.fill();
      for (let wy = H - 110 - h; wy < H - 60; wy += 26)
        for (let wx = x + 10; wx < x + w - 14; wx += 24) {
          const lit = night && r() < 0.3;
          g.fillStyle = lit ? '#ffcf7a' : night ? '#161a2c' : 'rgba(60,80,100,0.6)';
          g.fillRect(wx, wy, 12, 14);
        }
      x += w + 10 + r() * 40;
    }
    // trees in front
    for (let i = 0; i < 26; i++) {
      const tx = r() * W;
      const ty = H - 60 - r() * 60;
      const tr = 30 + r() * 40;
      g.fillStyle = night ? '#05070c' : `hsl(${95 + r() * 30}, ${30 + r() * 20}%, ${24 + r() * 14}%)`;
      g.beginPath();
      g.arc(tx, ty, tr, 0, Math.PI * 2);
      g.arc(tx + tr * 0.6, ty + 10, tr * 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = night ? '#04050a' : '#4c6a35';
    g.fillRect(0, H - 50, W, 50);
  });
}

/** Coin atlas: embossed face (height) inside the unit circle + reeded edge strip in a corner. */
export function coinMaps(): { normal: THREE.Texture; rough: THREE.Texture } {
  const S = 256;
  const [ch, gh] = makeCanvas(S, S);
  gh.fillStyle = '#606060';
  gh.fillRect(0, 0, S, S);
  const c = S / 2;
  // raised rim
  gh.strokeStyle = '#e0e0e0';
  gh.lineWidth = 14;
  gh.beginPath();
  gh.arc(c, c, c - 9, 0, Math.PI * 2);
  gh.stroke();
  // inner bevel ring
  gh.strokeStyle = '#a0a0a0';
  gh.lineWidth = 3;
  gh.beginPath();
  gh.arc(c, c, c - 24, 0, Math.PI * 2);
  gh.stroke();
  // dots around
  gh.fillStyle = '#c8c8c8';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    gh.beginPath();
    gh.arc(c + Math.cos(a) * (c - 32), c + Math.sin(a) * (c - 32), 3, 0, Math.PI * 2);
    gh.fill();
  }
  gh.fillStyle = '#d8d8d8';
  gh.font = 'bold 120px Georgia, serif';
  gh.textAlign = 'center';
  gh.textBaseline = 'middle';
  gh.fillText('$', c, c + 6);
  // reeding strip (corner region u 0..0.12, v 0.96..1 => top-left in canvas)
  for (let x = 0; x < 31; x += 2) {
    gh.fillStyle = x % 4 ? '#303030' : '#d0d0d0';
    gh.fillRect(x, 0, 2, 10);
  }
  const normal = heightToNormal(ch, 2.5);
  normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping;
  const [cr, gr] = makeCanvas(64, 64);
  const r = rand(51);
  gr.fillStyle = '#5a5a5a';
  gr.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 300; i++) {
    gr.fillStyle = `rgba(255,255,255,${r() * 0.15})`;
    gr.fillRect(r() * 64, r() * 64, 1, 1);
  }
  return { normal, rough: toTex(cr, [1, 1], false) };
}

/**
 * Bill-bundle atlas. Rows (v): 0.5..1 = banknote face, 0.25..0.5 = paper edges,
 * 0..0.25 = paper band.
 */
export function billAtlas(): { map: THREE.Texture; normal: THREE.Texture } {
  const W = 512;
  const H = 512;
  const r = rand(61);
  const [cc, g] = makeCanvas(W, H);
  const [ch, gh] = makeCanvas(W, H);
  gh.fillStyle = '#808080';
  gh.fillRect(0, 0, W, H);
  // face (canvas y 0..256)
  g.fillStyle = '#c9d8b8';
  g.fillRect(0, 0, W, 256);
  g.strokeStyle = '#3f6b45';
  g.lineWidth = 10;
  g.strokeRect(12, 12, W - 24, 232);
  g.lineWidth = 2;
  g.strokeRect(30, 30, W - 60, 196);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(63,107,69,${0.05 + r() * 0.1})`;
    g.beginPath();
    g.arc(W / 2, 128, 30 + i * 2.2, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#e7eddc';
  g.beginPath();
  g.ellipse(W / 2, 128, 62, 80, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4b6e4c';
  g.beginPath();
  g.arc(W / 2, 108, 26, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(W / 2, 178, 44, 32, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2f5534';
  g.font = 'bold 64px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('100', 96, 82);
  g.fillText('100', W - 96, 176);
  g.font = 'bold 22px Georgia, serif';
  g.fillText('TYCOON RESERVE NOTE', W / 2, 30 + 6);
  // edges (canvas y 256..384)
  for (let y = 256; y < 384; y += 3) {
    const v = 215 + r() * 30;
    g.fillStyle = `rgb(${v - 15},${v},${v - 25})`;
    g.fillRect(0, y, W, 3);
    gh.fillStyle = r() > 0.5 ? '#a0a0a0' : '#505050';
    gh.fillRect(0, y, W, 1);
  }
  // band (canvas y 384..512)
  g.fillStyle = '#d8b34c';
  g.fillRect(0, 384, W, 128);
  g.fillStyle = '#9a7a28';
  g.font = 'bold 40px Georgia, serif';
  g.fillText('$10,000', W / 2, 448);
  const map = toTex(cc);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const normal = heightToNormal(ch, 2);
  normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normal };
}

/** Money bag atlas: burlap (v 0.2..1) with a $ decal around u = 0.25, rope (v 0..0.2). */
export function bagAtlas(): { map: THREE.Texture; normal: THREE.Texture } {
  const S = 512;
  const r = rand(71);
  const [cc, g] = makeCanvas(S, S);
  const [ch, gh] = makeCanvas(S, S);
  g.fillStyle = '#b8955f';
  g.fillRect(0, 0, S, S);
  gh.fillStyle = '#808080';
  gh.fillRect(0, 0, S, S);
  for (let y = 0; y < 410; y += 6)
    for (let x = 0; x < S; x += 6) {
      const odd = ((x + y) / 6) % 2;
      g.fillStyle = `rgba(70,45,15,${0.08 + r() * 0.12})`;
      g.fillRect(x, y, odd ? 3 : 6, odd ? 6 : 3);
      gh.fillStyle = odd ? '#c0c0c0' : '#404040';
      gh.fillRect(x, y, odd ? 3 : 6, odd ? 6 : 3);
    }
  blotches(g, S, 410, r, 20, 60, () => 'rgba(60,40,10,0.08)');
  // $ decal (stencilled)
  g.fillStyle = 'rgba(40,70,40,0.88)';
  g.font = 'bold 150px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(S * 0.25, 230);
  g.scale(0.65, 1);
  g.fillText('$', 0, 0);
  g.restore();
  // rope (canvas y 410..512)
  g.fillStyle = '#7a5a2e';
  g.fillRect(0, 410, S, 102);
  for (let x = -100; x < S; x += 14) {
    g.strokeStyle = '#a07c45';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, 410);
    g.lineTo(x + 60, 512);
    g.stroke();
    gh.strokeStyle = '#d0d0d0';
    gh.lineWidth = 5;
    gh.beginPath();
    gh.moveTo(x, 410);
    gh.lineTo(x + 60, 512);
    gh.stroke();
  }
  return { map: toTex(cc), normal: heightToNormal(ch, 2.5) };
}

export function posterTex(text: string, bg: string, fg: string): THREE.Texture {
  return canvasTex(256, 360, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 360);
    g.fillStyle = fg;
    g.font = 'bold 54px "Comic Sans MS", cursive';
    g.textAlign = 'center';
    g.fillText(text, 128, 190);
    g.font = '20px sans-serif';
    g.fillText('— probably someone', 128, 240);
    // printed paper wear
    const r = rand(text.length * 7);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
      g.fillRect(r() * 256, r() * 360, 2, 2);
    }
  });
}

export function labelTex(text: string, bg = '#fff8c4', fg = '#222', w = 256, h = 256, size = 30): THREE.Texture {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `bold ${size}px "Comic Sans MS", "Marker Felt", cursive`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    text.split('\n').forEach((line, i, arr) => g.fillText(line, w / 2, h / 2 + (i - (arr.length - 1) / 2) * size * 1.2));
  });
}

/** Soft round sprite for dust motes. */
export function softDot(): THREE.Texture {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Clock face with numerals. */
export function clockFace(): THREE.Texture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#f6f2e8';
    g.beginPath();
    g.arc(128, 128, 128, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    g.font = 'bold 30px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillText(String(i), 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const l = i % 5 ? 6 : 12;
      g.fillRect(128 + Math.sin(a) * (120 - l) - 1, 128 - Math.cos(a) * (120 - l) - 1, 2, 2);
    }
  });
}
