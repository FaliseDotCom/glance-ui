// Reading the .zip of a Glance folder uploaded on the first-run screen (ADR-0025). Only what the zips made by
// Windows Explorer, macOS Finder, `zip` and 7-Zip use: stored or deflated files, ZIP64 for large ones (APPNOTE 6.3.10,
// sections 4.3 and 4.4). Encrypted files and other methods are refused with a message. Nothing here touches the disk.
import { crc32, inflateRawSync } from "node:zlib";

export interface ZipFile {
  /** Path inside the zip, with `/` separators, never absolute and never containing `..`. */
  path: string;
  data: Buffer;
}

export interface ZipLimits {
  /** Most files in the zip (folders not counted). */
  files: number;
  /** Largest single file, uncompressed. */
  fileBytes: number;
  /** All files together, uncompressed. */
  totalBytes: number;
}

export const ZIP_LIMITS: ZipLimits = { files: 5_000, fileBytes: 20 * 1024 * 1024, totalBytes: 200 * 1024 * 1024 };

const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/** Files an operating system adds that never belong to a Glance folder. */
function junk(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return path.startsWith("__MACOSX/") || name === ".DS_Store" || name === "Thumbs.db" || name === "desktop.ini" || name.startsWith("._");
}

/** `a\b/./c` → `a/b/c`; null when the path is absolute or climbs out with `..`. */
export function safePath(raw: string): string | null {
  const p = raw.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  const parts = p.split("/").filter((x) => x !== "" && x !== ".");
  if (parts.some((x) => x === "..")) return null;
  return parts.join("/");
}

export function readZip(zip: Buffer, limits: ZipLimits = ZIP_LIMITS): { files: ZipFile[] } | { error: string } {
  const notZip = { error: "This isn't a .zip file the editor can read. Zip the folder again and upload that." };
  // End of central directory: 22 bytes plus a comment of up to 65535 bytes, at the very end.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return notZip;
  let count = zip.readUInt16LE(eocd + 10);
  let cdOffset = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || zip.readUInt32LE(loc) !== 0x07064b50) return notZip;
    const z64 = Number(zip.readBigUInt64LE(loc + 8));
    if (z64 + 56 > zip.length || zip.readUInt32LE(z64) !== 0x06064b50) return notZip;
    count = Number(zip.readBigUInt64LE(z64 + 32));
    cdOffset = Number(zip.readBigUInt64LE(z64 + 48));
  }

  const files: ZipFile[] = [];
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) return notZip;
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    let size = zip.readUInt32LE(p + 24);
    let compressed = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const mode = zip.readUInt32LE(p + 38) >>> 16;
    let local = zip.readUInt32LE(p + 42);
    const rawName = zip.subarray(p + 46, p + 46 + nameLen);
    // Bit 11: the name is UTF-8. Otherwise it is CP437, which matches UTF-8 for the ASCII names Glance folders use.
    const name = (flags & 0x800 ? rawName.toString("utf8") : rawName.toString("latin1"));
    // ZIP64 extra field (0x0001): the 64-bit values, in this order, for those set to 0xffffffff above.
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen;) {
      const id = zip.readUInt16LE(e);
      const len = zip.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = Number(zip.readBigUInt64LE(q)); q += 8; }
        if (compressed === 0xffffffff) { compressed = Number(zip.readBigUInt64LE(q)); q += 8; }
        if (local === 0xffffffff) local = Number(zip.readBigUInt64LE(q));
      }
      e += 4 + len;
    }
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || name.endsWith("\\")) continue; // a folder
    if ((mode & 0xf000) === 0xa000) continue; // a symbolic link: never followed
    const path = safePath(name);
    if (path === null) return { error: `The zip contains "${name}", which points outside the folder. Zip the folder itself and upload that.` };
    if (path === "" || junk(path)) continue;
    if (flags & 0x1) return { error: `"${path}" is encrypted. Zip the folder without a password.` };
    if (method !== 0 && method !== 8) return { error: `"${path}" uses a compression the editor can't read. Zip the folder with your system's own Compress or Send to zip.` };
    if (files.length >= limits.files) return { error: `The zip has more than ${limits.files} files.` };
    if (size > limits.fileBytes) return { error: `"${path}" is larger than ${MB(limits.fileBytes)}.` };
    total += size;
    if (total > limits.totalBytes) return { error: `The files in the zip add up to more than ${MB(limits.totalBytes)}.` };

    if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) return notZip;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (start + compressed > zip.length) return notZip;
    const raw = zip.subarray(start, start + compressed);
    let data: Buffer;
    try {
      // maxOutputLength stops a file that inflates to more than it claims (a "zip bomb") as soon as it passes the size.
      data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
    } catch {
      return { error: `"${path}" in the zip is damaged.` };
    }
    if (data.length !== size || crc32(data) !== crc) return { error: `"${path}" in the zip is damaged.` };
    files.push({ path, data });
  }
  return { files };
}
