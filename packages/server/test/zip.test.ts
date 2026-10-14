// ADR-0025: the first-run zip. Reading what system tools write, and refusing what could escape, lie or explode.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readZip, safePath, ZIP_LIMITS } from "../src/index.ts";
import { makeZip } from "./zip-writer.ts";

const files = (z: ReturnType<typeof readZip>) => ("files" in z ? z.files.map((f) => [f.path, f.data.toString("utf8")]) : z.error);

function python(script: string): Buffer | null {
  const dir = mkdtempSync(join(tmpdir(), "glance-editor-zip-"));
  const out = join(dir, "t.zip");
  try {
    execFileSync("python3", ["-I", "-c", script, out], { stdio: "ignore" });
    return readFileSync(out);
  } catch {
    return null;
  }
}

describe("readZip", () => {
  it("stored and deflated files, UTF-8 names, Windows separators; folders and OS junk skipped", () => {
    const z = readZip(makeZip([
      { name: "glance/" },
      { name: "glance/config/glance.yml", data: "pages: []\n", deflate: true },
      { name: "glance\\assets\\Ünïcode.css", data: "body{}" },
      { name: "__MACOSX/glance/._glance.yml", data: "x" },
      { name: "glance/.DS_Store", data: "x" },
      { name: "glance/assets/._user.css", data: "x" },
    ]));
    expect(files(z)).toEqual([["glance/config/glance.yml", "pages: []\n"], ["glance/assets/Ünïcode.css", "body{}"]]);
  });

  it("a zip made by Python's zipfile, deflated, with ZIP64 records forced", () => {
    const zip = python(`import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    with z.open("g/glance.yml", "w", force_zip64=True) as f: f.write(b"pages: []\\n" * 100)
    z.writestr("g/assets/a.css", "body{}")`);
    if (!zip) return; // no python3 here; the other cases still run
    expect(files(readZip(zip))).toEqual([["g/glance.yml", "pages: []\n".repeat(100)], ["g/assets/a.css", "body{}"]]);
  });

  it("refuses paths that leave the folder", () => {
    for (const name of ["../evil.yml", "a/../../evil.yml", "/etc/passwd", "C:/x.yml", "a\\..\\..\\x"]) {
      expect(readZip(makeZip([{ name, data: "x" }]))).toMatchObject({ error: expect.stringContaining("outside the folder") });
    }
    expect(safePath("./a//b/./c")).toBe("a/b/c");
  });

  it("skips symbolic links instead of following them", () => {
    expect(files(readZip(makeZip([{ name: "assets/link", data: "/etc/passwd", mode: 0o120777 }, { name: "glance.yml", data: "a" }])))).toEqual([["glance.yml", "a"]]);
  });

  it("refuses encrypted files and unknown compression", () => {
    expect(readZip(makeZip([{ name: "a", data: "x", flags: 0x801 }]))).toMatchObject({ error: expect.stringContaining("encrypted") });
    expect(readZip(makeZip([{ name: "a", data: "x", method: 12 }]))).toMatchObject({ error: expect.stringContaining("compression") });
  });

  it("stops a file that inflates to more than it claims, and a wrong checksum", () => {
    const big = Buffer.alloc(5_000_000);
    expect(readZip(makeZip([{ name: "bomb", data: big, deflate: true, size: 10 }]))).toMatchObject({ error: expect.stringContaining("damaged") });
    expect(readZip(makeZip([{ name: "a", data: "hello", crc: 1 }]))).toMatchObject({ error: expect.stringContaining("damaged") });
  });

  it("limits: number of files, one file's size, the total", () => {
    const lim = { ...ZIP_LIMITS, files: 2, fileBytes: 10, totalBytes: 15 };
    expect(readZip(makeZip([{ name: "a" }, { name: "b" }, { name: "c" }]), lim)).toMatchObject({ error: expect.stringContaining("more than 2 files") });
    expect(readZip(makeZip([{ name: "a", data: "x".repeat(11) }]), lim)).toMatchObject({ error: expect.stringContaining("larger than") });
    expect(readZip(makeZip([{ name: "a", data: "x".repeat(8) }, { name: "b", data: "x".repeat(8) }]), lim)).toMatchObject({ error: expect.stringContaining("add up to") });
    // The size is checked before anything is inflated.
    expect(readZip(makeZip([{ name: "a", data: deflateRawSync(Buffer.alloc(1)), method: 8, size: 2 ** 31 }]))).toMatchObject({ error: expect.stringContaining("larger than") });
  });

  it("not a zip", () => {
    expect(readZip(Buffer.from("pages: []\n"))).toMatchObject({ error: expect.stringContaining("isn't a .zip") });
    expect(readZip(Buffer.alloc(0))).toMatchObject({ error: expect.stringContaining("isn't a .zip") });
  });
});
