#!/usr/bin/env node
/* ==========================================================================
   GRIMHOLLOW — icons.js
   Generates the PWA icon set as real PNGs. Android's "Add to Home screen"
   wants raster icons at 192 and 512; SVG manifest icons are unevenly
   supported, so we rasterise here instead of hoping.

   No dependencies: a tiny PNG encoder over Node's built-in zlib, plus a
   supersampled point-in-polygon fill for the crown sigil.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ------------------------------------------------------------ PNG encoder - */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/* rgba: Buffer of w*h*4 bytes */
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // each scanline gets a leading filter byte (0 = None)
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------------------------------------------------------- drawing - */
/* The crown sigil, in a 32x32 design box — same shape as the favicon so the
   installed icon and the browser tab agree. */
const CROWN = [
  [6, 20], [10, 9], [13, 15], [16, 7], [19, 15], [22, 9], [26, 20]
];

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/* Render one icon.
   `safe` shrinks the sigil so it survives Android's maskable circle crop. */
function render(size, opts) {
  opts = opts || {};
  const bg = hex(opts.bg || '#0a0810');
  const fg = hex(opts.fg || '#e0b64a');
  const glow = hex(opts.glow || '#e0b64a');
  const inset = opts.safe ? 0.72 : 0.86;   // fraction of the icon the sigil spans
  const SS = 3;                            // supersampling factor per axis

  const buf = Buffer.alloc(size * size * 4);

  // design-box -> pixel transform
  const span = size * inset;
  const off = (size - span) / 2;
  const s = span / 32;
  // the crown occupies rows 7..20 of the design box; centre that band vertically
  const yShift = (32 - (20 + 7)) / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = (px + (sx + 0.5) / SS - off) / s;
          const gy = (py + (sy + 0.5) / SS - off) / s - yShift;
          if (inPoly(CROWN, gx, gy)) hits++;
        }
      }
      const cov = hits / (SS * SS);

      // radial vignette so the tile doesn't read as a flat square
      const dx = (px - size / 2) / (size / 2), dy = (py - size / 2) / (size / 2);
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const vig = 1 - 0.45 * d * d;

      // soft gold bloom behind the sigil
      const bloom = Math.max(0, 1 - d * 1.5) * 0.16;

      let r = bg[0] * vig + glow[0] * bloom;
      let g = bg[1] * vig + glow[1] * bloom;
      let b = bg[2] * vig + glow[2] * bloom;

      if (cov > 0) {
        // vertical gradient on the gold: brighter at the crown's points
        const t = Math.max(0, Math.min(1, (py - off) / span));
        const lift = 1.12 - 0.3 * t;
        r = r * (1 - cov) + Math.min(255, fg[0] * lift) * cov;
        g = g * (1 - cov) + Math.min(255, fg[1] * lift) * cov;
        b = b * (1 - cov) + Math.min(255, fg[2] * lift) * cov;
      }

      const o = (py * size + px) * 4;
      buf[o] = Math.round(Math.max(0, Math.min(255, r)));
      buf[o + 1] = Math.round(Math.max(0, Math.min(255, g)));
      buf[o + 2] = Math.round(Math.max(0, Math.min(255, b)));
      buf[o + 3] = 255;
    }
  }
  return encodePNG(size, size, buf);
}

/* ----------------------------------------------------------------- write -- */
function writeIcons(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  const jobs = [
    ['icon-192.png', 192, {}],
    ['icon-512.png', 512, {}],
    ['icon-maskable-192.png', 192, { safe: true }],
    ['icon-maskable-512.png', 512, { safe: true }],
    ['apple-touch-icon.png', 180, {}]
  ];
  for (const [name, size, opts] of jobs) {
    const png = render(size, opts);
    fs.writeFileSync(path.join(dir, name), png);
    out.push({ name, size, bytes: png.length });
  }
  return out;
}

module.exports = { writeIcons, render, encodePNG };

/* run directly: node icons.js [outDir] */
if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, 'dist');
  for (const i of writeIcons(dir)) {
    console.log(`  + ${i.name.padEnd(26)} ${i.size}px  ${(i.bytes / 1024).toFixed(1)} KB`);
  }
}
