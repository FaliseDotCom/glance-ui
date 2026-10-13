// Glance defaults that the docs state differently from the source, settled against the real server (Phase 4).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { WIDGETS } from "@glance-editor/model";
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
