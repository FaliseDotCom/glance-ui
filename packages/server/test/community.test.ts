// ADR-0028, ADR-0030: the community widgets bundled with this release. Every variant marked addable is checked again
// here, the way the editor adds it (the YAML tab's reader, then a draft with it checked by the pinned Glance), so the
// snapshot can't claim more than the release does; and every value it needs has a field whose example or default Glance
// accepts, given to it as a real value, as the user's will be.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { widgetFromYaml } from "@glance-editor/document";
import { fieldHints, validateConfig } from "@glance-editor/glance";
import { toGlanceJson, generate } from "@glance-editor/generator";
import { SCHEMA_VERSION, type DashboardT, type WidgetT } from "@glance-editor/model";
import { sample, specProblems } from "../../../scripts/community-readme.ts";
import { asWidgetYaml, COMMUNITY, communityList, communityWidget, communityWidgetView, valueSpec } from "../src/index.ts";

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
      const res = await validateConfig(text, { hints: fieldHints(text, valueSpec, toGlanceJson(d).placeholderHints) });
      if (!res.ok) failures.push(`${w.dir}: ${res.output.trim().split("\n").pop()}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("every value of an addable variant has a field, and Glance accepts the variant with the fields' examples and defaults", async () => {
    const failures: string[] = [];
    for (const w of COMMUNITY.widgets) for (const [i, v] of w.variants.entries()) {
      if (!v.check.ok) continue;
      const bad = v.variables.flatMap((n) => specProblems(n, COMMUNITY.values[n]));
      if (bad.length) { failures.push(...bad.map((b) => `${w.dir} #${i}: ${b}`)); continue; }
      const env = Object.fromEntries(v.variables.map((n) => [n, sample(COMMUNITY.values[n]!)]));
      const r = widgetFromYaml(asWidgetYaml(v.yaml), "c");
      if (!r.ok) continue; // reported by the test above
      const d: DashboardT = { schemaVersion: SCHEMA_VERSION, pages: [{ _id: "p", name: "P", columns: [{ _id: "c0", size: "full", widgets: [{ ...r.widget, _yaml: { text: asWidgetYaml(v.yaml), form: "{}" } } as WidgetT] }] }] };
      const text = generate(d, { glanceVersion: COMMUNITY.glance }).yaml;
      const res = await validateConfig(text, { hints: fieldHints(text, valueSpec, toGlanceJson(d).placeholderHints), env });
      if (!res.ok) failures.push(`${w.dir} #${i} with its examples: ${res.output.trim().split("\n").pop()}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("a field per value in the view; a second copy's name has its first copy's field", () => {
    const w = COMMUNITY.widgets.find((x) => x.variants.some((v) => v.check.ok && v.variables.length))!;
    const view = communityWidgetView(w.dir)!;
    const v = view.variants.find((x) => x.check.ok && x.variables.length)!;
    expect(Object.keys(v.fields)).toEqual(v.variables);
    const name = v.variables[0]!;
    expect(valueSpec(`${name}_2`)).toEqual({ ...valueSpec(name), label: `${valueSpec(name)!.label} (copy 2)` });
    expect(valueSpec("NO_SUCH_NAME")).toBeNull();
  });
});
