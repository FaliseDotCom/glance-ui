// Pixabay (design D-61, D-62; decided 2026-10-13: largeImageURL ≤ 1280 px; a local pool, downloaded only when you
// press "Get new images"; the schedule only swaps between local files). ADR-0022.
// API (docs read 2026-10-14, pixabay.com/api/docs): GET https://pixabay.com/api/?key=…; one `category` per request from
// a fixed list; 100 requests per 60 s per key; results must be cached for 24 h; no permanent hotlinking (download
// first); show where results come from. An invalid key answers 400 "[ERROR 400] Invalid or missing API key" (tested
// 2026-10-14); the rate limit answers 429 (docs).
// The key is kept in the editor's settings and used only here: it never reaches the browser or glance.yml.
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sniff } from "./icons.ts";
import { storeImage } from "./background.ts";

/** D-61's chips → Pixabay's `category` where one exists, otherwise a search word with `category=backgrounds`. */
export const PIXABAY_CHIPS: Record<string, { category: string; q?: string }> = {
  Nature: { category: "nature" },
  Landscape: { category: "backgrounds", q: "landscape" },
  Mountains: { category: "backgrounds", q: "mountains" },
  Sea: { category: "backgrounds", q: "sea" },
  Forest: { category: "backgrounds", q: "forest" },
  Sky: { category: "backgrounds", q: "sky" },
  City: { category: "buildings" },
  Space: { category: "backgrounds", q: "space" },
  Animals: { category: "animals" },
  Abstract: { category: "backgrounds", q: "abstract" },
};

export const PIXABAY_API = "https://pixabay.com/api/";
const DAY_MS = 24 * 60 * 60 * 1000;
const SWAP_MS = { daily: DAY_MS, weekly: 7 * DAY_MS, monthly: 30 * DAY_MS } as const;

export interface PixabayHit {
  id: string;
  preview: string;
  width: number;
  height: number;
  user: string;
  pageURL: string;
  tags: string;
}

export type PixabayError = { ok: false; reason: "no-key" | "rejected" | "limit" | "unreachable"; message: string };

export interface PixabayStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

export interface PixabayConfig {
  store: PixabayStore;
  cacheDir: string;
  assetsDir: string | undefined;
  api?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface RawHit { id: number; largeImageURL?: string; previewURL?: string; imageWidth?: number; imageHeight?: number; user?: string; pageURL?: string; tags?: string }

const MESSAGES = {
  "no-key": "Add your Pixabay API key first.",
  rejected: "Pixabay rejected this key. Check it and try again.",
  limit: "Pixabay is refusing requests for now. Try again later.",
} as const;

export class Pixabay {
  private readonly cfg: PixabayConfig;
  private readonly f: typeof fetch;
  private readonly now: () => Date;
  private readonly offers = new Map<string, RawHit>();

  constructor(cfg: PixabayConfig) {
    this.cfg = cfg;
    this.f = cfg.fetch ?? fetch;
    this.now = cfg.now ?? (() => new Date());
  }

  private get key() {
    return this.cfg.store.get("pixabay-key");
  }

  /** What the browser may know: whether there is a key, and its last 4 characters. */
  keyStatus(): { hasKey: boolean; masked: string | null } {
    const k = this.key;
    return { hasKey: !!k, masked: k ? `••••${k.slice(-4)}` : null };
  }

  /** "Check and save key": one small request, then store it. */
  async setKey(key: string): Promise<{ ok: true; masked: string } | PixabayError> {
    const k = key.trim();
    if (!k) return { ok: false, reason: "rejected", message: MESSAGES.rejected };
    const r = await this.request({ q: "nature", per_page: "3" }, k, false);
    if (!r.ok) return r;
    this.cfg.store.set("pixabay-key", k);
    return { ok: true, masked: `••••${k.slice(-4)}` };
  }

  clearKey(): void {
    this.cfg.store.set("pixabay-key", null);
  }

  /** One API request, cached for 24 h on disk (Pixabay's terms). The cache is keyed without the key. */
  private async request(params: Record<string, string>, key = this.key, cache = true): Promise<{ ok: true; hits: RawHit[]; totalHits: number } | PixabayError> {
    if (!key) return { ok: false, reason: "no-key", message: MESSAGES["no-key"] };
    const qs = new URLSearchParams({ image_type: "photo", orientation: "horizontal", safesearch: "true", ...params });
    const id = createHash("sha256").update(qs.toString()).digest("hex").slice(0, 32);
    const file = join(this.cfg.cacheDir, "pixabay-cache", `${id}.json`);
    if (cache) {
      try {
        const c = JSON.parse(await readFile(file, "utf8")) as { at: string; body: { hits: RawHit[]; totalHits: number } };
        if (this.now().getTime() - Date.parse(c.at) < DAY_MS) return { ok: true, ...c.body };
      } catch { /* not cached */ }
    }
    let res: Response;
    try {
      res = await this.f(`${this.cfg.api ?? PIXABAY_API}?key=${encodeURIComponent(key)}&${qs}`, { signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      return { ok: false, reason: "unreachable", message: `Pixabay didn't answer: ${(e as Error).message}` };
    }
    if (res.status === 429) return { ok: false, reason: "limit", message: MESSAGES.limit };
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => "");
      return /key/i.test(text) || res.status !== 400 ? { ok: false, reason: "rejected", message: MESSAGES.rejected } : { ok: false, reason: "unreachable", message: `Pixabay refused the request: ${text.slice(0, 120)}` };
    }
    if (!res.ok) return { ok: false, reason: "unreachable", message: `Pixabay answered ${res.status}` };
    const body = (await res.json()) as { hits?: RawHit[]; totalHits?: number };
    const out = { hits: Array.isArray(body.hits) ? body.hits : [], totalHits: body.totalHits ?? 0 };
    if (cache) {
      await mkdir(join(this.cfg.cacheDir, "pixabay-cache"), { recursive: true });
      await writeFile(file, JSON.stringify({ at: this.now().toISOString(), body: out }));
    }
    return { ok: true, ...out };
  }

  /** Results for the chosen chips (one request each, interleaved), optionally narrowed by words. */
  private async collect(chips: readonly string[], words: string, perPage: number, page: number): Promise<{ ok: true; hits: RawHit[]; totalHits: number } | PixabayError> {
    const lists: RawHit[][] = [];
    let total = 0;
    for (const c of chips) {
      const m = PIXABAY_CHIPS[c];
      if (!m) continue;
      const q = [m.q, words.trim()].filter(Boolean).join(" ").slice(0, 100);
      const r = await this.request({ category: m.category, per_page: String(perPage), page: String(page), ...(q ? { q } : {}) });
      if (!r.ok) return r;
      lists.push(r.hits.filter((h) => h.largeImageURL));
      total = Math.max(total, r.totalHits);
    }
    const hits: RawHit[] = [];
    const seen = new Set<number>();
    for (let i = 0; lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const h = l[i];
        if (h && !seen.has(h.id)) { seen.add(h.id); hits.push(h); }
      }
    }
    return { ok: true, hits, totalHits: total };
  }

  /** "Pick images myself": search results for the browser (previews may be shown; Pixabay URLs are never stored). */
  async search(chips: readonly string[], words: string): Promise<{ ok: true; hits: PixabayHit[] } | PixabayError> {
    const r = await this.collect(chips, words, 30, 1);
    if (!r.ok) return r;
    return {
      ok: true,
      hits: r.hits.slice(0, 60).map((h) => {
        const id = randomUUID();
        this.offers.set(id, h);
        return { id, preview: h.previewURL ?? "", width: h.imageWidth ?? 0, height: h.imageHeight ?? 0, user: h.user ?? "", pageURL: h.pageURL ?? "", tags: h.tags ?? "" };
      }),
    };
  }

  private async download(h: RawHit): Promise<Buffer> {
    const res = await this.f(h.largeImageURL!, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Pixabay answered ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const kind = sniff(data);
    if (!kind || kind === "svg" || kind === "ico") throw new Error("Pixabay sent something that isn't a photo");
    return data;
  }

  private credit(h: RawHit) {
    return { source: "Pixabay", license: "Pixabay Content License", licenseUrl: "https://pixabay.com/service/license-summary/", creator: h.user, landing: h.pageURL, tags: h.tags, downloadedAt: this.now().toISOString() };
  }

  /** "Pick images myself" → Add: download the picks into the assets folder, credit next to each. */
  async add(ids: readonly string[]): Promise<{ ok: true; images: { file: string; name: string }[] } | { ok: false; message: string }> {
    if (!this.cfg.assetsDir) return { ok: false, message: "Couldn't store the image: the editor has no access to Glance's assets folder." };
    const out: { file: string; name: string }[] = [];
    for (const id of ids) {
      const h = this.offers.get(id);
      if (!h) return { ok: false, message: "Those results have expired. Search again." };
      try {
        const r = await storeImage(this.cfg.assetsDir, await this.download(h));
        if ("error" in r) return { ok: false, message: r.error };
        await writeFile(join(this.cfg.assetsDir, `${r.file}.license.json`), `${JSON.stringify({ file: `/assets/${r.file}`, ...this.credit(h) }, null, 2)}\n`);
        out.push({ file: r.file, name: `Pixabay · ${h.user ?? "photo"}` });
      } catch (e) {
        return { ok: false, message: `Couldn't download it: ${(e as Error).message}` };
      }
    }
    return { ok: true, images: out };
  }

  // ---- the rotating set (D-62) --------------------------------------------------------------------------------------

  setDir(set: string): string {
    return join(this.cfg.assetsDir ?? "", "glance-editor", "pixabay", set);
  }

  /**
   * "Use this set" / "Get new images": download `count` images for the chips into the set's pool, under fixed names
   * (01.jpg …), so what the dashboard links keeps working and nothing needs saving. Each press takes the next page of
   * results, so the images are new. `current.jpg` (what Image mode shows) starts at the first.
   */
  async pool(set: string, chips: readonly string[], count: number): Promise<{ ok: true; files: number } | PixabayError | { ok: false; reason: "assets"; message: string }> {
    if (!this.cfg.assetsDir) return { ok: false, reason: "assets", message: "Couldn't store the images: the editor has no access to Glance's assets folder." };
    if (!/^[a-z0-9-]{1,40}$/.test(set)) return { ok: false, reason: "unreachable", message: "Not a set name." };
    const state = this.state(set);
    let page = state.page + 1;
    let r = await this.collect(chips, "", Math.min(200, Math.max(count, 20)), page);
    if (r.ok && r.hits.length < count && page > 1) { page = 1; r = await this.collect(chips, "", Math.min(200, Math.max(count, 20)), page); } // past the end: start over
    if (!r.ok) return r;
    const hits = r.hits.slice(0, count);
    if (!hits.length) return { ok: false, reason: "unreachable", message: "Pixabay found no photos for these categories." };
    const dir = this.setDir(set);
    await mkdir(dir, { recursive: true });
    const credits: unknown[] = [];
    for (const [i, h] of hits.entries()) {
      const name = `${String(i + 1).padStart(2, "0")}.jpg`;
      try {
        const data = await this.download(h);
        await writeFile(join(dir, `.${name}.tmp`), data);
        await rename(join(dir, `.${name}.tmp`), join(dir, name));
        credits.push({ file: name, ...this.credit(h) });
      } catch (e) {
        return { ok: false, reason: "unreachable", message: `Couldn't download image ${i + 1}: ${(e as Error).message}` };
      }
    }
    for (const f of await readdir(dir)) {
      const n = /^(\d+)\.jpg$/.exec(f);
      if (n && Number(n[1]) > hits.length) await rm(join(dir, f), { force: true });
    }
    await writeFile(join(dir, "credits.json"), `${JSON.stringify(credits, null, 2)}\n`);
    await copyFile(join(dir, "01.jpg"), join(dir, ".current.tmp"));
    await rename(join(dir, ".current.tmp"), join(dir, "current.jpg"));
    this.saveState(set, { page, index: 0, at: this.now().toISOString() });
    return { ok: true, files: hits.length };
  }

  /** The pool's files (`glance-editor/pixabay/<set>/01.jpg` …), in order. */
  async poolFiles(set: string): Promise<string[]> {
    try {
      return (await readdir(this.setDir(set))).filter((f) => /^\d+\.jpg$/.test(f)).sort().map((f) => `glance-editor/pixabay/${set}/${f}`);
    } catch {
      return [];
    }
  }

  private state(set: string): { page: number; index: number; at: string | null } {
    const v = this.cfg.store.get(`pixabay-set:${set}`);
    return v ? JSON.parse(v) : { page: 0, index: 0, at: null };
  }

  private saveState(set: string, s: { page: number; index: number; at: string | null }) {
    this.cfg.store.set(`pixabay-set:${set}`, JSON.stringify(s));
  }

  /**
   * D-62's schedule: when a set's period has passed, copy the pool's next image over `current.jpg`. No download, no
   * save. Called hourly with the sets in the live glance.yml. Returns the sets it swapped.
   */
  async rotate(sets: readonly { pixabay: string; swap?: string | undefined }[]): Promise<string[]> {
    const swapped: string[] = [];
    for (const s of sets) {
      const period = SWAP_MS[s.swap as keyof typeof SWAP_MS];
      if (!period) continue;
      const st = this.state(s.pixabay);
      if (st.at && this.now().getTime() - Date.parse(st.at) < period) continue;
      const files = await this.poolFiles(s.pixabay);
      if (files.length < 2) continue;
      const index = (st.index + 1) % files.length;
      const dir = this.setDir(s.pixabay);
      await copyFile(join(this.cfg.assetsDir!, files[index]!), join(dir, ".current.tmp"));
      await rename(join(dir, ".current.tmp"), join(dir, "current.jpg"));
      this.saveState(s.pixabay, { ...st, index, at: this.now().toISOString() });
      swapped.push(s.pixabay);
    }
    return swapped;
  }
}
