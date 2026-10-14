// Widget operations (D-05, D-15 to D-18). Property: any sequence of operations the UI offers enabled keeps the draft
// valid for nesting (a group never holds a group or split column), loses no widget and never duplicates an id.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkDashboard, WIDGETS, type DashboardT, type WidgetT } from "@glance-editor/model";
import {
  addOptions, addWidget, canMove, canMoveColumn, childRef, deleteWidget, findWidget, listLabel, listOf, moveWidget,
  moveWidgetColumn, moveWidgetTo, newWidget, parentOf, widgetAt, type ListRef, type WidgetRef,
} from "../src/widgets.ts";

const draft = (): DashboardT => ({
  schemaVersion: 2,
  pages: [{
    _id: "p", name: "Home",
    "head-widgets": [{ _id: "s", type: "search" }],
    columns: [
      { _id: "c0", size: "small", widgets: [{ _id: "a", type: "clock" }, { _id: "b", type: "calendar" }] },
      { _id: "c1", size: "full", widgets: [{ _id: "g", type: "group", widgets: [{ _id: "g1", type: "rss" }, { _id: "g2", type: "hacker-news" }] } as WidgetT] },
    ],
  }],
});
const ids = (l: WidgetT[]) => l.map((w) => w._id);
const col = (d: DashboardT, c: number) => ids(d.pages[0]!.columns[c]!.widgets);
const ref = (column: number | "head", ...path: string[]): WidgetRef => ({ pageId: "p", column, ids: path });

describe("add widget (D-18)", () => {
  it("lists every type Glance accepts except the old alias, in a column", () => {
    const opts = addOptions(null);
    expect(opts.map((o) => o.type)).not.toContain("stocks");
    expect(opts).toHaveLength(28);
    expect(opts.every((o) => !o.disabled)).toBe(true);
  });

  it("in a group, Group and Split column are disabled with the reason (Glance v0.8.6 widget-group.go)", () => {
    const opts = addOptions("group");
    expect(opts.filter((o) => o.disabled).map((o) => [o.type, o.why])).toEqual([
      ["group", "A group can’t contain this."], ["split-column", "A group can’t contain this."],
    ]);
    expect(addOptions("split-column").some((o) => o.disabled)).toBe(false);
  });

  it("search matches the label, the type name or the category; no match gives an empty list", () => {
    expect(addOptions(null, "rss").map((o) => o.type)).toEqual(["rss"]);
    expect(addOptions(null, "split").map((o) => o.type)).toEqual(["split-column"]);
    expect(addOptions(null, "dev").map((o) => o.type)).toEqual(["releases", "repository", "change-detection"]);
    expect(addOptions(null, "zzzz")).toEqual([]);
  });

  it("a new widget has only its type (containers an empty list), added at the end of its list", () => {
    expect(newWidget("weather")).toEqual({ _id: expect.any(String), type: "weather" });
    expect(newWidget("group")).toMatchObject({ type: "group", widgets: [] });
    const d = draft();
    const r = addWidget(d, { pageId: "p", column: 1, parentIds: ["g"] }, "lobsters");
    expect(ids(listOf(d, parentOf(r)))).toEqual(["g1", "g2", r.ids[1]]);
    expect(() => addWidget(d, { pageId: "p", column: 1, parentIds: ["g"] }, "group")).toThrow();
  });

  it("a head widget can be added to a page without a head strip yet", () => {
    const d = draft();
    delete d.pages[0]!["head-widgets"];
    const r = addWidget(d, { pageId: "p", column: "head", parentIds: [] }, "clock");
    expect(ids(d.pages[0]!["head-widgets"]!)).toEqual([r.ids[0]]);
  });
});

describe("move (D-15)", () => {
  it("up and down within a list; disabled at either end", () => {
    const d = draft();
    expect(canMove(d, ref(0, "a"), -1)).toBe(false);
    expect(canMove(d, ref(0, "a"), 1)).toBe(true);
    moveWidget(d, ref(0, "a"), 1);
    expect(col(d, 0)).toEqual(["b", "a"]);
    moveWidget(d, ref(1, "g", "g2"), -1);
    expect(ids((d.pages[0]!.columns[1]!.widgets[0] as { widgets: WidgetT[] }).widgets)).toEqual(["g2", "g1"]);
  });

  it("previous/next column moves to the end of that column; not from the head strip or inside a group", () => {
    const d = draft();
    expect(canMoveColumn(d, ref(0, "a"), -1)).toBe(false);
    expect(canMoveColumn(d, ref("head", "s"), 1)).toBe(false);
    expect(canMoveColumn(d, ref(1, "g", "g1"), -1)).toBe(false);
    const r = moveWidgetColumn(d, ref(0, "a"), 1);
    expect(r).toEqual(ref(1, "a"));
    expect(col(d, 1)).toEqual(["g", "a"]);
  });

  it("drag: lands where the accent line was, within a list, across columns and into or out of the head strip", () => {
    let d = draft();
    moveWidgetTo(d, ref(0, "a"), 0, 2); // after b
    expect(col(d, 0)).toEqual(["b", "a"]);
    d = draft();
    moveWidgetTo(d, ref(0, "b"), 0, 0);
    expect(col(d, 0)).toEqual(["b", "a"]);
    d = draft();
    expect(moveWidgetTo(d, ref(1, "g"), 0, 1)).toEqual(ref(0, "g"));
    expect(col(d, 0)).toEqual(["a", "g", "b"]);
    d = draft();
    moveWidgetTo(d, ref("head", "s"), 1, 0);
    expect(col(d, 1)).toEqual(["s", "g"]);
    expect(d.pages[0]!["head-widgets"]).toBeUndefined(); // an emptied head strip drops its key
    d = draft();
    moveWidgetTo(d, ref(0, "a"), "head", 1);
    expect(ids(d.pages[0]!["head-widgets"]!)).toEqual(["s", "a"]);
  });
});

describe("delete, find, labels", () => {
  it("delete returns the widget; the last head widget takes the key with it", () => {
    const d = draft();
    expect(deleteWidget(d, ref(1, "g", "g1"))).toMatchObject({ _id: "g1" });
    expect(deleteWidget(d, ref("head", "s"))).toMatchObject({ _id: "s" });
    expect(d.pages[0]!["head-widgets"]).toBeUndefined();
  });

  it("finds a widget anywhere, and names where it is", () => {
    const d = draft();
    expect(findWidget(d, "g2")).toEqual(ref(1, "g", "g2"));
    expect(findWidget(d, "s")).toEqual(ref("head", "s"));
    expect(findWidget(d, "nope")).toBeUndefined();
    expect(widgetAt(d, ref(1, "g", "g2"))).toMatchObject({ type: "hacker-news" });
    expect(widgetAt(d, ref(1, "nope"))).toBeUndefined();
    expect(listLabel(d, { pageId: "p", column: 1, parentIds: ["g"] })).toBe("Home › Column 2 › Group");
    expect(listLabel(d, { pageId: "p", column: "head", parentIds: [] })).toBe("Home › Head widgets");
  });

  it("reading never changes the draft", () => {
    const d = draft();
    delete d.pages[0]!["head-widgets"];
    const before = JSON.stringify(d);
    listOf(d, { pageId: "p", column: "head", parentIds: [] });
    widgetAt(d, ref("head", "x"));
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("property: enabled operations keep nesting valid, lose nothing, duplicate nothing", () => {
  type Op = { kind: number; a: number; b: number; c: number };
  const all = (d: DashboardT) => {
    const out: WidgetRef[] = [];
    const visit = (list: WidgetT[], l: ListRef) => list.forEach((w) => {
      out.push(childRef(l, w._id));
      const kids = (w as { widgets?: WidgetT[] }).widgets;
      if (kids) visit(kids, { ...l, parentIds: [...l.parentIds, w._id] });
    });
    const p = d.pages[0]!;
    visit(p["head-widgets"] ?? [], { pageId: "p", column: "head", parentIds: [] });
    p.columns.forEach((c, ci) => visit(c.widgets, { pageId: "p", column: ci, parentIds: [] }));
    return out;
  };
  const lists = (d: DashboardT): ListRef[] => [
    { pageId: "p", column: "head", parentIds: [] },
    ...d.pages[0]!.columns.map((_, ci) => ({ pageId: "p", column: ci, parentIds: [] })),
    ...all(d).filter((r) => WIDGETS[widgetAt(d, r)!.type]?.container).map((r) => ({ pageId: r.pageId, column: r.column, parentIds: r.ids })),
  ];

  it("2000 runs", () => {
    fc.assert(fc.property(fc.array(fc.record({ kind: fc.nat(4), a: fc.nat(50), b: fc.nat(50), c: fc.nat(3) }), { maxLength: 40 }), (ops: Op[]) => {
      const d = draft();
      let expected = all(d).length;
      for (const o of ops) {
        const ws = all(d);
        const r = ws[o.a % Math.max(1, ws.length)];
        switch (o.kind) {
          case 0: {
            const l = lists(d)[o.a % lists(d).length]!;
            const parent = l.parentIds.length ? widgetAt(d, { ...l, ids: l.parentIds })!.type : null;
            const enabled = addOptions(parent).filter((x) => !x.disabled);
            addWidget(d, l, enabled[o.b % enabled.length]!.type);
            expected++;
            break;
          }
          case 1: if (r && canMove(d, r, o.c % 2 ? 1 : -1)) moveWidget(d, r, o.c % 2 ? 1 : -1); break;
          case 2: if (r && canMoveColumn(d, r, o.c % 2 ? 1 : -1)) moveWidgetColumn(d, r, o.c % 2 ? 1 : -1); break;
          case 3: if (r && r.ids.length === 1) {
            const cols = ["head", 0, 1] as const;
            const to = cols[o.c % 3]!;
            moveWidgetTo(d, r, to, o.b % (listOf(d, { pageId: "p", column: to, parentIds: [] }).length + 1));
          } break;
          case 4: if (r) { const gone = 1 + all(d).filter((x) => x.ids.length > r.ids.length && x.ids[r.ids.length - 1] === r.ids[r.ids.length - 1]).length; deleteWidget(d, r); expected -= gone; } break;
        }
      }
      const now = all(d);
      expect(now.length).toBe(expected);
      expect(new Set(now.map((x) => x.ids[x.ids.length - 1])).size).toBe(now.length);
      expect(checkDashboard(d).filter((i) => i.code === "widget.invalid-nesting" || i.code === "model.duplicate-id")).toEqual([]);
    }), { numRuns: 2000 });
  });
});
