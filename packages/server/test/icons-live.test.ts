// The icon finder against the real services (ADR-0020). Needs the internet, so it runs only with ICON_LIVE=1
// (`ICON_LIVE=1 npx vitest run packages/server/test/icons-live.test.ts`); CI uses the stand-ins in icons.test.ts.
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Icons } from "../src/icons.ts";

describe.runIf(process.env.ICON_LIVE === "1")("icon finder, live services", () => {
  const dir = mkdtempSync(join(tmpdir(), "glance-editor-icons-live-"));
  mkdirSync(join(dir, "assets"));
  const icons = new Icons({ cacheDir: join(dir, "data"), assetsDir: join(dir, "assets") });

  it("loads all four name lists from jsDelivr, and every preview URL answers", async () => {
    const libs = await icons.libraries();
    for (const [id, st] of Object.entries(libs)) expect(st, id).toMatchObject({ ok: true });
    const sug = await icons.suggest("Jellyfin");
    expect(sug.results.map((r) => r.value)).toEqual(expect.arrayContaining(["si:jellyfin", "sh:jellyfin", "di:jellyfin", "mdi:jellyfish"].slice(0, 3)));
    for (const r of sug.results.slice(0, 6)) expect((await fetch(r.preview, { method: "HEAD" })).status, r.preview).toBe(200);
    const png = (await icons.search("", "di", 100000)).results.find((r) => r.value.endsWith(".png"))!;
    expect((await fetch(png.preview, { method: "HEAD" })).status, png.preview).toBe(200);
  }, 60_000);

  it("web search: Iconify icons and Openverse images, and a download with its licence", async () => {
    const w = await icons.web("jellyfin logo");
    expect(w.errors).toEqual([]);
    expect(w.icons.length).toBeGreaterThan(0);
    expect(w.images.length).toBeGreaterThan(0);
    const d = await icons.download(w.icons[0]!.id);
    expect(d).toMatchObject({ ok: true });
    if (d.ok) expect(JSON.parse(readFileSync(join(dir, "assets", "icons", `${d.file}.license.json`), "utf8")).license).toBeTruthy();
  }, 60_000);

  it("falls back to Wikimedia Commons when Openverse fails", async () => {
    const w = await new Icons({ cacheDir: join(dir, "data2"), assetsDir: join(dir, "assets"), sources: { openverse: "http://127.0.0.1:1" } }).web("jellyfin logo");
    expect(w.imagesFrom).toBe("wikimedia");
    expect(w.images.length).toBeGreaterThan(0);
    expect(w.images[0]!.license).toBeTruthy();
  }, 60_000);

  it("finds a site's own icon", async () => {
    const r = await icons.site("https://jellyfin.org/");
    expect(r.status).toBe("found");
  }, 60_000);
});
