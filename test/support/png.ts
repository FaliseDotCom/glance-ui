// Tiny PNG helpers for tests (no dependency): solid-colour images to upload, and reading a pixel from a screenshot, so
// a test can check what the browser actually painted.
import { crc32, deflateSync, inflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** A solid RGB PNG. */
export function solidPng(rgb: [number, number, number], size = 32): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The RGB of one pixel of an 8-bit RGB or RGBA PNG (what Playwright's screenshots are). */
export function pixelAt(png: Buffer, x: number, y: number): [number, number, number] {
  let pos = 8, width = 0, height = 0, channels = 0;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.subarray(pos + 4, pos + 8).toString("latin1");
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("only 8-bit PNGs");
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (!channels) throw new Error("only RGB/RGBA PNGs");
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let r = 0; r <= Math.min(y, height - 1); r++) {
    const f = raw[r * (stride + 1)]!;
    const line = raw.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels]! : 0, b = prev[i]!, c = i >= channels ? prev[i - channels]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cur[i] = (line[i]! + pred) & 0xff;
    }
    cur.copy(prev);
  }
  const o = x * channels;
  return [cur[o]!, cur[o + 1]!, cur[o + 2]!];
}

/** Colours within `tol` per channel. */
export const near = (a: [number, number, number], b: [number, number, number], tol = 24) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);
