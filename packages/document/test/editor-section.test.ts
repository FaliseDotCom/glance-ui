// The editor's own `glance-editor:` section (ADR-0021): read on import, written in place, accepted by Glance.
import { describe, expect, it } from "vitest";
import { validateConfig } from "@glance-editor/glance";
import type { DashboardT } from "@glance-editor/model";
import { importText, writeDraft } from "../src/index.ts";
import { clone, read } from "./helpers.ts";

const BASE = read("test/fixtures/import/commented.yml");

const WITH = `${BASE}glance-editor: # written by Glance Editor
  background:
    mode: slideshow
    images:
      - file: glance-editor/backgrounds/aaa.jpg
        name: beach.jpg
      - folder: /photos/2024
    interval: 5m
    dim: 30
`;

describe("glance-editor section", () => {
  it("is read into the model, with an id per image", () => {
    const r = importText(WITH);
    expect(r.issues).toEqual(importText(BASE).issues); // nothing new to report
    expect(r.report?.unknownKeys ?? []).not.toContain("glance-editor");
    const bg = r.dashboard!["glance-editor"]!.background!;
    expect(bg).toMatchObject({ mode: "slideshow", interval: "5m", dim: 30 });
    expect(bg.images!.map((i) => [typeof i._id, i.file ?? i.folder])).toEqual([["string", "glance-editor/backgrounds/aaa.jpg"], ["string", "/photos/2024"]]);
  });

  it("is added to a file in place (nothing else changes), edited, and removed", () => {
    const d = clone(importText(BASE).dashboard!) as DashboardT;
    d["glance-editor"] = { background: { mode: "image", images: [{ _id: "i1", file: "glance-editor/backgrounds/b.png", name: "b.png" }] } };
    const added = writeDraft(BASE, d);
    expect(added.mode).toBe("spliced");
    expect(added.text.startsWith(BASE.trimEnd())).toBe(true);
    expect(added.text).toContain("glance-editor:\n  background:\n    mode: image\n");

    const m = clone(importText(WITH).dashboard!) as DashboardT;
    m["glance-editor"]!.background!.dim = 50;
    const edited = writeDraft(WITH, m);
    expect(edited.mode).toBe("spliced");
    expect(edited.text).toBe(WITH.replace("dim: 30", "dim: 50"));

    delete m["glance-editor"];
    const removed = writeDraft(WITH, m);
    expect(removed.text).toBe(BASE);
  });

  it("is accepted by Glance's validator (Glance ignores the key)", async () => {
    const text = `pages:\n  - name: P\n    columns:\n      - size: full\n        widgets: []\n${WITH.slice(WITH.indexOf("glance-editor:"))}`;
    const r = await validateConfig(text);
    expect(r.ok, r.output).toBe(true);
  });
});
