import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { changeText, diffHunks, diffLines, formatWhen, plural, versionSummary } from "../src/text.ts";

describe("wording", () => {
  it("plural, change lines, version summaries", () => {
    expect(plural(1, "unsaved change")).toBe("1 unsaved change");
    expect(plural(3, "unsaved change")).toBe("3 unsaved changes");
    expect(changeText({ kind: "renamed", label: 'Page "A" → "B"' })).toBe('Renamed: Page "A" → "B"');
    expect(versionSummary({ number: 2, source: "outside", changes: [] })).toBe("glance.yml changed outside the editor");
    expect(versionSummary({ number: 3, source: "editor", changes: [{ kind: "added", label: "Widget weather" }, { kind: "moved", label: "x" }] }))
      .toBe("Added: Widget weather, and 1 more change");
  });
  it("times relative to today", () => {
    const now = new Date(2026, 9, 13, 18, 0);
    expect(formatWhen(new Date(2026, 9, 13, 9, 5).toISOString(), now, "en-GB")).toBe("Today 09:05");
    expect(formatWhen(new Date(2026, 9, 12, 22, 40).toISOString(), now, "en-GB")).toBe("Yesterday 22:40");
    expect(formatWhen(new Date(2026, 8, 1, 7, 0).toISOString(), now, "en-GB")).toBe("1 Sept 2026, 07:00");
  });
});

describe("line diff", () => {
  it("applying the diff to the old text gives the new text (property)", () => {
    const text = fc.array(fc.constantFrom("a", "b", "c", "  - type: clock", ""), { maxLength: 30 }).map((l) => l.join("\n"));
    fc.assert(fc.property(text, text, (a, b) => {
      const d = diffLines(a, b)!;
      expect(d.filter((l) => l.kind !== "add").map((l) => l.text).join("\n")).toBe(a);
      expect(d.filter((l) => l.kind !== "del").map((l) => l.text).join("\n")).toBe(b);
    }), { numRuns: 500 });
  });
  it("hunks keep context and mark gaps", () => {
    const a = ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n");
    const b = a.replace("2", "two").replace("8", "eight");
    const h = diffHunks(diffLines(a, b)!, 1);
    expect(h.map((l) => (l ? `${l.kind[0]}${l.text}` : "…"))).toEqual(["s1", "d2", "atwo", "s3", "…", "s7", "d8", "aeight"]);
  });
});
