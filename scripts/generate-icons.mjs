// Generates the PWA icons (a leaf inside a lens) as PNGs with no dependencies.
// Run: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x2f, 0x5d, 0x3a];
const RING = [0xf7, 0xf4, 0xec];
const LEAF = [0xbf, 0xdc, 0xa8];
const VEIN = [0x2f, 0x5d, 0x3a];

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x4 supersampling for anti-aliasing
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          for (let i = 0; i < 4; i++) acc[i] += p[i];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 4; i++) raw[o + i] = Math.round(acc[i] / 16);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function design({ rounded, scale }) {
  return (u, v) => {
    // background
    if (rounded) {
      const r = 0.22,
        dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0),
        dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
    }
    // content coordinates, scaled toward center (maskable safe zone)
    const x = (u - 0.5) / scale,
      y = (v - 0.5) / scale;
    const d = Math.hypot(x, y);
    if (d > 0.33 && d < 0.4) return [...RING, 255];
    // handle of the lens
    const hx = (x - y) / Math.SQRT2,
      hy = (x + y) / Math.SQRT2;
    if (hy > 0.39 && hy < 0.6 && Math.abs(hx) < 0.045) return [...RING, 255];
    // leaf: vesica rotated 45°, inside lens
    const lx = (x + y) / Math.SQRT2,
      ly = (y - x) / Math.SQRT2;
    const inLeaf = Math.hypot(lx, ly - 0.19) < 0.32 && Math.hypot(lx, ly + 0.19) < 0.32;
    if (inLeaf) {
      if (Math.abs(ly) < 0.012 && Math.abs(lx) < 0.2) return [...VEIN, 255];
      return [...LEAF, 255];
    }
    return [...BG, 255];
  };
}

writeFileSync('public/pwa-192.png', png(192, design({ rounded: true, scale: 1 })));
writeFileSync('public/pwa-512.png', png(512, design({ rounded: true, scale: 1 })));
writeFileSync('public/pwa-maskable-512.png', png(512, design({ rounded: false, scale: 0.78 })));
writeFileSync('public/apple-touch-icon.png', png(180, design({ rounded: false, scale: 0.85 })));
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2f5d3a"/><circle cx="32" cy="32" r="23" fill="none" stroke="#f7f4ec" stroke-width="4.5"/><path d="M22 42C22 30 30 22 42 22C42 34 34 42 22 42Z" fill="#bfdca8"/><path d="M24 40L40 24" stroke="#2f5d3a" stroke-width="1.6"/></svg>\n`,
);
console.log('icons written to public/');
