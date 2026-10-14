// Test helper: writes .zip files (stored or deflated), with knobs to make broken or hostile ones.
import { crc32, deflateRawSync } from "node:zlib";

export interface Entry {
  name: string;
  data?: string | Buffer;
  deflate?: boolean;
  /** Overrides, to build broken zips. */
  flags?: number;
  method?: number;
  size?: number;
  crc?: number;
  /** Unix mode in the external attributes (0o120777 for a symbolic link). */
  mode?: number;
}

export function makeZip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? "", "utf8");
    const body = e.deflate ? deflateRawSync(data) : data;
    const name = Buffer.from(e.name, "utf8");
    const method = e.method ?? (e.deflate ? 8 : 0);
    const flags = e.flags ?? 0x800;
    const crc = e.crc ?? crc32(data);
    const size = e.size ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x031e, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
