// What the editor finds in an uploaded Glance folder (ADR-0025): glance.yml and the files it includes, the assets
// folder, and `.env`. Glance's own Docker Compose template is the usual layout (Glance v0.8.6 README, read 2026-10-14):
//   docker-compose.yml  .env  config/glance.yml  config/home.yml  assets/user.css
// The zip may also hold the folder itself (`glance/config/glance.yml`), or only the config folder.
import { posix } from "node:path";
import type { ZipFile } from "./zip.ts";

// Glance v0.8.6 config.go: configIncludePattern; paths are relative to the including file (config.go:246-292).
const INCLUDE = /^([ \t]*)(?:-[ \t]*)?(?:!|\$)include:[ \t]*(.+)$/gm;
/** A variable name in a `.env` line (`NAME=value`, optionally `export NAME=value`). */
const ENV_LINE = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/gm;
const TEXT_LIMIT = 1024 * 1024;

export interface UploadFound {
  /** glance.yml's path inside the zip. */
  config: string;
  /** Include files, as paths inside the zip, in the order Glance reads them. */
  includes: string[];
  /** Includes that name a file the zip doesn't have. */
  missing: string[];
  /** Includes with an absolute path or one leading out of the zip (the editor reads only what was uploaded). */
  outside: string[];
  /** Every YAML file reachable from glance.yml, by path inside the zip, to write out for `config:print`. */
  yaml: Map<string, Buffer>;
  /** `.env` next to glance.yml or in a folder above it, if any. */
  env: { path: string; data: Buffer; names: string[] } | null;
  /** Other glance.yml files in the zip (the shallowest one is used). */
  others: string[];
}

const depth = (p: string) => p.split("/").length;

export function findConfig(files: readonly ZipFile[]): UploadFound | { error: string } {
  const configs = files.filter((f) => /^glance\.ya?ml$/.test(posix.basename(f.path))).sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path));
  const main = configs[0];
  if (!main) return { error: "The zip has no glance.yml. Zip the folder that holds your glance.yml (or the folder above it) and upload that." };
  const byPath = new Map(files.map((f) => [f.path, f]));
  const found: UploadFound = { config: main.path, includes: [], missing: [], outside: [], yaml: new Map(), env: null, others: configs.slice(1).map((c) => c.path) };

  const visit = (f: ZipFile, level: number) => {
    found.yaml.set(f.path, f.data);
    if (level > 20) return;
    for (const m of f.data.toString("utf8").matchAll(INCLUDE)) {
      const raw = (m[2] ?? "").trim();
      const joined = raw.startsWith("/") ? null : posix.normalize(posix.join(posix.dirname(f.path), raw));
      if (joined === null || joined === ".." || joined.startsWith("../")) {
        if (!found.outside.includes(raw)) found.outside.push(raw);
        continue;
      }
      if (found.yaml.has(joined) || found.includes.includes(joined) || found.missing.includes(joined)) continue;
      const inc = byPath.get(joined);
      if (!inc) { found.missing.push(joined); continue; }
      found.includes.push(joined);
      visit(inc, level + 1);
    }
  };
  visit(main, 0);
  const big = [...found.yaml].find(([, d]) => d.length > TEXT_LIMIT);
  if (big) return { error: `${big[0]} is larger than 1 MB.` };

  const env = byPath.get(upwards(main.path, ".env", byPath));
  if (env) found.env = { path: env.path, data: env.data, names: [...new Set([...env.data.toString("utf8").matchAll(ENV_LINE)].map((m) => m[1] ?? ""))] };
  return found;
}

/**
 * The first `name` in glance.yml's folder or a folder above it, up to the zip's top. Returns a path inside the zip
 * (which may not exist when nothing is found).
 */
function upwards(config: string, name: string, has: { has(p: string): boolean }): string {
  let dir = posix.dirname(config);
  for (;;) {
    const p = dir === "." ? name : `${dir}/${name}`;
    if (has.has(p) || dir === ".") return p;
    dir = posix.dirname(dir);
  }
}

/**
 * The assets folder: named like the last part of glance.yml's `server: assets-path` (`/app/assets` → `assets`), or
 * `assets`, in glance.yml's folder or a folder above it. Returns its files with paths relative to it.
 */
export function findAssets(files: readonly ZipFile[], config: string, assetsPath: string | undefined): { folder: string; files: ZipFile[] } | null {
  const names = [...new Set([assetsPath ? posix.basename(assetsPath.replace(/\/+$/, "")) : "", "assets"].filter(Boolean))];
  const folders = new Set<string>();
  for (const f of files) for (let d = posix.dirname(f.path); d !== "."; d = posix.dirname(d)) folders.add(d);
  for (const name of names) {
    const folder = upwards(config, name, folders);
    if (!folders.has(folder)) continue;
    const inside = files.filter((f) => f.path.startsWith(`${folder}/`)).map((f) => ({ path: f.path.slice(folder.length + 1), data: f.data }));
    return { folder, files: inside };
  }
  return null;
}

/** `/assets/…` links in glance.yml (icons, logo, custom CSS), as paths inside the assets folder. */
export function assetLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|[\s"':(=])\/assets\/([^\s"'?#)<>]+)/gm)) {
    try { out.add(decodeURIComponent(m[1] ?? "")); } catch { out.add(m[1] ?? ""); }
  }
  return [...out].filter(Boolean);
}
