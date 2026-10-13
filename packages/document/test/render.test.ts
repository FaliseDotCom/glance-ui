// Plan v2 Phase 2: spliced output, rendered by the real Glance server (go-yaml + Glance's own substitution).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WidgetT } from "@glance-editor/model";
import { importText, writeDraft } from "../src/index.ts";
import { startGlance, type RunningGlance } from "../../glance/test/server.ts";
import { read } from "./helpers.ts";

const CASES: [string, string][] = [
  ["LIVE=${GE_A}|", "LIVE=value-a|"],
  ["ESC=\\${GE_A}|", "ESC=${GE_A}|"],
  ["CHAIN=${GE_A}${GE_A}${GE_A}\\${GE_A}|", "CHAIN=value-a${GE_A}value-a${GE_A}|"],
  ["ADJ=\\${GE_A}${GE_A}|", "ADJ=${GE_A}${GE_A}|"],
  ["NL=\n${GE_A}\n\n|", "NL=\nvalue-a\n\n|"],
  ["MARKER=---a ${GE_A}|", "MARKER=---a value-a|"],
];

let glance: RunningGlance;
let spliced: string;

beforeAll(async () => {
  glance = await startGlance(
    (port) => {
      const base = read("test/fixtures/import/commented.yml");
      const d = structuredClone(importText(base).dashboard!);
      d.server = { host: "127.0.0.1", port };
      // New widgets in the second page (slug "second"); an existing html widget edited in place on the first page.
      d.pages[1]!.slug = "second";
      d.pages[1]!.columns[0]!.widgets.push(...CASES.map(([source], i) => ({ _id: `r${i}`, type: "html", source }) as WidgetT));
      (d.pages[0]!.columns[1]!.widgets[1] as { source?: string }).source = CASES[2]![0];
      const w = writeDraft(base, d);
      if (w.mode !== "spliced") throw new Error(`expected a splice, got ${w.mode}: ${w.warnings.join(" | ")}`);
      spliced = w.text;
      return w.text;
    },
    { GE_A: "value-a", DASHBOARD_NAME: "D", ROUTER_HOST: "r.invalid", GREETING: "hi", RSS_LIMIT: "3" },
  );
});

afterAll(() => glance?.stop());

describe("spliced output as rendered by the real Glance server", () => {
  it("keeps the file's comments", () => {
    expect(spliced).toContain("# weather below");
    expect(spliced).toContain("tittle: typo key # unknown key, Glance ignores it");
  });
  it.each(CASES)("new widget %j", async (_source, expected) => {
    const html = await fetch(`${glance.url}/api/pages/second/content/`).then((r) => r.text());
    expect(html).toContain(expected);
  });
  it("an existing widget edited in place", async () => {
    const html = await fetch(`${glance.url}/api/pages/home/content/`).then((r) => r.text());
    expect(html).toContain(CASES[2]![1]);
  });
});
