// ADR-0028: the community widgets bundled with this release. Every variant marked addable is checked again here, the
// way the editor adds it (the YAML tab's reader, then a draft with it checked by the pinned Glance), so the snapshot
// can't claim more than the release does.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { widgetFromYaml } from "@glance-editor/document";
import { validateConfig } from "@glance-editor/glance";
import { toGlanceJson, generate } from "@glance-editor/generator";
import { SCHEMA_VERSION, type DashboardT, type WidgetT } from "@glance-editor/model";
import { asWidgetYaml, COMMUNITY, communityList, communityWidget } from "../src/index.ts";

const pin = (file: string, key: string) => new RegExp(`^${key}=(.*)$`, "m").exec(readFileSync(file, "utf8"))?.[1];

describe("community widgets snapshot", () => {
  it("matches the pins: community-widgets.version and glance.version; CC0", () => {
    expect(COMMUNITY.commit).toBe(pin("community-widgets.version", "COMMUNITY_WIDGETS_COMMIT"));
    expect(COMMUNITY.glance).toBe(pin("glance.version", "GLANCE_VERSION"));
    expect(COMMUNITY.license).toBe("CC0-1.0");
    expect(COMMUNITY.widgets.length).toBeGreaterThan(150);
  });

  it("the list leaves the YAML out; one widget has it as the YAML tab holds a widget", () => {
    expect(communityList().widgets.every((w) => w.variants.every((v) => !("yaml" in v)))).toBe(true);
    const w = COMMUNITY.widgets.find((x) => x.variants.some((v) => v.check.ok))!;
    expect(communityWidget(w.dir)?.title).toBe(w.title);
    expect(asWidgetYaml("- type: custom-api\n  title: X\n  template: |\n    <p>{{ .JSON }}</p>\n")).toBe("type: custom-api\ntitle: X\ntemplate: |\n  <p>{{ .JSON }}</p>\n");
    expect(communityWidget("no-such-widget")).toBeNull();
  });

  it("every addable variant is read by the editor and accepted by the pinned Glance, as added", async () => {
    const ok = COMMUNITY.widgets.flatMap((w) => w.variants.filter((v) => v.check.ok).map((v) => ({ w, v })));
    expect(ok.length).toBeGreaterThan(140);
    const failures: string[] = [];
    for (const { w, v } of ok) {
      const r = widgetFromYaml(asWidgetYaml(v.yaml), "c");
      if (!r.ok) { failures.push(`${w.dir}: the editor can't read it: ${r.message}`); continue; }
      const d: DashboardT = { schemaVersion: SCHEMA_VERSION, pages: [{ _id: "p", name: "P", columns: [{ _id: "c0", size: "full", widgets: [{ ...r.widget, _yaml: { text: asWidgetYaml(v.yaml), form: "{}" } } as WidgetT] }] }] };
      const text = generate(d, { glanceVersion: COMMUNITY.glance }).yaml;
      const res = await validateConfig(text, { hints: toGlanceJson(d).placeholderHints });
      if (!res.ok) failures.push(`${w.dir}: ${res.output.trim().split("\n").pop()}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
