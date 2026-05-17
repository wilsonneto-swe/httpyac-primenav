'use strict';

/**
 * Renders the 128x128 Marketplace / Open VSX icon (images/icon.png).
 *
 * Self-contained: a hand-rolled PNG encoder plus 4x4 supersampling for
 * antialiased edges. No dependencies beyond Node's built-in zlib.
 *
 * Run: node scripts/make-icon.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 128;
const SS = 4; // supersampling factor

// --- icon geometry (in 128-space) -----------------------------------------

const BG = [33, 38, 46, 255]; // dark slate
const BAR = [201, 209, 217, 255]; // light grey "request line"
const ROWS = [
  { cy: 38, barEnd: 106, bullet: [63, 185, 80] }, // green  (POST)
  { cy: 64, barEnd: 106, bullet: [76, 142, 247] }, // blue   (GET)
  { cy: 90, barEnd: 86, bullet: [227, 135, 60] } // orange (PUT)
];

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px >= x1 || py < y0 || py >= y1) {
    return false;
  }
  const cx = px < x0 + r ? x0 + r : px > x1 - r ? x1 - r : px;
  const cy = py < y0 + r ? y0 + r : py > y1 - r ? y1 - r : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function colorAt(px, py) {
  let color = [0, 0, 0, 0];
  if (inRoundedRect(px, py, 0, 0, SIZE, SIZE, 24)) {
    color = BG;
  }
  for (const { cy, barEnd } of ROWS) {
    if (inRoundedRect(px, py, 46, cy - 6, barEnd, cy + 6, 6)) {
      color = BAR;
    }
  }
  for (const { cy, bullet } of ROWS) {
    if (inRoundedRect(px, py, 22, cy - 7, 36, cy + 7, 4)) {
      color = [bullet[0], bullet[1], bullet[2], 255];
    }
  }
  return color;
}

// --- rasterize with supersampling -----------------------------------------

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        // premultiply so transparent samples don't darken the edge
        r += c[0] * c[3];
        g += c[1] * c[3];
        b += c[2] * c[3];
        a += c[3];
      }
    }
    const o = (y * SIZE + x) * 4;
    pixels[o] = a ? Math.round(r / a) : 0;
    pixels[o + 1] = a ? Math.round(g / a) : 0;
    pixels[o + 2] = a ? Math.round(b / a) : 0;
    pixels[o + 3] = Math.round(a / (SS * SS));
  }
}

// --- PNG encoding ----------------------------------------------------------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0; // filter type: none
  pixels.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'images', 'icon.png');
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes, ${SIZE}x${SIZE})`);
