import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseDashboard, type ColumnT, type DashboardT, type PageT } from "@glance-editor/model";
import { generate } from "@glance-editor/generator";
import { substituteForValidation, validateConfig } from "../src/index.ts";

// These tests run the real pinned glance binary ($GLANCE_BIN, set by vitest.setup.ts).
const OPTS = { glanceVersion: "v0.8.6" };
const validate = async (d: DashboardT) => {
  const { yaml, placeholderHints } = generate(d, OPTS);
  return validateConfig(yaml, { hints: placeholderHints });
};

let n = 0;
const col = (size: "small" | "full", widgets: ColumnT["widgets"] = [{ _id: `w${++n}`, type: "clock" }]): ColumnT => ({ _id: `c${++n}`, size, widgets });
const dash = (columns: ColumnT[], page: Partial<PageT> = {}): DashboardT => ({
  schemaVersion: 1,
  pages: [{ _id: `p${++n}`, name: "P", columns, ...page }],
});

describe("Glance accepts generated config", () => {
  it("sample model (all modelled widgets, raw widgets, typed and untyped placeholders, escapes)", async () => {
    const { dashboard } = parseDashboard(JSON.parse(await readFile("test/fixtures/model/v1/sample.json", "utf8")));
    const r = await validate(dashboard!);
    expect(r.output).toBe("");
    expect(r.ok).toBe(true);
  });

  it("server.assets-path, when overridden to an existing temp dir", async () => {
    const d: DashboardT = { ...dash([col("full")]), server: { "assets-path": "/app/assets" } };
    const unchanged = await validateConfig(generate(d, OPTS).yaml);
    expect(unchanged.ok).toBe(false); // Glance checks the directory exists
    expect(unchanged.output).toContain("assets directory does not exist");
  });
});

// Model rules vs Glance: each model the rules reject, Glance rejects too (and for the same reason).
describe("Glance rejects what the model rules reject", () => {
  const cases: [string, DashboardT, string][] = [
    ["4 columns", dash([col("small"), col("full"), col("small"), col("small")]), "more than 3 columns"],
    ["0 full columns", dash([col("small"), col("small")]), "1 or 2 full width columns"],
    ["3 full columns", dash([col("full"), col("full"), col("full")]), "1 or 2 full width columns"],
    ["slim with 3 columns", dash([col("small"), col("full"), col("small")], { width: "slim" }), "slim and cannot have more than 2 columns"],
    ["group in group", dash([col("full", [{ _id: "g1", type: "group", widgets: [{ _id: "g2", type: "group", widgets: [] }] }])]), "nested groups"],
    ["split-column in group", dash([col("full", [{ _id: "g3", type: "group", widgets: [{ _id: "s1", type: "split-column", widgets: [] }] }])]), "split columns inside of groups"],
    ["unknown widget type", dash([col("full", [{ _id: "x1", type: "nope", _raw: {} }])]), "unknown widget type"],
    ["no pages", { schemaVersion: 1, pages: [] }, "no pages configured"],
  ];
  it.each(cases)("%s", async (_name, d, message) => {
    const r = await validate(d);
    expect(r.ok).toBe(false);
    expect(r.output).toContain(message);
  });
});

describe("typed placeholder dummies", () => {
  const rss = (limit: string): DashboardT => dash([col("full", [{ _id: "r", type: "rss", feeds: [], limit }])]);
  it("a number placeholder validates with a numeric dummy", async () => {
    expect((await validate(rss("${RSS_LIMIT}"))).ok).toBe(true);
  });
  it("…and would fail with a string dummy (why hints exist)", async () => {
    const { yaml } = generate(rss("${RSS_LIMIT}"), OPTS);
    const r = await validateConfig(yaml); // no hints → string dummy
    expect(r.ok).toBe(false);
  });
  it("the validation copy keeps escapes and literals, and replaces substitutable placeholders", () => {
    expect(substituteForValidation("a \\${X} ${lower} ${foo:B} ${A}${B}")).toBe("a \\${X} ${lower} ${foo:B} glance-editor-placeholder${B}");
  });
});
