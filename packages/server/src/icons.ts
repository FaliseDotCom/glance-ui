// The icon finder's server side (design D-21, D-54 to D-56; ADR-0020):
//   - the four libraries' name lists (Glance's si/sh/di/mdi), fetched from the same jsDelivr paths Glance loads icons
//     from, cached on disk for a week, and searched here;
//   - web search: Iconify (icons and logos) and Openverse (openly licensed images), Wikimedia Commons when Openverse
//     fails or finds nothing (D-56, decided 2026-10-13);
//   - the site's own icon, found from the link's page;
//   - downloading a pick into Glance's assets folder, with its licence and credit in a file next to it (D-55).
// The browser never names a URL to download: it names a result this server offered, so only offered images are fetched.
// Response formats read 2026-10-14 (each service's live response; see docs/adr/0020-icon-finder.md).
import { createHash, randomUUID } from "node:crypto";
import { access, constants, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GLANCE_CDN, iconSlug, iconUrl, LIBRARIES, type LibraryId } from "@glance-editor/editing";

export interface IconSources {
  cdn: string;
  iconify: string;
  openverse: string;
  wikimedia: string;
}

export const ICON_SOURCES: IconSources = {
  cdn: GLANCE_CDN,
  iconify: "https://api.iconify.design",
  openverse: "https://api.openverse.org",
  wikimedia: "https://commons.wikimedia.org",
};

export interface IconsConfig {
  /** Where the name lists are cached (the editor's data dir). */
  cacheDir: string;
  /** Glance's assets folder as the editor sees it. Without it nothing can be downloaded. */
  assetsDir?: string | undefined;
  sources?: Partial<IconSources>;
  fetch?: typeof fetch;
  now?: () => Date;
  userAgent?: string;
}

export interface LibraryIcon {
  /** What is written: "si:jellyfin", "di:foo.png". */
  value: string;
  name: string;
  library: LibraryId;
  title?: string;
  aliases?: string[];
}

export interface IconHit extends LibraryIcon {
  preview: string;
}

export interface LibraryStatus {
  ok: boolean;
  count: number;
  fetchedAt: string | null;
  error?: string;
}

export interface WebResult {
  id: string;
  kind: "icon" | "image";
  title: string;
  provider: string;
  license: string;
  licenseUrl?: string;
  creator?: string;
  landing?: string;
  preview: string;
  width?: number;
  height?: number;
}

export interface WebSearch {
  icons: WebResult[];
  images: WebResult[];
  imagesFrom: "openverse" | "wikimedia" | null;
  errors: string[];
}

export type SiteIcon =
  | { status: "found"; id: string; domain: string; preview: string }
  | { status: "none"; domain: string; message: string };

export type DownloadResult = { ok: true; value: string; file: string } | { ok: false; message: string };

interface Offer {
  title: string;
  name: string;
  url: string;
  credit: Record<string, string | undefined>;
  bytes?: { data: Buffer; ext: string };
  at: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;
const OFFER_TTL_MS = 60 * 60 * 1000;

/** The paths Glance loads icons from (config-fields.go), with the name list each library publishes next to them. */
const INDEX_URLS: Record<LibraryId, string[]> = {
  si: ["/npm/simple-icons@latest/data/simple-icons.json"],
  sh: ["/gh/selfhst/icons@main/index.json"],
  di: ["/gh/homarr-labs/dashboard-icons/tree.json", "/gh/homarr-labs/dashboard-icons/metadata.json"],
  mdi: ["/npm/@mdi/svg@latest/meta.json"],
};

type J = Record<string, unknown>;
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as J[]) : []);
const s = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const strip = (html: string | undefined) => html?.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || undefined;

/** Each library's name list → the values Glance accepts. Exported for tests. */
export function normalizeIndex(lib: LibraryId, files: unknown[]): LibraryIcon[] {
  const [a, b] = files;
  switch (lib) {
    case "si":
      return arr(a).filter((x) => s(x.slug)).map((x) => ({
        value: `si:${x.slug}`, name: x.slug as string, library: lib, title: s(x.title),
        aliases: arr([x.aliases]).flatMap((al) => (Array.isArray(al.aka) ? (al.aka as unknown[]).filter((y): y is string => typeof y === "string") : [])),
      }));
    case "sh":
      // index.json: Reference is the file name; SVG/PNG/WebP say which formats exist ("Yes"/"No").
      return arr(a).filter((x) => s(x.Reference)).map((x) => {
        const ext = x.SVG === "Yes" ? "" : x.PNG === "Yes" ? ".png" : x.WebP === "Yes" ? ".webp" : "";
        return { value: `sh:${x.Reference}${ext}`, name: x.Reference as string, library: lib, title: s(x.Name), aliases: s(x.Tags)?.split(/,\s*/) };
      });
    case "di": {
      // tree.json lists the files per format; an icon without an svg needs ".png" or Glance asks for a missing svg.
      const tree = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      const names = (fmt: string) => new Set((Array.isArray(tree[fmt]) ? (tree[fmt] as unknown[]) : []).filter((x): x is string => typeof x === "string").map((x) => x.replace(/\.[a-z]+$/, "")));
      const svg = names("svg"), png = names("png"), webp = names("webp");
      const meta = (b && typeof b === "object" ? b : {}) as Record<string, { aliases?: unknown }>;
      const all = [...new Set([...svg, ...png, ...webp])].sort();
      return all.map((n) => {
        const ext = svg.has(n) ? "" : png.has(n) ? ".png" : ".webp";
        const m = meta[n.replace(/-(dark|light)$/, "")];
        return { value: `di:${n}${ext}`, name: n, library: lib, aliases: Array.isArray(m?.aliases) ? (m.aliases as unknown[]).filter((y): y is string => typeof y === "string") : undefined };
      });
    }
    case "mdi":
      return arr(a).filter((x) => s(x.name) && x.deprecated !== true).map((x) => ({
        value: `mdi:${x.name}`, name: x.name as string, library: lib,
        aliases: Array.isArray(x.aliases) ? (x.aliases as unknown[]).filter((y): y is string => typeof y === "string") : undefined,
      }));
  }
}

/** How well an icon matches a query (lower is better), or null. */
export function matchScore(icon: LibraryIcon, q: string): number | null {
  if (!q) return 3;
  const n = icon.name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  const words = [icon.title ?? "", ...(icon.aliases ?? [])].map(iconSlug);
  if (words.some((w) => w === q)) return 1;
  if (words.some((w) => w.includes(q))) return 3;
  return null;
}

/** D-54: what a title suggests in one library: the same name, or a name the title starts with (Jellyfin Media → jellyfin). */
export function suggestScore(icon: LibraryIcon, slug: string): number | null {
  const n = icon.name.toLowerCase();
  if (!slug) return null;
  if (n === slug || (icon.title && iconSlug(icon.title) === slug)) return 0;
  if (slug.length >= 3 && n.startsWith(`${slug}-`)) return 1;
  if (n.length >= 3 && slug.startsWith(`${n}-`)) return 2;
  return null;
}

export class Icons {
  private readonly src: IconSources;
  private readonly f: typeof fetch;
  private readonly now: () => Date;
  private readonly ua: string;
  private readonly indexes = new Map<LibraryId, { icons: LibraryIcon[]; fetchedAt: string; error?: string }>();
  private readonly loading = new Map<LibraryId, Promise<void>>();
  private readonly offers = new Map<string, Offer>();
  private readonly cfg: IconsConfig;

  constructor(cfg: IconsConfig) {
    this.cfg = cfg;
    this.src = { ...ICON_SOURCES, ...cfg.sources };
    this.f = cfg.fetch ?? fetch;
    this.now = cfg.now ?? (() => new Date());
    this.ua = cfg.userAgent ?? "Glance-Editor/1 (self-hosted dashboard editor)";
  }

  get cdn(): string {
    return this.src.cdn;
  }

  // ---- fetching -----------------------------------------------------------------------------------------------------

  private async get(url: string, limit = MAX_BYTES): Promise<{ data: Buffer; type: string; url: string }> {
    const res = await this.f(url, { headers: { "user-agent": this.ua, accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > limit) throw new Error(`the file is larger than ${Math.round(limit / 1024 / 1024)} MB`);
    const chunks: Buffer[] = [];
    let total = 0;
    if (res.body) {
      for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += c.length;
        if (total > limit) throw new Error(`the file is larger than ${Math.round(limit / 1024 / 1024)} MB`);
        chunks.push(Buffer.from(c));
      }
    }
    return { data: Buffer.concat(chunks), type: (res.headers.get("content-type") ?? "").toLowerCase(), url: res.url || url };
  }

  private async getJson(url: string): Promise<unknown> {
    const r = await this.get(url, 16 * 1024 * 1024);
    return JSON.parse(r.data.toString("utf8"));
  }

  private offer(o: Omit<Offer, "at">): string {
    const now = Date.now();
    for (const [k, v] of this.offers) if (now - v.at > OFFER_TTL_MS || this.offers.size > 2000) this.offers.delete(k);
    const id = randomUUID();
    this.offers.set(id, { ...o, at: now });
    return id;
  }

  // ---- the four libraries -------------------------------------------------------------------------------------------

  private cacheFile(lib: LibraryId) {
    return join(this.cfg.cacheDir, "icon-indexes", `${lib}.json`);
  }

  private async load(lib: LibraryId): Promise<void> {
    const cached = this.indexes.get(lib);
    if (cached && !cached.error && this.now().getTime() - Date.parse(cached.fetchedAt) < WEEK_MS) return;
    const running = this.loading.get(lib);
    if (running) return running;
    const p = (async () => {
      let disk: { icons: LibraryIcon[]; fetchedAt: string } | null = null;
      try {
        disk = JSON.parse(await readFile(this.cacheFile(lib), "utf8"));
      } catch { /* no cache yet */ }
      if (disk && this.now().getTime() - Date.parse(disk.fetchedAt) < WEEK_MS) {
        this.indexes.set(lib, disk);
        return;
      }
      try {
        const files = await Promise.all(INDEX_URLS[lib].map((p) => this.getJson(`${this.src.cdn}${p}`)));
        const icons = normalizeIndex(lib, files);
        if (!icons.length) throw new Error("the list was empty");
        const entry = { icons, fetchedAt: this.now().toISOString() };
        this.indexes.set(lib, entry);
        await mkdir(join(this.cfg.cacheDir, "icon-indexes"), { recursive: true });
        const f = this.cacheFile(lib);
        await writeFile(`${f}.tmp`, JSON.stringify(entry));
        await rename(`${f}.tmp`, f);
      } catch (e) {
        const error = (e as Error).message;
        // A stale list is better than none: keep it, and say so.
        this.indexes.set(lib, disk ? { ...disk, error } : { icons: [], fetchedAt: "", error });
      }
    })().finally(() => this.loading.delete(lib));
    this.loading.set(lib, p);
    return p;
  }

  async libraries(libs: readonly LibraryId[] = LIBRARIES.map((l) => l.id)): Promise<Record<string, LibraryStatus>> {
    await Promise.all(libs.map((l) => this.load(l)));
    const out: Record<string, LibraryStatus> = {};
    for (const l of libs) {
      const x = this.indexes.get(l)!;
      out[l] = { ok: x.icons.length > 0, count: x.icons.length, fetchedAt: x.fetchedAt || null, ...(x.error ? { error: x.error } : {}) };
    }
    return out;
  }

  private hit(i: LibraryIcon): IconHit {
    return { ...i, preview: iconUrl(i.value, this.src.cdn)! };
  }

  /** Library search (D-21): by name, then title and aliases. */
  async search(query: string, lib: LibraryId | "all", limit = 60): Promise<{ results: IconHit[]; total: number; libraries: Record<string, LibraryStatus> }> {
    const libs = lib === "all" ? LIBRARIES.map((l) => l.id) : [lib];
    const libraries = await this.libraries(libs);
    const q = iconSlug(query);
    const scored: { i: LibraryIcon; sc: number }[] = [];
    for (const l of libs) {
      for (const i of this.indexes.get(l)!.icons) {
        const sc = matchScore(i, q);
        if (sc !== null) scored.push({ i, sc });
      }
    }
    const order = new Map(libs.map((l, n) => [l, n]));
    scored.sort((a, b) => a.sc - b.sc || a.i.name.length - b.i.name.length || a.i.name.localeCompare(b.i.name) || order.get(a.i.library)! - order.get(b.i.library)!);
    return { results: scored.slice(0, limit).map((x) => this.hit(x.i)), total: scored.length, libraries };
  }

  /** D-54: matches for the item's title in every library. */
  async suggest(title: string, perLibrary = 4): Promise<{ results: IconHit[]; libraries: Record<string, LibraryStatus> }> {
    const libraries = await this.libraries();
    const slug = iconSlug(title);
    const results: IconHit[] = [];
    for (const l of LIBRARIES) {
      const m = this.indexes.get(l.id)!.icons
        .map((i) => ({ i, sc: suggestScore(i, slug) }))
        .filter((x): x is { i: LibraryIcon; sc: number } => x.sc !== null)
        .sort((a, b) => a.sc - b.sc || a.i.name.length - b.i.name.length || a.i.name.localeCompare(b.i.name))
        .slice(0, perLibrary);
      results.push(...m.map((x) => this.hit(x.i)));
    }
    return { results, libraries };
  }

  // ---- web (D-55, D-56) ---------------------------------------------------------------------------------------------

  async web(query: string): Promise<WebSearch> {
    const q = query.trim();
    const out: WebSearch = { icons: [], images: [], imagesFrom: null, errors: [] };
    if (!q) return out;
    const [icons, images] = await Promise.allSettled([this.iconify(q), this.openverse(q)]);
    if (icons.status === "fulfilled") out.icons = icons.value;
    else out.errors.push(`Iconify: ${(icons.reason as Error).message}`);
    if (images.status === "fulfilled" && images.value.length) {
      out.images = images.value;
      out.imagesFrom = "openverse";
    } else {
      if (images.status === "rejected") out.errors.push(`Openverse: ${(images.reason as Error).message}`);
      try {
        out.images = await this.wikimedia(q);
        out.imagesFrom = "wikimedia";
      } catch (e) {
        out.errors.push(`Wikimedia Commons: ${(e as Error).message}`);
      }
    }
    return out;
  }

  private async iconify(q: string): Promise<WebResult[]> {
    // Iconify matches every word against icon names, so "jellyfin logo" finds nothing (tested 2026-10-14): drop the
    // words that describe what is wanted rather than name it.
    const words = q.split(/\s+/).filter((w) => !/^(logo|logos|icon|icons|svg|png)$/i.test(w));
    const r = (await this.getJson(`${this.src.iconify}/search?query=${encodeURIComponent(words.length ? words.join(" ") : q)}&limit=48`)) as J;
    const cols = (r.collections ?? {}) as Record<string, J>;
    return (Array.isArray(r.icons) ? (r.icons as unknown[]) : []).filter((x): x is string => typeof x === "string" && x.includes(":")).map((full) => {
      const [prefix, name] = full.split(":") as [string, string];
      const c = cols[prefix] ?? {};
      const lic = (c.license ?? {}) as J;
      const author = (c.author ?? {}) as J;
      const url = `${this.src.iconify}/${prefix}/${name}.svg`;
      const credit = { source: "Iconify", collection: s(c.name), license: s(lic.title), licenseUrl: s(lic.url), creator: s(author.name), landing: s(author.url) };
      const id = this.offer({ title: name, name, url, credit });
      return { id, kind: "icon" as const, title: full, provider: `${s(c.name) ?? prefix} · Iconify`, license: s(lic.title) ?? "unknown licence", licenseUrl: s(lic.url), creator: s(author.name), preview: url };
    });
  }

  private async openverse(q: string): Promise<WebResult[]> {
    const r = (await this.getJson(`${this.src.openverse}/v1/images/?q=${encodeURIComponent(q)}&page_size=20&mature=false`)) as J;
    return arr(r.results).filter((x) => s(x.url)).map((x) => {
      const code = s(x.license) ?? "";
      const license = code === "cc0" ? "CC0 1.0" : code === "pdm" ? "Public domain" : `CC ${code.toUpperCase()} ${s(x.license_version) ?? ""}`.trim();
      const title = s(x.title) ?? "Untitled";
      const credit = { source: `Openverse (${s(x.source) ?? s(x.provider) ?? "unknown"})`, license, licenseUrl: s(x.license_url), creator: s(x.creator), landing: s(x.foreign_landing_url), attribution: s(x.attribution) };
      const id = this.offer({ title, name: iconSlug(title) || "image", url: x.url as string, credit });
      return {
        id, kind: "image" as const, title, provider: `${s(x.source) ?? s(x.provider) ?? "Openverse"} · Openverse`, license, licenseUrl: s(x.license_url), creator: s(x.creator),
        landing: s(x.foreign_landing_url), preview: s(x.thumbnail) ?? (x.url as string),
        width: typeof x.width === "number" ? x.width : undefined, height: typeof x.height === "number" ? x.height : undefined,
      };
    });
  }

  private async wikimedia(q: string): Promise<WebResult[]> {
    const p = new URLSearchParams({
      action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrsearch: q, gsrlimit: "20", prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata", iiurlwidth: "128", iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist",
    });
    const r = (await this.getJson(`${this.src.wikimedia}/w/api.php?${p}`)) as J;
    const pages = Object.values(((r.query as J | undefined)?.pages ?? {}) as Record<string, J>);
    const out: WebResult[] = [];
    for (const pg of pages) {
      const ii = arr(pg.imageinfo)[0];
      if (!ii || !s(ii.url) || !/^image\//.test(s(ii.mime) ?? "")) continue;
      const meta = (ii.extmetadata ?? {}) as Record<string, { value?: string }>;
      const title = (s(pg.title) ?? "File").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
      const license = strip(meta.LicenseShortName?.value) ?? "see the file page";
      const credit = { source: "Wikimedia Commons", license, licenseUrl: strip(meta.LicenseUrl?.value), creator: strip(meta.Artist?.value), landing: s(ii.descriptionurl) };
      const id = this.offer({ title, name: iconSlug(title) || "image", url: ii.url as string, credit });
      out.push({
        id, kind: "image", title, provider: "Wikimedia Commons", license, licenseUrl: credit.licenseUrl, creator: credit.creator, landing: credit.landing,
        preview: s(ii.thumburl) ?? (ii.url as string), width: typeof ii.width === "number" ? ii.width : undefined, height: typeof ii.height === "number" ? ii.height : undefined,
      });
    }
    return out;
  }

  // ---- the site's own icon (D-54) -----------------------------------------------------------------------------------

  /** Find the icon the link's site declares (or its /favicon.ico), fetch it, and offer it. Nothing is written yet. */
  async site(pageUrl: string): Promise<SiteIcon> {
    let u: URL;
    try {
      u = new URL(pageUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      return { status: "none", domain: "", message: "The link isn't an http(s) address." };
    }
    const domain = u.hostname;
    const candidates: string[] = [];
    try {
      const page = await this.get(u.href, PAGE_BYTES);
      if (page.type.includes("html")) candidates.push(...iconLinks(page.data.toString("utf8"), page.url));
    } catch { /* fall back to /favicon.ico */ }
    candidates.push(new URL("/favicon.ico", u).href);
    for (const c of [...new Set(candidates)]) {
      try {
        const r = await this.get(c);
        const ext = sniff(r.data, r.type);
        if (!ext || (ext === "svg" && unsafeSvg(r.data))) continue;
        const id = this.offer({ title: domain, name: iconSlug(domain), url: c, credit: { source: `the site's own icon (${u.origin})`, landing: u.origin }, bytes: { data: r.data, ext } });
        return { status: "found", id, domain, preview: `/api/icons/offer/${id}` };
      } catch { /* next candidate */ }
    }
    return { status: "none", domain, message: `${domain} didn't give an icon the editor could use.` };
  }

  /** The bytes of an offered site icon, for its preview. */
  offerBytes(id: string): { data: Buffer; type: string } | null {
    const o = this.offers.get(id);
    return o?.bytes ? { data: o.bytes.data, type: MIME[o.bytes.ext] ?? "application/octet-stream" } : null;
  }

  // ---- download into assets (D-55) ----------------------------------------------------------------------------------

  async assetsStatus(): Promise<{ ok: true } | { ok: false; reason: "not-configured" | "not-writable"; message: string }> {
    const dir = this.cfg.assetsDir;
    if (!dir) return { ok: false, reason: "not-configured", message: "The editor has no access to Glance's assets folder (ASSETS_DIR isn't set)." };
    try {
      await access(dir, constants.W_OK);
      return { ok: true };
    } catch {
      return { ok: false, reason: "not-writable", message: "The editor can't write to Glance's assets folder." };
    }
  }

  async download(id: string): Promise<DownloadResult> {
    const st = await this.assetsStatus();
    if (!st.ok) return { ok: false, message: st.message };
    const o = this.offers.get(id);
    if (!o) return { ok: false, message: "That result has expired. Search again." };
    let data: Buffer, ext: string | null;
    try {
      if (o.bytes) ({ data, ext } = o.bytes);
      else {
        const r = await this.get(o.url);
        data = r.data;
        ext = sniff(r.data, r.type);
      }
    } catch (e) {
      return { ok: false, message: `Couldn't download it: ${(e as Error).message}` };
    }
    if (!ext) return { ok: false, message: "That file isn't an image the editor can use (PNG, JPEG, GIF, WebP, SVG or ICO)." };
    if (ext === "svg" && unsafeSvg(data)) return { ok: false, message: "That SVG contains scripts or links, so the editor won't store it." };
    const dir = join(this.cfg.assetsDir!, "icons");
    await mkdir(dir, { recursive: true });
    const base = (o.name || "icon").slice(0, 48).replace(/-+$/, "") || "icon";
    const hash = createHash("sha256").update(data).digest("hex");
    let file = `${base}.${ext}`;
    for (let n = 2; ; n++) {
      try {
        const existing = await readFile(join(dir, file));
        if (createHash("sha256").update(existing).digest("hex") === hash) break; // the same image: reuse it
        file = `${base}-${n}.${ext}`;
      } catch {
        await writeFile(join(dir, `.${file}.tmp`), data);
        await rename(join(dir, `.${file}.tmp`), join(dir, file));
        break;
      }
    }
    const credit = { file: `/assets/icons/${file}`, title: o.title, ...o.credit, downloadedFrom: o.url, downloadedAt: this.now().toISOString(), sha256: hash };
    await writeFile(join(dir, `${file}.license.json`), `${JSON.stringify(credit, null, 2)}\n`);
    return { ok: true, value: `/assets/icons/${file}`, file };
  }
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon" };

/** The image type from the bytes (the header is only a hint), or null. */
export function sniff(b: Buffer, type = ""): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "ico";
  const head = b.subarray(0, 2048).toString("utf8").replace(/^﻿/, "").trimStart();
  if ((type.includes("svg") || /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) && /<svg[\s>]/i.test(head)) return "svg";
  return null;
}

/** An SVG served from Glance's origin could run script if opened directly: refuse anything that could. */
export function unsafeSvg(b: Buffer): boolean {
  const t = b.toString("utf8");
  return /<script|<foreignObject|javascript:|\son[a-z]+\s*=|<iframe|<embed|<object/i.test(t) || /(xlink:)?href\s*=\s*["']\s*(?!#|data:image\/)[^"']/i.test(t);
}

/** Icon links a page declares, best first: apple-touch-icon, then SVG, then the largest. Exported for tests. */
export function iconLinks(html: string, base: string): string[] {
  const out: { href: string; rank: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (n: string) => tag.match(new RegExp(`\\s${n}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((x) => x !== undefined);
    const rel = (attr("rel") ?? "").toLowerCase().split(/\s+/);
    const href = attr("href");
    if (!href || !rel.some((r) => r === "icon" || r === "apple-touch-icon" || r === "apple-touch-icon-precomposed")) continue;
    let abs: string;
    try {
      abs = new URL(href.replace(/&amp;/g, "&"), base).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(abs)) continue;
    const size = Math.max(0, ...((attr("sizes") ?? "").match(/\d+/g) ?? []).map(Number));
    const svg = /\.svg(\?|$)/i.test(abs) || (attr("type") ?? "").includes("svg");
    const rank = rel.some((r) => r.startsWith("apple-touch-icon")) ? 10000 + size : svg ? 5000 : size;
    out.push({ href: abs, rank });
  }
  return out.sort((a, b) => b.rank - a.rank).map((x) => x.href);
}
