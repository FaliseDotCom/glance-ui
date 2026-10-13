// Glance defaults that the docs state differently from the source, settled against the real server (Phase 4).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { WIDGETS, checkDashboard, pageSlug } from "@glance-editor/model";
import { validateConfig } from "../src/index.ts";
import { startGlance, type RunningGlance } from "./server.ts";

let glance: RunningGlance;

beforeAll(async () => {
  glance = await startGlance((port) => stringify({
    server: { host: "127.0.0.1", port },
    pages: [{ name: "P", slug: "p", columns: [{ size: "full", widgets: [
      { type: "iframe", source: "https://example.com/unset", "css-class": "h-unset" },
      { type: "iframe", source: "https://example.com/fifty", height: 50 },
    ] }] }],
  }), {});
});

afterAll(() => glance?.stop());

describe("iframe height (docs v0.8.6: default 300)", () => {
  it("unset renders 50 px, and an explicit 50 renders 300 px, as widget-iframe.go:30-34 says", async () => {
    const html = await fetch(`${glance.url}/api/pages/p/content/`).then((r) => r.text());
    const height = (src: string) => new RegExp(`<iframe[^>]*src="${src}"[^>]*height="(\\d+)px"|<iframe[^>]*height="(\\d+)px"[^>]*src="${src}"`).exec(html);
    const unset = height("https://example.com/unset");
    const fifty = height("https://example.com/fifty");
    expect(unset, html).not.toBeNull();
    expect(unset![1] ?? unset![2]).toBe("50");
    expect(fifty![1] ?? fifty![2]).toBe("300");
    expect(WIDGETS.iframe!.fields.find((f) => f.key === "height")!.default).toBe(50);
  });
});

describe("reserved page slugs (glance.go newApplication)", () => {
  const config = (name: string, slug?: string) => (port: number) => stringify({
    server: { host: "127.0.0.1", port },
    pages: [{ name: "Home", columns: [{ size: "full", widgets: [] }] }, { name, ...(slug ? { slug } : {}), columns: [{ size: "full", widgets: [] }] }],
  });
  it("config:validate accepts a page named Login, but Glance refuses to start with it; our rules catch it", async () => {
    expect((await validateConfig(config("Login")(8080))).ok).toBe(true);
    await expect(startGlance(config("Login"), {})).rejects.toThrow(/page slug "login" is reserved/);
    await expect(startGlance(config("Exit", "logout"), {})).rejects.toThrow(/reserved/);
    const d = { schemaVersion: 2 as const, pages: [{ _id: "a", name: "Home", columns: [] }, { _id: "b", name: "  Log\tIN ", columns: [] }] };
    expect(pageSlug(d.pages[1]!)).toBe("log-in");
    expect(checkDashboard({ ...d, pages: [d.pages[0]!, { ...d.pages[1]!, name: " LOGIN " }] }).map((i) => i.code)).toContain("page.reserved-slug");
  });
  it("Glance's slug for a name matches ours (multiple spaces, tabs, edges)", async () => {
    const names = ["My  Page", " Tabs\tand  spaces ", "Ünïcode Name"];
    const g = await startGlance((port) => stringify({
      server: { host: "127.0.0.1", port },
      pages: names.map((name) => ({ name, columns: [{ size: "full", widgets: [] }] })),
    }), {});
    try {
      for (const name of names) {
        const res = await fetch(`${g.url}/${encodeURI(pageSlug({ name }))}`);
        expect(res.status, name).toBe(200);
      }
      expect((await fetch(`${g.url}/not-a-page`)).status).toBe(404);
    } finally {
      await g.stop();
    }
  });
});
