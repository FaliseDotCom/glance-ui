import { describe, expect, it } from "vitest";
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
    const j = { schemaVersion: 1, pages: [] };
    expect(migrateModel(j)).toBe(j);
  });
});
