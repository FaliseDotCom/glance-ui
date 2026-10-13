// D-07 to D-10: rules are enforced by disabling. Property: any sequence of *enabled* operations, starting from any
// valid layout, keeps every page valid for Glance (no page/column rule errors), and nothing is lost.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkDashboard, type DashboardT, type PageT } from "@glance-editor/model";
import {
  addColumn, addColumnState, addPage, deletePage, deletePageState, moveColumn, movePage, removeColumn, removeColumnState,
  setSize, setWidth, sizeOptions, widgetCount, widthOptions,
} from "../src/layout.ts";

const LAYOUTS: PageT["columns"][number]["size"][][] = [
  ["full"], ["small", "full"], ["full", "small"], ["full", "full"], ["small", "full", "small"], ["small", "full", "full"],
];
let n = 0;
const start = (layout: number): DashboardT => ({
  schemaVersion: 2,
  pages: [{
    _id: "p0", name: "Home",
    columns: LAYOUTS[layout]!.map((size, i) => ({ _id: `c${i}`, size, widgets: [{ _id: `w${n++}`, type: "clock" }, { _id: `w${n++}`, type: "calendar" }] })),
  }],
});

const layoutErrors = (d: DashboardT) =>
  checkDashboard(d).filter((i) => i.severity === "error" && /^(page|dashboard)\./.test(i.code));

type Op = { kind: number; a: number; b: number };

/** Apply op only through what the UI would offer enabled. Returns false if the op was disabled (not applied). */
function apply(d: DashboardT, o: Op): boolean {
  const p = d.pages[o.a % d.pages.length]!;
  const ci = o.b % p.columns.length;
  switch (o.kind) {
    case 0: if (addColumnState(p).disabled) return false; addColumn(d, p._id); return true;
    case 1: if (removeColumnState(p, ci).disabled) return false; removeColumn(d, p._id, ci); return true;
    case 2: { const opt = sizeOptions(p, ci)[o.b % 2]!; if (opt.disabled) return false; setSize(d, p._id, ci, opt.value); return true; }
    case 3: { const opt = widthOptions(p)[o.b % 3]!; if (opt.disabled) return false; setWidth(d, p._id, opt.value); return true; }
    case 4: moveColumn(d, p._id, ci, o.b % 2 ? 1 : -1); return true;
    case 5: addPage(d); return true;
    case 6: if (deletePageState(d).disabled) return false; deletePage(d, p._id); return true;
    case 7: movePage(d, p._id, o.b % 2 ? 1 : -1); return true;
  }
  return false;
}

describe("layout rules (D-07 to D-10)", () => {
  it("enabled operations never produce a layout Glance rejects, and removing columns never loses widgets", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 5 }),
      fc.array(fc.record({ kind: fc.integer({ min: 0, max: 7 }), a: fc.nat(), b: fc.nat() }), { maxLength: 40 }),
      (layout, ops) => {
        const d = start(layout);
        for (const o of ops) {
          const before = d.pages.reduce((s, p) => s + widgetCount(p), 0);
          const deleted = o.kind === 6 ? widgetCount(d.pages[o.a % d.pages.length]!) : 0;
          apply(d, o);
          const after = d.pages.reduce((s, p) => s + widgetCount(p), 0);
          expect(layoutErrors(d)).toEqual([]);
          if (o.kind !== 6) expect(after).toBe(before);
          else expect(after === before || after === before - deleted).toBe(true);
        }
      },
    ), { numRuns: 2000 });
  });

  it("disabled options say why", () => {
    const d = start(4); // small, full, small
    const p = d.pages[0]!;
    expect(widthOptions(p).find((o) => o.value === "slim")).toMatchObject({ disabled: true, why: "Slim allows at most 2 columns. Remove a column to use it." });
    expect(addColumnState(p)).toEqual({ disabled: true, why: "A page holds at most 3 columns." });
    expect(removeColumnState(p, 1)).toEqual({ disabled: true, why: "This is the only full column." });
    expect(sizeOptions(p, 1).find((o) => o.value === "small")).toMatchObject({ disabled: true, why: "At least 1 column must be full." });
    expect(deletePageState(d)).toEqual({ disabled: true, why: "Glance needs at least one page." });
    const two = start(3); // full, full
    expect(sizeOptions(two.pages[0]!, 0).find((o) => o.value === "full")).toMatchObject({ disabled: false });
    expect(addColumn(two, "p0")).toBeUndefined();
    expect(sizeOptions(two.pages[0]!, 2).find((o) => o.value === "full")).toMatchObject({ disabled: true, why: "At most 2 columns can be full." });
  });

  it("removing a column moves its widgets to the neighbour (D-09)", () => {
    const d = start(4);
    const ids = d.pages[0]!.columns[0]!.widgets.map((w) => w._id);
    expect(removeColumn(d, "p0", 0)).toEqual({ movedTo: 0, count: 2 });
    expect(d.pages[0]!.columns[0]!.widgets.slice(-2).map((w) => w._id)).toEqual(ids);
    const e = start(4);
    const last = e.pages[0]!.columns[2]!.widgets.map((w) => w._id);
    expect(removeColumn(e, "p0", 2)).toEqual({ movedTo: 1, count: 2 });
    expect(e.pages[0]!.columns[1]!.widgets.slice(-2).map((w) => w._id)).toEqual(last);
  });

  it("choosing Default width removes the key; other widths set it", () => {
    const d = start(1);
    setWidth(d, "p0", "slim");
    expect(d.pages[0]!.width).toBe("slim");
    setWidth(d, "p0", "default");
    expect("width" in d.pages[0]!).toBe(false);
  });
});
