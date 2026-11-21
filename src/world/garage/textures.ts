import * as THREE from 'three';

/** Seeded noise so the garage looks the same every run. */
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

/** Sealed garage concrete: mottled grey, control joints, hairline cracks. Returns colour + roughness maps. */
export function concrete(repeat: [number, number]): { map: THREE.Texture; rough: THREE.Texture } {
  const draw = (g: CanvasRenderingContext2D, rough: boolean) => {
    const r = rand(21);
    const S = 1024;
    g.fillStyle = rough ? '#b4b4b4' : '#8e8b86';
    g.fillRect(0, 0, S, S);
    // Large soft mottling.
    for (let i = 0; i < 260; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 30 + r() * 140;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const v = rough ? (r() > 0.5 ? 255 : 90) : r() > 0.5 ? 200 : 60;
      gr.addColorStop(0, `rgba(${v},${v},${v * (rough ? 1 : 0.97)},${rough ? 0.08 : 0.07})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Aggregate speckle.
    for (let i = 0; i < 40000; i++) {
      const v = r() > 0.5 ? 230 : 40;
      g.fillStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.08})`;
      g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    // Hairline cracks.
    g.strokeStyle = rough ? 'rgba(255,255,255,0.5)' : 'rgba(40,38,35,0.35)';
    for (let i = 0; i < 6; i++) {
      g.lineWidth = 1 + r();
      g.beginPath();
      let x = r() * S;
      let y = r() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += (r() - 0.5) * 70;
        y += (r() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Saw-cut control joints at the tile edges.
    g.fillStyle = rough ? '#ffffff' : 'rgba(30,28,26,0.55)';
    g.fillRect(0, 0, S, 4);
    g.fillRect(0, 0, 4, S);
  };
  return { map: canvasTex(1024, 1024, (g) => draw(g, false), repeat), rough: canvasTex(1024, 1024, (g) => draw(g, true), repeat, false) };
}

/** Painted cinder-block wall (running bond). */
export function cinderBlock(repeat: [number, number], paint = '#d9d4c7'): { map: THREE.Texture; bump: THREE.Texture } {
  const draw = (g: CanvasRenderingContext2D, bump: boolean) => {
    const r = rand(5);
    const S = 512;
    const bw = 256;
    const bh = 128;
    g.fillStyle = bump ? '#2a2a2a' : '#a8a397';
    g.fillRect(0, 0, S, S);
    for (let row = 0; row < S / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < S / bw + 1; col++) {
        const x = col * bw + off + 5;
        const y = row * bh + 5;
        if (bump) g.fillStyle = `rgb(${200 + r() * 30},${200 + r() * 30},${200 + r() * 30})`;
        else {
          const c = new THREE.Color(paint).offsetHSL(0, 0, (r() - 0.5) * 0.04);
          g.fillStyle = `#${c.getHexString()}`;
        }
        g.fillRect(x, y, bw - 10, bh - 10);
        // Pitted block surface.
        for (let i = 0; i < 160; i++) {
          g.fillStyle = bump ? `rgba(0,0,0,${0.15 + r() * 0.3})` : `rgba(0,0,0,${0.04 + r() * 0.06})`;
          g.beginPath();
          g.arc(x + r() * (bw - 10), y + r() * (bh - 10), 0.5 + r() * 2.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    if (!bump) {
      // A few drips and scuffs.
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `rgba(70,60,45,${0.04 + r() * 0.05})`;
        g.fillRect(r() * S, r() * S, 2 + r() * 4, 20 + r() * 80);
      }
    }
  };
  return { map: canvasTex(512, 512, (g) => draw(g, false), repeat), bump: canvasTex(512, 512, (g) => draw(g, true), repeat, false) };
}

/** Rubber conveyor belt with chevron cleats; scroll `offset.x` to animate. */
export function beltTexture(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#1d1e20';
    g.fillRect(0, 0, 256, 128);
    const r = rand(9);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
      g.fillRect(r() * 256, r() * 128, 2, 1);
    }
    g.strokeStyle = '#3a3c40';
    g.lineWidth = 10;
    for (let x = -64; x < 320; x += 64) {
      g.beginPath();
      g.moveTo(x, 8);
      g.lineTo(x + 28, 64);
      g.lineTo(x, 120);
      g.stroke();
    }
  });
}

/** Oil stain decal (alpha). */
export function oilStain(seed = 3): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const r = rand(seed);
    for (let i = 0; i < 16; i++) {
      const x = 128 + (r() - 0.5) * 90;
      const y = 128 + (r() - 0.5) * 70;
      const rad = 20 + r() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(18,16,14,0.55)');
      gr.addColorStop(0.7, 'rgba(25,22,18,0.25)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
  });
}

/** Perforated hardboard pegboard. */
export function pegboard(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#b98b5a';
    g.fillRect(0, 0, 256, 256);
    const r = rand(13);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(90,55,25,${r() * 0.08})`;
      g.fillRect(r() * 256, r() * 256, 3, 1);
    }
    g.fillStyle = '#3d2814';
    for (let y = 8; y < 256; y += 16) for (let x = 8; x < 256; x += 16) {
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }, [3, 2]);
}

/** Yellow/black hazard stripes. */
export function hazard(): THREE.CanvasTexture {
  return canvasTex(256, 32, (g) => {
    g.fillStyle = '#f2c200';
    g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#1a1a1a';
    for (let x = -32; x < 288; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 32, 32);
      g.lineTo(x + 16, 32);
      g.fill();
    }
  }, [4, 1]);
}

/** Corrugated roll-up door slats. */
export function rollUpDoor(): { map: THREE.Texture; bump: THREE.Texture } {
  const draw = (g: CanvasRenderingContext2D, bump: boolean) => {
    for (let y = 0; y < 512; y += 32) {
      const gr = g.createLinearGradient(0, y, 0, y + 32);
      if (bump) {
        gr.addColorStop(0, '#202020');
        gr.addColorStop(0.5, '#e0e0e0');
        gr.addColorStop(1, '#202020');
      } else {
        gr.addColorStop(0, '#9aa0a6');
        gr.addColorStop(0.45, '#e9ecef');
        gr.addColorStop(1, '#868e96');
      }
      g.fillStyle = gr;
      g.fillRect(0, y, 512, 32);
    }
  };
  return { map: canvasTex(512, 512, (g) => draw(g, false), [1, 2]), bump: canvasTex(512, 512, (g) => draw(g, true), [1, 2], false) };
}

/** Floating price tag / sign: rounded dark panel with big text. Returns texture + aspect. */
export function signTex(lines: { text: string; size: number; color: string; bold?: boolean }[], bg = 'rgba(12,14,20,0.82)', border = '#ffd43b', w = 512): THREE.CanvasTexture {
  const pad = 22;
  const h = Math.ceil(lines.reduce((a, l) => a + l.size * 1.25, 0) + pad * 2);
  const t = canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 26);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = border;
    g.stroke();
    let y = pad;
    for (const l of lines) {
      g.font = `${l.bold === false ? '' : 'bold '}${l.size}px "Segoe UI", system-ui, sans-serif`;
      g.fillStyle = l.color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(l.text, w / 2, y + l.size * 0.62, w - 30);
      y += l.size * 1.25;
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
