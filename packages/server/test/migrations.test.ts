import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, parseDashboard } from "@glance-editor/model";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { importText } from "@glance-editor/document";
import { generate } from "@glance-editor/generator";
import { migrateModel } from "../src/index.ts";

describe("model migrations (ADR-0003)", () => {
  const chain = { 0: (j: Record<string, unknown>) => ({ ...j, schemaVersion: 1, pages: j.pages ?? [] }) };
  it("runs the chain up to the current version", () => {
    expect(migrateModel({ schemaVersion: 0 }, chain, 1)).toEqual({ schemaVersion: 1, pages: [] });
  });
  it("refuses a model newer than the code", () => {
    expect(() => migrateModel({ schemaVersion: 2 }, chain, 1)).toThrow(/newer than this editor/);
  });
  it("fails clearly on a gap in the chain", () => {
    expect(() => migrateModel({ schemaVersion: 0 }, {}, 1)).toThrow(/No migration from data model version 0/);
  });
  it("is a no-op at the current version", () => {
    const j = { schemaVersion: SCHEMA_VERSION, pages: [] };
    expect(migrateModel(j)).toBe(j);
  });
});

describe("v1 → v2: raw widgets of modelled types become modelled (ADR-0017)", () => {
  const base = "pages:\n  - name: Home\n    columns:\n      - size: full\n        widgets:\n" +
    "          - type: weather\n            location: Berlin\n            units: ${UNITS}\n            unknown-key: 1\n" +
    "          - type: rss\n            feeds:\n              - url: https://example.com/a.xml\n" +
    "          - type: group\n            widgets:\n              - type: videos\n                channels: [a, b]\n";

  it("converts exactly as a fresh import would, ids included", () => {
    const fresh = importText(base).dashboard!;
    // The same widgets as schema v1 stored them: raw, with their keys under _raw.
    const asV1 = (w: Record<string, unknown>): Record<string, unknown> => {
      const { _id, type, extra, ...rest } = w;
      return { _id, type, _raw: { ...rest, ...(extra as object | undefined) } };
    };
    const ws = fresh.pages[0]!.columns[0]!.widgets as Record<string, unknown>[];
    const v1 = {
      schemaVersion: 1,
      pages: [{ ...fresh.pages[0], columns: [{ ...fresh.pages[0]!.columns[0], widgets: [
        asV1(ws[0]!), ws[1], { ...ws[2], widgets: [asV1((ws[2]!.widgets as Record<string, unknown>[])[0]!)] },
      ] }] }],
    };
    // rss was already modelled in v1; weather and the grouped videos were raw.
    expect((v1.pages[0]!.columns[0]!.widgets[0] as { _raw: object })._raw).toBeDefined();
    const migrated = migrateModel(v1);
    expect(migrated).toEqual(JSON.parse(JSON.stringify(fresh)));
    expect(parseDashboard(migrated).dashboard).toBeDefined();
  });

  it("keeps raw widgets of types Glance doesn't have", () => {
    const w = { _id: "w", type: "not-a-glance-type", _raw: { a: 1 } };
    const m = migrateModel({ schemaVersion: 1, pages: [{ _id: "p", name: "P", columns: [{ _id: "c", size: "full", widgets: [w] }] }] });
    expect((m.pages as { columns: { widgets: unknown[] }[] }[])[0]!.columns[0]!.widgets[0]).toEqual(w);
  });
});

describe("the kept v1 fixture (ADR-0003)", () => {
  it("migrates to a valid current model that Glance sees exactly as before", async () => {
    const v1 = JSON.parse(await readFile("test/fixtures/model/v1/sample.json", "utf8"));
    const migrated = migrateModel(structuredClone(v1));
    const parsed = parseDashboard(migrated);
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(parsed.issues.filter((i) => i.code.startsWith("key."))).toEqual([]);
    // The generator still writes raw widgets as they are, so it can render the unmigrated v1 model for comparison.
    const before = parse(generate(v1, { glanceVersion: "v0.8.6" }).yaml);
    const after = parse(generate(parsed.dashboard!, { glanceVersion: "v0.8.6" }).yaml);
    expect(after).toEqual(before);
  });
});
