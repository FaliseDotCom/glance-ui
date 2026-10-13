// Plan v2 Phase 2 acceptance: random edit sequences on real files keep comments, read back as the draft, and pass
// Glance's own validator (ADR-0015).
import { appendFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkDashboard, type DashboardT, type WidgetT } from "@glance-editor/model";
import { toGlanceJson } from "@glance-editor/generator";
import { validateConfig } from "@glance-editor/glance";
import { deepEqual, importFile, importText, viewOf, writeDraft } from "../src/index.ts";
import { columnWidgets, upstreamExample } from "./helpers.ts";

const text = fc
  .array(fc.oneof(
    fc.constantFrom("${A_VAR}", "${secret:s}", "\\${ESC}", "${lower}", "#", ": ", "'", '"', "\\", "\n", " ", "-", "{", "}", "$", "&", "*"),
    fc.string({ unit: fc.constantFrom("a", "b", "Z", "1", " "), minLength: 1, maxLength: 5 }),
  ), { minLength: 1, maxLength: 5 })
  .map((p) => p.join(""))
  .filter((s) => s.trim() !== "");

const op = fc.record({ kind: fc.integer({ min: 0, max: 10 }), a: fc.nat(), b: fc.nat(), c: fc.nat(), s: text });
type Op = { kind: number; a: number; b: number; c: number; s: string };

let n = 0;
/** Apply one op; returns true if it deleted something (comments may then legitimately disappear). */
function apply(d: DashboardT, o: Op): boolean {
  const cols = columnWidgets(d);
  const pick = <T>(xs: T[], i: number) => xs[i % xs.length];
  switch (o.kind) {
    case 0: pick(d.pages, o.a)!.name = o.s; return false;
    case 1: {
      const w = pick(cols.flatMap((c) => c.list), o.a) as (WidgetT & { _raw?: Record<string, unknown>; title?: string }) | undefined;
      if (!w) return false;
      if (w._raw) w._raw.title = o.s; else w.title = o.s;
      return false;
    }
    case 2: {
      const c = pick(cols.filter((x) => x.list.length), o.a);
      if (!c) return false;
      c.list.splice(o.b % c.list.length, 1);
      return true;
    }
    case 3: {
      const c = pick(cols, o.a)!;
      const w = (o.b % 2 ? { _id: `new-${++n}`, type: "html", source: o.s } : { _id: `new-${++n}`, type: "clock", "hour-format": "24h" }) as WidgetT;
      c.list.splice(o.c % (c.list.length + 1), 0, w);
      return false;
    }
    case 4: {
      const from = pick(cols.filter((x) => x.list.length), o.a);
      if (!from) return false;
      const [w] = from.list.splice(o.b % from.list.length, 1);
      const to = pick(cols, o.c)!;
      to.list.splice(o.b % (to.list.length + 1), 0, w!);
      return false;
    }
    case 5: {
      const bm = cols.flatMap((c) => c.list).find((w) => w.type === "bookmarks") as { groups: { _id: string; links: object[] }[] } | undefined;
      if (!bm || !bm.groups.length) return false;
      pick(bm.groups, o.a)!.links.splice(o.b % (pick(bm.groups, o.a)!.links.length + 1), 0, { _id: `new-${++n}`, title: o.s, url: "https://example.com/" + (o.c % 100) });
      return false;
    }
    case 6: {
      const w = pick(cols.flatMap((c) => c.list).filter((x) => x.type === "clock"), o.a) as { "hour-format"?: string } | undefined;
      if (!w) return false;
      if (w["hour-format"]) { delete w["hour-format"]; return true; }
      w["hour-format"] = "12h";
      return false;
    }
    case 7: {
      const i = o.a % d.pages.length, j = o.b % d.pages.length;
      [d.pages[i], d.pages[j]] = [d.pages[j]!, d.pages[i]!];
      return false;
    }
    case 8: d.theme = { ...(d.theme ?? {}), "primary-color": `${o.a % 360} ${o.b % 100} ${o.c % 100}` }; return false;
    case 9:
      d.pages.splice(o.a % (d.pages.length + 1), 0, { _id: `new-${++n}`, name: o.s, columns: [{ _id: `new-${++n}`, size: "full", widgets: [{ _id: `new-${++n}`, type: "clock" }] }] });
      return false;
    case 10:
      if (d.pages.length < 2) return false;
      d.pages.splice(o.a % d.pages.length, 1);
      return true;
  }
  return false;
}

const comments = (t: string) => t.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("#")).sort();

const BASES = [
  "test/fixtures/import/commented.yml",
  "test/fixtures/valid/sample.yml",
  "test/fixtures/valid/placeholders.yml",
  "test/fixtures/import/includes/glance.yml",
  "<upstream example>",
];

describe("random edit sequences (property)", () => {
  it.each(BASES)("%s", async (f) => {
    const { base, dashboard } = await importFile(f === "<upstream example>" ? upstreamExample() : f);
    let validated = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 6 }), fc.boolean(), async (ops, doValidate) => {
        const d = structuredClone(dashboard!);
        let deleted = false;
        for (const o of ops) deleted = apply(d, o) || deleted;
        // The save pipeline refuses drafts with errors (handoff §4 step 1); only saveable drafts are written.
        if (checkDashboard(d).some((i) => i.severity === "error" && i.code.startsWith("placeholder."))) return;
        const w = writeDraft(base, d);
        if (w.mode === "regenerated") {
          if (process.env.GLANCE_EDITOR_PROPERTY_DUMP) appendFileSync(process.env.GLANCE_EDITOR_PROPERTY_DUMP, JSON.stringify({ f, ops }) + "\n");
          throw new Error(`fell back to a rewrite: ${w.warnings.join(" | ")}`);
        }
        const back = importText(w.text).dashboard!;
        expect(deepEqual(viewOf(toGlanceJson(back).json), viewOf(toGlanceJson(d).json))).toBe(true);
        if (!deleted && w.warnings.length === 0) expect(comments(w.text)).toEqual(expect.arrayContaining(comments(base)));
        if (doValidate && validated < 25) {
          validated++;
          const v = await validateConfig(w.text, { hints: toGlanceJson(d).placeholderHints });
          if (!v.ok) throw new Error(`Glance rejected the result: ${v.output}\n${w.text}`);
        }
      }),
      { numRuns: 300 },
    );
  });
});
