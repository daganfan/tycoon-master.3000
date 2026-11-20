/**
 * Zips dist/ into release/TycoonMaster3000-web-<version>.zip with index.html at the root,
 * ready to upload to itch.io (HTML5), Netlify Drop, etc. Run via `npm run package:web`.
 */
import { deflateRawSync, crc32 } from 'node:zlib';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run `npm run build` first');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const locals: Buffer[] = [];
const centrals: Buffer[] = [];
let offset = 0;
for (const file of walk(dist).sort()) {
  const name = Buffer.from(relative(dist, file).split('\\').join('/'));
  const raw = readFileSync(file);
  const data = deflateRawSync(raw, { level: 9 });
  const crc = crc32(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(0x21, 12); // date: 1980-01-01
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  locals.push(local, name, data);
  centrals.push(central, name);
  offset += local.length + name.length + data.length;
}
const cd = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8);
end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `TycoonMaster3000-web-${version}.zip`);
writeFileSync(out, Buffer.concat([...locals, cd, end]));
console.log(`wrote ${relative(root, out)} (${centrals.length / 2} files)`);
