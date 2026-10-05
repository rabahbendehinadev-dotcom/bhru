// Rebuild the PWA icons from BHRU's existing RGBA PNG. Uses only Node built-ins.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const png = readFileSync(`${root}brand/bhru-icon.png`);
let width, height, blocks = [];
for (let at = 8; at < png.length;) {
  const length = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
  const chunk = png.subarray(at + 8, at + 8 + length);
  if (type === 'IHDR') {
    width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
    if (chunk[8] !== 8 || chunk[9] !== 6 || chunk[12] !== 0) throw Error('Source must be a non-interlaced 8-bit RGBA PNG.');
  }
  if (type === 'IDAT') blocks.push(chunk);
  at += length + 12;
}
const packed = inflateSync(Buffer.concat(blocks)), pixels = Buffer.alloc(width * height * 4);
function paeth(a, b, c) {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}
for (let y = 0; y < height; y++) {
  const filter = packed[y * (width * 4 + 1)];
  for (let x = 0; x < width * 4; x++) {
    const at = y * width * 4 + x, a = x >= 4 ? pixels[at - 4] : 0;
    const b = y ? pixels[at - width * 4] : 0, c = y && x >= 4 ? pixels[at - width * 4 - 4] : 0;
    const predictors = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)];
    pixels[at] = (packed[y * (width * 4 + 1) + 1 + x] + predictors[filter]) & 255;
  }
}
const table = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const value of bytes) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, bytes, checksum]);
}
function image(size, inset = 0) {
  const output = Buffer.alloc(size * size * 4);
  for (let at = 0; at < output.length; at += 4) {
    output[at] = 9; output[at + 1] = 14; output[at + 2] = 25; output[at + 3] = inset ? 255 : 0;
  }
  const inner = size - inset * 2;
  for (let y = 0; y < inner; y++) for (let x = 0; x < inner; x++) {
    const sx = Math.max(0, Math.min(width - 1, (x + .5) * width / inner - .5));
    const sy = Math.max(0, Math.min(height - 1, (y + .5) * height / inner - .5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), dx = sx - x0, dy = sy - y0;
    const points = [[x0, y0, (1-dx)*(1-dy)], [Math.min(x0+1,width-1), y0, dx*(1-dy)],
      [x0, Math.min(y0+1,height-1), (1-dx)*dy], [Math.min(x0+1,width-1), Math.min(y0+1,height-1), dx*dy]];
    let alpha = 0; const rgb = [0,0,0];
    for (const [px, py, weight] of points) {
      const at = (py * width + px) * 4, a = pixels[at + 3] / 255 * weight;
      alpha += a;
      for (let c = 0; c < 3; c++) rgb[c] += pixels[at + c] * a;
    }
    const at = ((y + inset) * size + x + inset) * 4;
    for (let c = 0; c < 3; c++) output[at+c] = Math.round(inset ? rgb[c] + output[at+c] * (1-alpha) : alpha ? rgb[c]/alpha : 0);
    output[at+3] = inset ? 255 : Math.round(alpha*255);
  }
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) output.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y+1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([png.subarray(0,8), chunk('IHDR',header), chunk('IDAT',deflateSync(rows)), chunk('IEND',Buffer.alloc(0))]);
}
mkdirSync(`${root}pwa`, { recursive: true });
for (const size of [192, 512]) writeFileSync(`${root}pwa/icon-${size}.png`, image(size));
writeFileSync(`${root}pwa/apple-touch-icon.png`, image(180));
writeFileSync(`${root}pwa/icon-maskable-512.png`, image(512, 112));
console.log('Generated 192px, 512px, maskable and Apple icons from the existing BHRU logo.');