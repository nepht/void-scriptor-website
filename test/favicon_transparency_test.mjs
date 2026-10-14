import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';

// Minimal PNG reader — enough to inspect an 8-bit RGBA image pixel by pixel.
// Node ships no image decoder, and the point of this test is to look at actual
// pixels, not at file metadata.
function readRgbaPng(path) {
  const buf = fs.readFileSync(path);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${path} must be a PNG`);
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  assert.equal(depth, 8, `${path} must be 8-bit`);
  assert.equal(colorType, 6, `${path} must be RGBA so it can carry transparency`);

  const bpp = 4;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

// The tab icons used to sit on a dark rounded tile. That tile read as a black
// square on light browser themes and disappeared into dark ones, so the artwork
// is now drawn straight onto a transparent background. A browser paints the tab
// icon at 16-32px, which is why only these two files carry the contract.
const FILES = ['assets/favicon-16x16.png', 'assets/favicon-32x32.png'];

for (const file of FILES) {
  test(`${file} keeps a transparent background`, () => {
    const { width, height, data } = readRgbaPng(file);
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) clear++;
    }
    const ratio = clear / (width * height);
    assert.ok(
      ratio > 0.35,
      `${file}: only ${(ratio * 100).toFixed(0)}% of pixels are transparent — a background tile is back`,
    );
    assert.equal(data[3], 0, `${file}: the top-left pixel must be transparent`);
  });
}
