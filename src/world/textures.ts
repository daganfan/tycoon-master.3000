import * as THREE from 'three';

/** Small seeded noise helper so procedural textures look the same every run. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1], srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function woodFloor(): { map: THREE.Texture; rough: THREE.Texture } {
  const r = rand(7);
  const draw = (g: CanvasRenderingContext2D, rough: boolean) => {
    const plankH = 64;
    for (let y = 0; y < 1024; y += plankH) {
      let x = -Math.floor(r() * 300);
      while (x < 1024) {
        const len = 280 + r() * 300;
        const base = rough ? 150 + r() * 40 : 0;
        if (rough) g.fillStyle = `rgb(${base},${base},${base})`;
        else {
          const l = 30 + r() * 14;
          g.fillStyle = `hsl(${26 + r() * 8}, ${45 + r() * 10}%, ${l}%)`;
        }
        g.fillRect(x, y, len, plankH);
        for (let i = 0; i < 26; i++) {
          g.strokeStyle = rough ? `rgba(255,255,255,${0.05 + r() * 0.1})` : `rgba(40,20,5,${0.08 + r() * 0.12})`;
          g.lineWidth = 1 + r() * 2;
          const yy = y + r() * plankH;
          g.beginPath();
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len * 0.3, yy + r() * 6 - 3, x + len * 0.6, yy + r() * 6 - 3, x + len, yy);
          g.stroke();
        }
        g.fillStyle = rough ? '#fff' : 'rgba(20,10,0,0.6)';
        g.fillRect(x, y, 3, plankH);
        x += len;
      }
      g.fillStyle = rough ? '#fff' : 'rgba(20,10,0,0.55)';
      g.fillRect(0, y, 1024, 3);
    }
  };
  return { map: canvasTex(1024, 1024, (g) => draw(g, false), [3, 3]), rough: canvasTex(1024, 1024, (g) => draw(g, true), [3, 3], false) };
}

export function wallPaint(hue = 200): THREE.Texture {
  const r = rand(11);
  return canvasTex(512, 512, (g) => {
    g.fillStyle = `hsl(${hue}, 18%, 72%)`;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.025)`;
      g.fillRect(r() * 512, r() * 512, 2, 2);
    }
    // faint vertical stripes
    for (let x = 0; x < 512; x += 64) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x, 0, 30, 512);
    }
  }, [4, 2]);
}

export function rug(): THREE.Texture {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#7a2e2e';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#d9b26f';
    g.lineWidth = 14;
    g.strokeRect(30, 30, 452, 452);
    g.lineWidth = 6;
    g.strokeRect(70, 70, 372, 372);
    g.fillStyle = '#2f4e6f';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(256, 256, 160 - i * 24, 0, Math.PI * 2);
      g.fillStyle = i % 2 ? '#2f4e6f' : '#a14b3a';
      g.fill();
    }
  });
}

export function fabric(color: string): THREE.Texture {
  const r = rand(3);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 4)
      for (let x = 0; x < 256; x += 4) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
        g.fillRect(x, y, 2, 4);
      }
  }, [2, 2]);
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
