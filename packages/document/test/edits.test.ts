// Targeted edits on a commented file (design D-38, ADR-0015): exactly the intended lines change.
import { describe, expect, it } from "vitest";
import type { DashboardT, WidgetT } from "@glance-editor/model";
import { importText, writeDraft } from "../src/index.ts";
import { clone, read } from "./helpers.ts";

const BASE = read("test/fixtures/import/commented.yml");
const MODEL = importText(BASE).dashboard!;

/** Lines removed from / added to the base (multiset diff, order-insensitive). */
function diff(before: string, after: string) {
  const count = (t: string) => t.split("\n").reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>());
  const a = count(before), b = count(after);
  const removed: string[] = [], added: string[] = [];
  for (const [l, n] of a) for (let i = 0; i < n - (b.get(l) ?? 0); i++) removed.push(l);
  for (const [l, n] of b) for (let i = 0; i < n - (a.get(l) ?? 0); i++) added.push(l);
  return { removed, added };
}

function edit(fn: (d: DashboardT) => void) {
  const d = clone(MODEL);
  fn(d);
  const w = writeDraft(BASE, d);
  return { ...w, ...diff(BASE, w.text) };
}

const col = (d: DashboardT, p: number, c: number) => d.pages[p]!.columns[c]!.widgets;

describe("splice edits", () => {
  it("renames a page, keeping its inline comment", () => {
    const r = edit((d) => { d.pages[0]!.name = "Start"; });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual(["  - name: Home # shown first"]);
    expect(r.added).toEqual(["  - name: Start # shown first"]);
    expect(r.warnings).toEqual([]);
  });

  it("deletes a widget together with the comment above it", () => {
    const r = edit((d) => { col(d, 0, 0).splice(0, 1); });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual(["          # the clock", "          - type: clock", "            hour-format: 24h"]);
    expect(r.added).toEqual([]);
  });

  it("moves a widget with its comments to another column, re-indented", () => {
    const r = edit((d) => {
      const [weather] = col(d, 0, 1).splice(2, 1);
      d.pages[1]!.columns[0]!.widgets.push(weather!);
    });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual([]);
    expect(r.added).toEqual([]);
    const lines = r.text.split("\n");
    const at = lines.indexOf("          # weather below");
    expect(lines.slice(at - 1, at + 4)).toEqual([
      "          - type: clock # only widget",
      "          # weather below",
      "          - type: weather",
      "            location: London, United Kingdom",
      '            units: metric # alternatively "imperial"',
    ]);
  });

  it("adds a widget at the end of a column using the Phase 1 encoding", () => {
    const r = edit((d) => { col(d, 1, 0).push({ _id: "new-1", type: "html", source: "x: \\${ESC} ${LIVE}" } as WidgetT); });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual([]);
    expect(r.added).toEqual(["          - type: html", '            source: "x: \\u0024{ESC} ${LIVE}"']);
  });

  it("adds a key to a widget and removes another", () => {
    const r = edit((d) => {
      const clock = col(d, 0, 0)[0] as { "hour-format"?: string; title?: string };
      delete clock["hour-format"];
      clock.title = "Time";
    });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual(["            hour-format: 24h"]);
    expect(r.added).toEqual(["            title: Time"]);
  });

  it("adds a bookmark link and changes a theme colour, leaving every comment in place", () => {
    const r = edit((d) => {
      const bm = col(d, 0, 1)[0] as unknown as { groups: { links: object[] }[] };
      bm.groups[0]!.links.push({ _id: "l-new", title: "Docs", url: "https://example.com" });
      d.theme!["background-color"] = "200 10 10";
    });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual(["  background-color: 240 13 14 # dark background"]);
    expect(r.added).toEqual(["  background-color: 200 10 10 # dark background", "                  - title: Docs", "                    url: https://example.com"]);
  });

  it("reorders pages, carrying each page's comments", () => {
    const r = edit((d) => { d.pages.reverse(); });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual([]);
    expect(r.added).toEqual([]);
    expect(r.text.indexOf("  - name: Second")).toBeLessThan(r.text.indexOf("  # The main page"));
  });

  it("edits a value inside a widget that uses a merge key by rewriting only that item, with a warning", () => {
    const r = edit((d) => { (col(d, 0, 0)[1] as { "first-day-of-week"?: string })["first-day-of-week"] = "sunday"; });
    expect(r.mode).toBe("spliced");
    expect(r.added).toContain("            first-day-of-week: sunday");
    expect(r.text).toContain("# the clock");
    expect(r.text).toContain("# weather below");
  });

  it("changes a flow-style list by rewriting only that key, with a warning", () => {
    const r = edit((d) => { (col(d, 0, 1)[3] as unknown as { feeds: { url: string }[] }).feeds[0]!.url = "https://example.org/rss"; });
    expect(r.mode).toBe("spliced");
    expect(r.warnings.join(" ")).toMatch(/feeds/);
    expect(r.text).toContain("https://example.org/rss");
    expect(r.text).toContain("tittle: typo key # unknown key, Glance ignores it");
  });

  it.each(["---a", "...", "- x", "? y", "#z", "a: b", " lead"])("renames a page to %j on one line", (name) => {
    const r = edit((d) => { d.pages[1]!.name = name; });
    expect(r.mode).toBe("spliced");
    expect(r.removed).toEqual(["  - name: Second"]);
    expect(r.added).toHaveLength(1);
    expect(importText(r.text).dashboard!.pages[1]!.name).toBe(name);
  });

  it("returns the base unchanged when nothing changed", () => {
    expect(writeDraft(BASE, clone(MODEL))).toEqual({ text: BASE, mode: "unchanged", warnings: [] });
  });
});
