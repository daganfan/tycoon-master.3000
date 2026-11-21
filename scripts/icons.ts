/**
 * Renders the app icon set from public/icon.svg.
 * Run with `npm run icons` after editing the SVG; the PNGs are committed.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(`${root}public/icon.svg`);
const BG = '#0b0c14';

async function plain(size: number, out: string): Promise<void> {
  await sharp(svg, { density: Math.ceil((72 * size) / 512) * 2 })
    .resize(size, size)
    .png()
    .toFile(out);
}

/** Full-bleed square with the icon inside the 80% safe zone (Android adaptive icons, iOS). */
async function padded(size: number, scale: number, out: string): Promise<void> {
  const inner = Math.round(size * scale);
  const icon = await sharp(svg, { density: Math.ceil((72 * inner) / 512) * 2 })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(out);
}

mkdirSync(`${root}electron/resources`, { recursive: true });
await plain(32, `${root}public/favicon-32.png`);
await plain(192, `${root}public/pwa-192.png`);
await plain(512, `${root}public/pwa-512.png`);
await padded(512, 0.78, `${root}public/maskable-512.png`);
await padded(180, 0.86, `${root}public/apple-touch-icon.png`);
await plain(1024, `${root}electron/resources/icon.png`);
console.log('icons written');
