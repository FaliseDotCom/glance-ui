// Stand-ins for the icon finder's online sources (ADR-0020), so tests don't need the internet: jsDelivr's paths for
// the four name lists and their icons, Iconify, Openverse, Wikimedia Commons, and a few "sites" with icons. The shapes
// copy the real responses (read 2026-10-14); the data is made up. `packages/server/test/icons-live.test.ts` checks the
// real services.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// A 1×1 PNG.
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#7ed6bc"/></svg>';
const EVIL_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

const INDEXES: Record<string, unknown> = {
  "/npm/simple-icons@latest/data/simple-icons.json": [
    { title: "Jellyfin", slug: "jellyfin", hex: "00A4DC", source: "https://example.com" },
    { title: "Home Assistant", slug: "homeassistant", hex: "18BCF2", source: "https://example.com", aliases: { aka: ["HA"] } },
    { title: "GitHub", slug: "github", hex: "181717", source: "https://example.com" },
  ],
  "/gh/selfhst/icons@main/index.json": [
    { Name: "Jellyfin", Reference: "jellyfin", SVG: "Yes", PNG: "Yes", WebP: "Yes", Light: "No", Dark: "No", Category: "Self-Hosted", Tags: "", CreatedAt: "" },
    { Name: "Home Assistant", Reference: "home-assistant", SVG: "No", PNG: "Yes", WebP: "Yes", Light: "No", Dark: "No", Category: "Self-Hosted", Tags: "smart home", CreatedAt: "" },
  ],
  "/gh/homarr-labs/dashboard-icons/tree.json": {
    png: ["jellyfin.png", "jellyfin-vue.png", "home-assistant.png"],
    svg: ["jellyfin.svg", "jellyfin-vue.svg"],
    webp: ["jellyfin.webp", "jellyfin-vue.webp", "home-assistant.webp"],
  },
  "/gh/homarr-labs/dashboard-icons/metadata.json": { "home-assistant": { base: "png", aliases: ["hass"] } },
  "/npm/@mdi/svg@latest/meta.json": [
    { name: "docker", aliases: ["whale"], tags: [], deprecated: false },
    { name: "jellyfish", aliases: [], tags: [], deprecated: false },
    { name: "home-assistant", aliases: [], tags: [], deprecated: false },
    { name: "old-thing", aliases: [], tags: [], deprecated: true },
  ],
};

export interface IconSourcesStandIn {
  url: string;
  sources: { cdn: string; iconify: string; openverse: string; wikimedia: string };
  requests: string[];
  close(): Promise<void>;
}

export async function startIconSources(opts: { openverseDown?: boolean } = {}): Promise<IconSourcesStandIn> {
  const requests: string[] = [];
  let base = "";
  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const u = new URL(req.url ?? "/", "http://x");
    const p = u.pathname;
    const json = (v: unknown, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(v));
    const img = (ext: "png" | "svg", body?: string | Buffer) =>
      res.writeHead(200, { "content-type": ext === "png" ? "image/png" : "image/svg+xml" }).end(body ?? (ext === "png" ? PNG : SVG));
    if (p in INDEXES) return json(INDEXES[p]);
    if (/^\/(npm|gh)\/.*\.(svg)$/.test(p)) return img("svg");
    if (/^\/(npm|gh)\/.*\.(png|webp)$/.test(p)) return img("png");

    if (p === "/iconify/search") {
      const q = (u.searchParams.get("query") ?? "").toLowerCase();
      if (!q.includes("jellyfin")) return json({ icons: [], total: 0, collections: {} });
      return json({
        icons: ["logos:jellyfin", "mdi:jellyfin-test"], total: 2,
        collections: {
          logos: { name: "SVG Logos", license: { title: "CC0", spdx: "CC0-1.0", url: "https://example.com/cc0" }, author: { name: "Logo Author", url: "https://example.com/a" } },
          mdi: { name: "Material Design Icons", license: { title: "Apache 2.0", url: "https://example.com/apache" }, author: { name: "Pictogrammers" } },
        },
      });
    }
    if (p.startsWith("/iconify/")) return img("svg");

    if (p === "/openverse/v1/images/") {
      const q = (u.searchParams.get("q") ?? "").toLowerCase();
      if (opts.openverseDown) return json({ detail: "down" }, 503);
      if (!q.includes("jellyfin") && !q.includes("evil") && !q.includes("huge")) return json({ result_count: 0, results: [] });
      const r = (id: string, title: string, file: string) => ({
        id, title, url: `${base}/img/${file}`, thumbnail: `${base}/img/${file}`, license: "by-sa", license_version: "4.0",
        license_url: "https://creativecommons.org/licenses/by-sa/4.0/", creator: "Jellyfin Team", foreign_landing_url: "https://example.com/landing",
        attribution: `"${title}" by Jellyfin Team is licensed under CC BY-SA 4.0.`, source: "wikimedia", provider: "wikimedia", width: 512, height: 512, filetype: "png",
      });
      if (q.includes("evil")) return json({ result_count: 1, results: [r("e1", "Evil", "evil.svg")] });
      if (q.includes("huge")) return json({ result_count: 1, results: [r("h1", "Huge", "huge.png")] });
      return json({ result_count: 2, results: [r("o1", "Jellyfin banner", "banner.png"), r("o2", "Jellyfin mark", "mark.svg")] });
    }
    if (p === "/wikimedia/w/api.php") {
      return json({ query: { pages: { "1": { title: "File:Jellyfin wiki logo.png", imageinfo: [{
        url: `${base}/img/wiki.png`, thumburl: `${base}/img/wiki.png`, descriptionurl: "https://example.com/file", mime: "image/png", width: 300, height: 300,
        extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" }, Artist: { value: '<a href="x">Wiki Artist</a>' } },
      }] } } } });
    }
    if (p === "/img/evil.svg") return img("svg", EVIL_SVG);
    if (p === "/img/huge.png") return res.writeHead(200, { "content-type": "image/png" }).end(Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]));
    if (p === "/img/mark.svg") return img("svg");
    if (p.startsWith("/img/")) return img("png");

    // Sites: one declares its icons, one has only /favicon.ico, one has nothing.
    if (p === "/site/") {
      return res.writeHead(200, { "content-type": "text/html" }).end(
        '<html><head><link rel="icon" href="/site/favicon-16.png" sizes="16x16"><link rel="apple-touch-icon" href="apple.png" sizes="180x180"></head></html>');
    }
    if (p === "/site/apple.png" || p === "/site/favicon-16.png" || p === "/favicon.ico") return img("png");
    if (p === "/plain/") return res.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: base,
    sources: { cdn: base, iconify: `${base}/iconify`, openverse: `${base}/openverse`, wikimedia: `${base}/wikimedia` },
    requests,
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}
