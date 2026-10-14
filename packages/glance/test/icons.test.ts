// The icon finder's previews (packages/editing iconUrl) are the URLs the real Glance v0.8.6 loads for each icon value
// (config-fields.go newCustomIconField), checked against the rendered page.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { iconUrl } from "@glance-editor/editing";
import { startGlance, type RunningGlance } from "./server.ts";

const VALUES = [
  "si:jellyfin", "sh:jellyfin", "sh:home-assistant.png", "di:jellyfin", "di:home-assistant.png", "di:x.webp", "di:x.gif",
  "mdi:docker", "auto-invert di:x", "/assets/icons/x.png", "https://example.com/i.png", "other:thing",
];

let glance: RunningGlance;
beforeAll(async () => {
  glance = await startGlance((port) => [
    "server:", "  host: 127.0.0.1", `  port: ${port}`, "pages:", "  - name: P", "    slug: p", "    columns:", "      - size: full", "        widgets:",
    "          - type: bookmarks", "            groups:", "              - links:",
    ...VALUES.flatMap((v, i) => [`                  - title: L${i}`, `                    url: https://example.com/${i}`, `                    icon: "${v}"`]),
  ].join("\n") + "\n", {});
});
afterAll(async () => { await glance?.stop(); });

describe("icon URLs", () => {
  it("match what Glance renders for every kind of value", async () => {
    const html = await (await fetch(`${glance.url}/api/pages/p/content/`)).text();
    const srcs = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));
    expect(srcs).toEqual(VALUES.map((v) => iconUrl(v)));
  });
});
