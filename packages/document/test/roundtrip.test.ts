// Handoff §8: import, save with no edits → the file is unchanged (apart from D-36: includes merged).
import { describe, expect, it } from "vitest";
import { importFile, importText, writeDraft } from "../src/index.ts";
import { FIXTURES, read, upstreamExample } from "./helpers.ts";

describe("no-edit round trip is byte-identical", () => {
  it.each([...FIXTURES, "<upstream example>"])("%s", async (f) => {
    const file = f === "<upstream example>" ? upstreamExample() : f;
    const r = await importFile(file);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.base).toBe(read(file)); // no includes: config:print gives the file back exactly
    const w = writeDraft(r.base, r.dashboard!);
    expect(w.mode).toBe("unchanged");
    expect(w.text).toBe(read(file));
  });

  it("merges $include and !include (D-36), nested paths relative to the including file", async () => {
    const r = await importFile("test/fixtures/import/includes/glance.yml");
    expect(r.report.includes.map((p) => p.replace(/^.*fixtures\//, ""))).toEqual([
      "import/includes/home.yml", "import/includes/pages/other.yml", "import/includes/widget.yml",
    ]);
    expect(r.dashboard!.pages.map((p) => p.name)).toEqual(["Home", "Other"]);
    expect(r.base).toContain("# included comment");
    expect(r.base).not.toContain("include:");
    expect(writeDraft(r.base, r.dashboard!).text).toBe(r.base);
  });
});

describe("import report and model", () => {
  const r = importText(read("test/fixtures/import/commented.yml"));
  it("keeps unknown widget types as raw, unknown keys and unrepresentable values in extra (D-14)", () => {
    expect(r.report.rawWidgetTypes).toEqual(["weather"]);
    expect(r.report.unknownKeys).toEqual(expect.arrayContaining(["x-defaults", "pages.0.columns.1.widgets.3.tittle"]));
    expect(r.report.keptAsIs.map((k) => k.path)).toEqual(["pages.0.columns.1.widgets.3.hide-header"]);
    const rss = r.dashboard!.pages[0]!.columns[1]!.widgets[3] as { extra?: Record<string, unknown>; limit?: unknown };
    expect(rss.extra).toEqual({ "hide-header": "yes", tittle: "typo key" });
    expect(rss.limit).toBe("${RSS_LIMIT}");
  });
  it("keeps placeholders and escapes literally (D-37), including an escape inside double quotes", () => {
    const html = r.dashboard!.pages[0]!.columns[1]!.widgets[1] as { title?: string; source?: string };
    expect(html.title).toBe("Escaped: \\${NOT_A_VAR}");
    expect(html.source).toBe("<p>Notes</p>\n<p>${GREETING}</p>\n");
  });
  it("resolves merge keys (<<) like Glance's YAML library", () => {
    const cal = r.dashboard!.pages[0]!.columns[0]!.widgets[1] as { "css-class"?: string; type: string };
    expect(cal.type).toBe("calendar");
    expect(cal["css-class"]).toBe("card");
  });
  it("counts comments, anchors and aliases", () => {
    expect(r.report).toMatchObject({ comments: 17, anchors: 1, aliases: 1 });
  });
  it("assigns stable path ids", () => {
    expect(r.dashboard!.pages[0]!.columns[1]!.widgets[0]!._id).toBe("pages.0.columns.1.widgets.0");
  });
});

describe("placeholders are never resolved (D-37)", () => {
  it("import reads no environment variables", async () => {
    const real = process.env;
    const touched: string[] = [];
    process.env = new Proxy(real, { get: (t, k) => { if (typeof k === "string" && /^[A-Z_]+$/.test(k) && k !== "GLANCE_BIN") touched.push(k); return Reflect.get(t, k); } });
    try {
      const r = await importFile("test/fixtures/import/commented.yml");
      expect(r.dashboard).toBeDefined();
    } finally {
      process.env = real;
    }
    for (const name of ["DASHBOARD_NAME", "ROUTER_HOST", "NOT_A_VAR", "GREETING", "RSS_LIMIT"]) expect(touched).not.toContain(name);
  });
});
