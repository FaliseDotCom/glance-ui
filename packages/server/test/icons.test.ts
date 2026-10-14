// The icon finder's server side (D-21, D-54 to D-56; ADR-0020) against stand-ins for its sources
// (test/support/icon-sources.ts). The real services: icons-live.test.ts (ICON_LIVE=1).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { iconUrl } from "@glance-editor/editing";
import { iconLinks, Icons, normalizeIndex, sniff, unsafeSvg } from "../src/icons.ts";
import { PNG, SVG, startIconSources, type IconSourcesStandIn } from "../../../test/support/icon-sources.ts";

let src: IconSourcesStandIn;
beforeAll(async () => { src = await startIconSources(); });
afterAll(async () => { await src.close(); });

function make(opts: { assets?: boolean; now?: () => Date; sources?: object } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "glance-editor-icons-"));
  const assetsDir = join(dir, "assets");
  if (opts.assets !== false) mkdirSync(assetsDir);
  const icons = new Icons({ cacheDir: join(dir, "data"), assetsDir, sources: { ...src.sources, ...opts.sources }, ...(opts.now ? { now: opts.now } : {}) });
  return { dir, assetsDir, icons };
}

describe("name lists", () => {
  it("turn into the values Glance reads: an icon without an svg gets .png (sh, di); deprecated MDI icons are left out", async () => {
    const { icons } = make();
    const all = (await icons.search("", "all", 1000)).results.map((r) => r.value).sort();
    expect(all).toEqual([
      "di:home-assistant.png", "di:jellyfin", "di:jellyfin-vue", "mdi:docker", "mdi:home-assistant", "mdi:jellyfish",
      "sh:home-assistant.png", "sh:jellyfin", "si:github", "si:homeassistant", "si:jellyfin",
    ]);
  });

  it("previews use the URL Glance would load", async () => {
    const { icons } = make();
    const r = (await icons.search("home-assistant", "di")).results[0]!;
    expect(r.preview).toBe(iconUrl("di:home-assistant.png", src.url));
    expect(r.preview).toBe(`${src.url}/gh/homarr-labs/dashboard-icons/png/home-assistant.png`);
  });

  it("search ranks the exact name first, then prefixes, then titles and aliases", async () => {
    const { icons } = make();
    expect((await icons.search("jellyfin", "all")).results.map((r) => r.value)).toEqual(["si:jellyfin", "sh:jellyfin", "di:jellyfin", "di:jellyfin-vue"]);
    expect((await icons.search("Home Assistant", "si")).results.map((r) => r.value)).toEqual(["si:homeassistant"]); // by title
    expect((await icons.search("whale", "mdi")).results.map((r) => r.value)).toEqual(["mdi:docker"]); // by alias
    expect((await icons.search("zzz", "all")).results).toEqual([]);
  });

  it("D-54: suggestions for a title come from every library", async () => {
    const { icons } = make();
    expect((await icons.suggest("Home Assistant")).results.map((r) => r.value)).toEqual(["si:homeassistant", "sh:home-assistant.png", "di:home-assistant.png", "mdi:home-assistant"]);
    expect((await icons.suggest("Jellyfin")).results.map((r) => r.value)).toEqual(["si:jellyfin", "sh:jellyfin", "di:jellyfin", "di:jellyfin-vue"]);
    expect((await icons.suggest("")).results).toEqual([]);
  });

  it("are cached on disk for a week; a list that can't be fetched again is still used, and says why", async () => {
    let now = new Date("2026-10-14T10:00:00Z");
    const { dir, icons } = make({ now: () => now });
    await icons.libraries();
    expect(readdirSync(join(dir, "data", "icon-indexes")).sort()).toEqual(["di.json", "mdi.json", "sh.json", "si.json"]);
    // A second editor (a restart) reads the cache without asking the CDN.
    const before = src.requests.length;
    const again = new Icons({ cacheDir: join(dir, "data"), sources: src.sources, now: () => now });
    expect((await again.libraries()).si).toMatchObject({ ok: true, count: 3 });
    expect(src.requests.length).toBe(before);
    // A week later the CDN is gone: the old list stays, with the error.
    now = new Date("2026-10-22T10:00:00Z");
    const offline = new Icons({ cacheDir: join(dir, "data"), sources: { ...src.sources, cdn: "http://127.0.0.1:1" }, now: () => now });
    const st = await offline.libraries();
    expect(st.si).toMatchObject({ ok: true, count: 3, fetchedAt: "2026-10-14T10:00:00.000Z" });
    expect(st.si!.error).toMatch(/fetch failed|ECONNREFUSED/);
    // No cache and no CDN: not ok, with the reason.
    const none = new Icons({ cacheDir: join(dir, "nothing"), sources: { ...src.sources, cdn: "http://127.0.0.1:1" } });
    expect((await none.libraries()).mdi).toMatchObject({ ok: false, count: 0 });
  });

  it("normalizeIndex ignores malformed entries", () => {
    expect(normalizeIndex("si", [[{ title: "x" }, null, { slug: "ok" }]]).map((i) => i.value)).toEqual(["si:ok"]);
    expect(normalizeIndex("di", [null, null])).toEqual([]);
  });
});

describe("web search (D-56)", () => {
  it("Iconify icons and Openverse images, each with its licence; words like \"logo\" are dropped for Iconify", async () => {
    const { icons } = make();
    const w = await icons.web("jellyfin logo");
    expect(w.errors).toEqual([]);
    expect(w.icons.map((i) => [i.title, i.license])).toEqual([["logos:jellyfin", "CC0"], ["mdi:jellyfin-test", "Apache 2.0"]]);
    expect(src.requests.some((r) => r.includes("/iconify/search?query=jellyfin&"))).toBe(true);
    expect(w.imagesFrom).toBe("openverse");
    expect(w.images.map((i) => [i.title, i.license, i.creator])).toEqual([["Jellyfin banner", "CC BY-SA 4.0", "Jellyfin Team"], ["Jellyfin mark", "CC BY-SA 4.0", "Jellyfin Team"]]);
  });

  it("falls back to Wikimedia Commons when Openverse finds nothing or fails", async () => {
    const { icons } = make();
    const down = await startIconSources({ openverseDown: true });
    try {
      const d = make({ sources: { openverse: down.sources.openverse } });
      const r = await d.icons.web("jellyfin");
      expect(r.imagesFrom).toBe("wikimedia");
      expect(r.images.map((i) => [i.title, i.license, i.creator])).toEqual([["Jellyfin wiki logo", "CC BY-SA 4.0", "Wiki Artist"]]);
      expect(r.errors[0]).toMatch(/^Openverse: .*503/);
      const empty = await icons.web("nothing at all");
      expect(empty.imagesFrom).toBe("wikimedia"); // Openverse had no results
    } finally {
      await down.close();
    }
  });
});

describe("downloads into the assets folder (D-55)", () => {
  it("writes the file under icons/ with its licence and credit next to it, and returns its /assets/ path", async () => {
    const { icons, assetsDir } = make();
    const w = await icons.web("jellyfin");
    const d = await icons.download(w.images[0]!.id);
    expect(d).toEqual({ ok: true, value: "/assets/icons/jellyfin-banner.png", file: "jellyfin-banner.png" });
    expect(readFileSync(join(assetsDir, "icons", "jellyfin-banner.png")).equals(PNG)).toBe(true);
    const credit = JSON.parse(readFileSync(join(assetsDir, "icons", "jellyfin-banner.png.license.json"), "utf8"));
    expect(credit).toMatchObject({ file: "/assets/icons/jellyfin-banner.png", license: "CC BY-SA 4.0", creator: "Jellyfin Team", landing: "https://example.com/landing", source: "Openverse (wikimedia)" });
    // The same image again is reused; a different one with the same name gets a number.
    expect(await icons.download(w.images[0]!.id)).toMatchObject({ value: "/assets/icons/jellyfin-banner.png" });
    const svg = await icons.download(w.icons[0]!.id);
    expect(svg).toMatchObject({ ok: true, value: "/assets/icons/jellyfin.svg" });
    expect(readFileSync(join(assetsDir, "icons", "jellyfin.svg"), "utf8")).toBe(SVG);
  });

  it("refuses ids it didn't offer, scripts in SVGs, files over 5 MB, and works only with an assets folder", async () => {
    const { icons } = make();
    expect(await icons.download("made-up")).toEqual({ ok: false, message: "That result has expired. Search again." });
    const evil = await icons.web("evil");
    expect(await icons.download(evil.images[0]!.id)).toMatchObject({ ok: false, message: /contains scripts/ });
    const huge = await icons.web("huge");
    expect(await icons.download(huge.images[0]!.id)).toMatchObject({ ok: false, message: /larger than 5 MB/ });
    const no = make({ assets: false });
    const w = await no.icons.web("jellyfin");
    expect(await no.icons.download(w.images[0]!.id)).toMatchObject({ ok: false, message: /can't write to Glance's assets folder/ });
    expect(existsSync(no.assetsDir)).toBe(false);
    const unset = new Icons({ cacheDir: join(no.dir, "d2"), sources: src.sources });
    expect(await unset.assetsStatus()).toMatchObject({ ok: false, reason: "not-configured" });
  });
});

describe("the site's own icon (D-54)", () => {
  it("prefers the page's apple-touch-icon; falls back to /favicon.ico; saves under the domain", async () => {
    const { icons, assetsDir } = make();
    const s = await icons.site(`${src.url}/site/`);
    expect(s).toMatchObject({ status: "found", domain: "127.0.0.1" });
    expect(src.requests).toContain("GET /site/apple.png");
    if (s.status !== "found") throw new Error();
    expect(icons.offerBytes(s.id)).toMatchObject({ type: "image/png" });
    const d = await icons.download(s.id);
    expect(d).toMatchObject({ ok: true, value: "/assets/icons/127-0-0-1.png" });
    expect(JSON.parse(readFileSync(join(assetsDir, "icons", "127-0-0-1.png.license.json"), "utf8")).source).toMatch(/the site's own icon/);
    expect(await icons.site(`${src.url}/plain/`)).toMatchObject({ status: "found" }); // /favicon.ico
    expect(await icons.site("http://127.0.0.1:1/")).toMatchObject({ status: "none" });
    expect(await icons.site("ftp://x/")).toMatchObject({ status: "none" });
  });

  it("iconLinks reads link tags in any attribute order and resolves them", () => {
    const html = `<link href='/a.png' rel="icon" sizes="32x32"><link rel=icon href=/b.svg type="image/svg+xml"><link rel="stylesheet" href="/x.css"><link rel="icon" href="/c.png" sizes="96x96">`;
    expect(iconLinks(html, "https://s.example/p/")).toEqual(["https://s.example/b.svg", "https://s.example/c.png", "https://s.example/a.png"]);
  });
});

describe("file checks", () => {
  it("sniff knows images by their bytes", () => {
    expect(sniff(PNG)).toBe("png");
    expect(sniff(Buffer.from(SVG))).toBe("svg");
    expect(sniff(Buffer.from(`<?xml version="1.0"?>\n${SVG}`))).toBe("svg");
    expect(sniff(Buffer.from([0, 0, 1, 0, 1, 0]))).toBe("ico");
    expect(sniff(Buffer.from("<html>not an image</html>"), "image/png")).toBeNull();
  });
  it("unsafeSvg refuses scripts, handlers and outside links", () => {
    expect(unsafeSvg(Buffer.from(SVG))).toBe(false);
    expect(unsafeSvg(Buffer.from('<svg><use href="#a"/></svg>'))).toBe(false);
    for (const bad of ["<svg><script/></svg>", '<svg onload="x()"/>', '<svg><a href="https://e.example">x</a></svg>', '<svg><image xlink:href="http://e/x.png"/></svg>']) {
      expect(unsafeSvg(Buffer.from(bad)), bad).toBe(true);
    }
  });
});
