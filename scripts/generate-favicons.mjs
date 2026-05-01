import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'public');
const src = resolve(root, 'logo.png');

const pngTargets = [
  { size: 16, file: 'favicon-16x16.png' },
  { size: 32, file: 'favicon-32x32.png' },
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 192, file: 'android-chrome-192x192.png' },
  { size: 512, file: 'android-chrome-512x512.png' },
];

async function makePng(size) {
  return sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// Build a multi-image ICO with embedded PNGs (16, 32, 48).
async function buildIco(sizes) {
  const pngs = await Promise.all(sizes.map((s) => makePng(s).then((data) => ({ s, data }))));
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + dirEntrySize * pngs.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(pngs.length, 4); // count

  const entries = [];
  let offset = dirSize;
  for (const { s, data } of pngs) {
    const e = Buffer.alloc(dirEntrySize);
    e.writeUInt8(s >= 256 ? 0 : s, 0); // width
    e.writeUInt8(s >= 256 ? 0 : s, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8); // size
    e.writeUInt32LE(offset, 12); // offset
    entries.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  for (const { size, file } of pngTargets) {
    const out = resolve(root, file);
    const buf = await makePng(size);
    await writeFile(out, buf);
    console.log(`wrote ${file} (${size}x${size}, ${buf.length} bytes)`);
  }

  const ico = await buildIco([16, 32, 48]);
  await writeFile(resolve(root, 'favicon.ico'), ico);
  console.log(`wrote favicon.ico (${ico.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
