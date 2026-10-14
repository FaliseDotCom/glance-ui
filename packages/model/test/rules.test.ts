import { describe, expect, it } from "vitest";
import { checkDashboard, hasErrors, parseDashboard, type Issue } from "../src/index.ts";
import { clock, col, dash, page, uid } from "./helpers.ts";

const codes = (issues: Issue[]) => issues.filter((i) => i.severity === "error").map((i) => i.code);

// One test per rule in ADR-0009 / test/fixtures/invalid. Each fixture there has a model-level twin here;
// packages/glance/test confirms Glance rejects the generated YAML of the same models.
describe("layout rules (ADR-0009)", () => {
  it("accepts small-full-small", () => expect(codes(checkDashboard(dash([page([col("small"), col("full"), col("small")])])))).toEqual([]));
  it("accepts two full columns", () => expect(codes(checkDashboard(dash([page([col("full"), col("full")])])))).toEqual([]));
  it("four-columns.yml: rejects more than 3 columns", () =>
    expect(codes(checkDashboard(dash([page([col("small"), col("full"), col("small"), col("small")])])))).toContain("page.too-many-columns"));
  it("no-full-column.yml: rejects 0 full columns", () =>
    expect(codes(checkDashboard(dash([page([col("small"), col("small")])])))).toContain("page.full-columns"));
  it("three-full-columns.yml: rejects 3 full columns", () =>
    expect(codes(checkDashboard(dash([page([col("full"), col("full"), col("full")])])))).toContain("page.full-columns"));
  it("slim-three-columns.yml: rejects 3 columns on a slim page", () =>
    expect(codes(checkDashboard(dash([page([col("small"), col("full"), col("small")], { width: "slim" })])))).toContain("page.slim-too-many-columns"));
  it("rejects a page without columns", () => expect(codes(checkDashboard(dash([page([])])))).toContain("page.no-columns"));
  it("rejects a dashboard without pages", () => expect(codes(checkDashboard(dash([])))).toContain("dashboard.no-pages"));
});

describe("nesting rules (ADR-0009)", () => {
  const grouped = (child: object) => dash([page([col("full", [{ _id: uid(), type: "group", widgets: [child as never] }])])]);
  it("group-in-group.yml", () => expect(codes(checkDashboard(grouped({ _id: uid(), type: "group", widgets: [] })))).toContain("widget.invalid-nesting"));
  it("split-column-in-group.yml", () =>
    expect(codes(checkDashboard(grouped({ _id: uid(), type: "split-column", widgets: [] })))).toContain("widget.invalid-nesting"));
  it("allows split-column inside split-column (Glance v0.8.6 has no such rule)", () => {
    const d = dash([page([col("full", [{ _id: uid(), type: "split-column", widgets: [{ _id: uid(), type: "split-column", widgets: [] }] }])])]);
    expect(codes(checkDashboard(d))).toEqual([]);
  });
});

describe("other rules", () => {
  it("rejects widget types Glance doesn't have", () =>
    expect(codes(checkDashboard(dash([page([col("full", [{ _id: uid(), type: "nope", _raw: {} }])])])))).toContain("widget.unknown-type"));
  it("rejects duplicate ids", () => {
    const w = clock();
    expect(codes(checkDashboard(dash([page([col("full", [w, w])])])))).toContain("model.duplicate-id");
  });
  it("ADR-0004: rejects a plain-text auth secret and password", () => {
    const d = dash([page([col("full")])], {
      auth: { "secret-key": "plaintext", users: [{ _id: uid(), username: "admin", password: "hunter22" }] },
    });
    expect(codes(checkDashboard(d)).filter((c) => c === "auth.plaintext-secret")).toHaveLength(2);
  });
  it("ADR-0004: accepts placeholders and password hashes", () => {
    const d = dash([page([col("full")])], {
      auth: { "secret-key": "${secret:glance_key}", users: [{ _id: uid(), username: "admin", "password-hash": "$2a$10$abc" }] },
    });
    expect(codes(checkDashboard(d))).toEqual([]);
  });
  it("warns about unknown keys and placeholders Glance won't substitute", () => {
    const d = dash([page([col("full", [{ _id: uid(), type: "html", source: "${lower} x${A}${B}", extra: { typo: 1 } }])])]);
    const warnings = checkDashboard(d).filter((i) => i.severity === "warning").map((i) => i.code);
    expect(warnings).toEqual(expect.arrayContaining(["key.unknown", "placeholder.not-substituted", "placeholder.adjacent"]));
  });
});

describe("schema", () => {
  it("rejects unknown keys outside `extra`", () => {
    const r = parseDashboard({ schemaVersion: 2, pages: [{ _id: "p", name: "P", columns: [], typo: true }] });
    expect(r.dashboard).toBeUndefined();
  });
  it("accepts a whole placeholder in a number field and rejects other strings", () => {
    const rss = (limit: unknown) => ({ schemaVersion: 2, pages: [{ _id: "p", name: "P", columns: [{ _id: "c", size: "full", widgets: [{ _id: "w", type: "rss", feeds: [], limit }] }] }] });
    expect(parseDashboard(rss("${RSS_LIMIT}")).dashboard).toBeDefined();
    expect(parseDashboard(rss("ten")).dashboard).toBeUndefined();
  });
  it("validates HSL colours like Glance (H ≤ 360, S/L ≤ 100)", () => {
    const theme = (c: string) => parseDashboard({ schemaVersion: 2, pages: [], theme: { "primary-color": c } });
    expect(theme("240 8 9").dashboard).toBeDefined();
    expect(theme("hsl(240, 8%, 9%)").dashboard).toBeDefined();
    expect(theme("361 8 9").dashboard).toBeUndefined();
  });
});

describe("fields Glance's docs call required (ADR-0018: warn, don't block)", () => {
  const withWidget = (w: Record<string, unknown>) =>
    parseDashboard({ schemaVersion: 2, pages: [{ _id: "p", name: "P", columns: [{ _id: "c", size: "full", widgets: [{ _id: "w", ...w }] }] }] });
  it("warns about an RSS widget without feeds, and doesn't block", () => {
    const r = withWidget({ type: "rss" });
    expect(r.issues.filter((i) => i.code === "field.recommended").map((i) => [i.severity, i.path.join(".")]))
      .toEqual([["warning", "pages.0.columns.0.widgets.0.feeds"]]);
    expect(hasErrors(r.issues)).toBe(false);
  });
  it("checks items too, and accepts markets given as the legacy stocks list", () => {
    const r = withWidget({ type: "monitor", sites: [{ _id: "s", title: "Router" }] });
    expect(r.issues.filter((i) => i.code === "field.recommended").map((i) => i.path.join("."))).toEqual(["pages.0.columns.0.widgets.0.sites.0.url"]);
    const m = withWidget({ type: "markets", stocks: [{ _id: "s", symbol: "X" }] });
    expect(m.issues.filter((i) => i.code === "field.recommended")).toEqual([]);
  });
});
