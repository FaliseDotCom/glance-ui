// ADR-0031: moving things anywhere. Widgets between any lists (into and out of groups and split columns, other pages),
// bookmark links and groups between groups and Bookmarks widgets, pages. Property: any sequence of moves the UI offers
// keeps nesting valid and loses or duplicates nothing.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkDashboard, type DashboardT, type WidgetT } from "@glance-editor/model";
import {
  bookmarkPlaces, cantMoveInto, moveGroup, moveItem, moveLink, moveLinkToWidget, movePageTo, moveWidgetToList, widgetDestinations,
} from "../src/moves.ts";
import { findWidget, type WidgetRef } from "../src/widgets.ts";

const bm = (id: string, groups: { id: string; title?: string; links: string[] }[]) =>
  ({ _id: id, type: "bookmarks", groups: groups.map((g) => ({ _id: g.id, ...(g.title ? { title: g.title } : {}), links: g.links.map((l) => ({ _id: l, title: l, url: `https://${l}.example.com` })) })) }) as unknown as WidgetT;
const draft = (): DashboardT => ({
  schemaVersion: 2,
  pages: [
    {
      _id: "p", name: "Home",
      "head-widgets": [{ _id: "s", type: "search" }],
      columns: [
        { _id: "c0", size: "small", widgets: [{ _id: "a", type: "clock" }, bm("b1", [{ id: "x", title: "Media", links: ["l1", "l2"] }, { id: "y", links: ["l3"] }])] },
        { _id: "c1", size: "full", widgets: [
          { _id: "g", type: "group", widgets: [{ _id: "g1", type: "rss" }] } as WidgetT,
          { _id: "sc", type: "split-column", widgets: [{ _id: "s1", type: "calendar" }] } as WidgetT,
          bm("b2", [{ id: "z", links: [] }]),
        ] },
      ],
    },
    { _id: "q", name: "Other", columns: [{ _id: "d0", size: "full", widgets: [bm("b3", [])] }] },
  ],
});
const ids = (l: WidgetT[]) => l.map((w) => w._id);
const ref = (column: number | "head", ...path: string[]): WidgetRef => ({ pageId: "p", column, ids: path });
const groups = (w: WidgetT | undefined) => ((w as { groups?: { _id: string; title?: string; links?: { _id: string }[] }[] }).groups ?? []).map((g) => [g._id, (g.links ?? []).map((l) => l._id)]);
const widget = (d: DashboardT, id: string) => { const visit = (l: WidgetT[]): WidgetT | undefined => l.map((w) => (w._id === id ? w : visit((w as { widgets?: WidgetT[] }).widgets ?? []))).find(Boolean); return d.pages.map((p) => visit([...(p["head-widgets"] ?? []), ...p.columns.flatMap((c) => c.widgets)])).find(Boolean); };

describe("moveItem and pages", () => {
  it("lands where the accent line was", () => {
    const a = ["a", "b", "c", "d"];
    moveItem(a, 0, 2);
    expect(a).toEqual(["b", "a", "c", "d"]);
    moveItem(a, 3, 0);
    expect(a).toEqual(["d", "b", "a", "c"]);
    moveItem(a, 1, 4);
    expect(a).toEqual(["d", "a", "c", "b"]);
    moveItem(a, 9, 0);
    expect(a).toEqual(["d", "a", "c", "b"]);
  });
  it("a page to another place", () => {
    const d = draft();
    movePageTo(d, "q", 0);
    expect(d.pages.map((p) => p._id)).toEqual(["q", "p"]);
  });
});

describe("widgets anywhere (ADR-0031)", () => {
  it("into a group, out of it, into a split column, to another page; the head strip tidies itself", () => {
    const d = draft();
    expect(moveWidgetToList(d, ref(0, "a"), { pageId: "p", column: 1, parentIds: ["g"] }, 0)).toEqual(ref(1, "g", "a"));
    expect(ids((widget(d, "g") as { widgets: WidgetT[] }).widgets)).toEqual(["a", "g1"]);
    expect(moveWidgetToList(d, ref(1, "g", "g1"), { pageId: "p", column: 0, parentIds: [] }, 0)).toEqual(ref(0, "g1"));
    expect(ids(d.pages[0]!.columns[0]!.widgets)).toEqual(["g1", "b1"]);
    moveWidgetToList(d, ref("head", "s"), { pageId: "p", column: 1, parentIds: ["sc"] }, 1);
    expect(ids((widget(d, "sc") as { widgets: WidgetT[] }).widgets)).toEqual(["s1", "s"]);
    expect(d.pages[0]!["head-widgets"]).toBeUndefined();
    expect(moveWidgetToList(d, ref(0, "b1"), { pageId: "q", column: 0, parentIds: [] }, 1)).toEqual({ pageId: "q", column: 0, ids: ["b1"] });
    expect(ids(d.pages[1]!.columns[0]!.widgets)).toEqual(["b3", "b1"]);
    expect(checkDashboard(d).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("refuses a group or split column in a group, and a widget inside itself, with the reason", () => {
    const d = draft();
    expect(cantMoveInto(d, ref(1, "sc"), { pageId: "p", column: 1, parentIds: ["g"] })).toBe("A group can’t contain a split column.");
    expect(cantMoveInto(d, ref(1, "g"), { pageId: "p", column: 1, parentIds: ["g"] })).toBe("A widget can't go inside itself.");
    expect(cantMoveInto(d, ref(1, "g"), { pageId: "p", column: 1, parentIds: ["sc"] })).toBeNull();
    expect(() => moveWidgetToList(d, ref(1, "sc"), { pageId: "p", column: 1, parentIds: ["g"] }, 0)).toThrow("can’t contain");
  });

  it("Move to… lists every other list it can go to, by name", () => {
    const d = draft();
    expect(widgetDestinations(d, ref(1, "g")).map((x) => x.label)).toEqual([
      "Home › Head widgets", "Home › Column 1", "Home › Column 2 › Split column", "Other › Head widgets", "Other › Column 1",
    ]);
    expect(widgetDestinations(d, ref(0, "a")).map((x) => x.label)).toContain("Home › Column 2 › Group");
  });

  it("property: any sequence of offered moves keeps nesting valid and every widget exactly once", () => {
    const all = (d: DashboardT) => d.pages.flatMap((p) => { const out: string[] = []; const v = (l: WidgetT[]) => l.forEach((w) => { out.push(w._id); v((w as { widgets?: WidgetT[] }).widgets ?? []); }); v(p["head-widgets"] ?? []); p.columns.forEach((c) => v(c.widgets)); return out; }).sort();
    fc.assert(fc.property(fc.array(fc.tuple(fc.nat(20), fc.nat(20), fc.nat(5)), { maxLength: 25 }), (steps) => {
      const d = draft();
      const before = all(d);
      for (const [wi, di, ix] of steps) {
        const id = before[wi % before.length]!;
        const r = findWidget(d, id)!;
        const dests = widgetDestinations(d, r);
        if (!dests.length) continue;
        moveWidgetToList(d, r, dests[di % dests.length]!.to, ix);
      }
      expect(all(d)).toEqual(before);
      expect(checkDashboard(d).filter((i) => i.severity === "error")).toEqual([]);
    }), { numRuns: 300 });
  });
});

describe("bookmarks anywhere (ADR-0031)", () => {
  const b1 = ref(0, "b1");
  const b2 = ref(1, "b2");
  const b3: WidgetRef = { pageId: "q", column: 0, ids: ["b3"] };

  it("a link within its group, to another group, to another widget's group; an emptied group drops its links key", () => {
    const d = draft();
    moveLink(d, { widget: b1, groupId: "x", linkId: "l1" }, { widget: b1, groupId: "x", index: 2 });
    expect(groups(widget(d, "b1"))).toEqual([["x", ["l2", "l1"]], ["y", ["l3"]]]);
    moveLink(d, { widget: b1, groupId: "y", linkId: "l3" }, { widget: b1, groupId: "x", index: 0 });
    expect(groups(widget(d, "b1"))).toEqual([["x", ["l3", "l2", "l1"]], ["y", []]]);
    expect("links" in (widget(d, "b1") as unknown as { groups: object[] }).groups[1]!).toBe(false);
    moveLink(d, { widget: b1, groupId: "x", linkId: "l2" }, { widget: b2, groupId: "z", index: 0 });
    expect(groups(widget(d, "b2"))).toEqual([["z", ["l2"]]]);
  });

  it("dropped on another widget: the end of its first group, or a new group named like the old one", () => {
    const d = draft();
    expect(moveLinkToWidget(d, { widget: b1, groupId: "x", linkId: "l1" }, b2)).toBe("z");
    expect(groups(widget(d, "b2"))).toEqual([["z", ["l1"]]]);
    const g = moveLinkToWidget(d, { widget: b1, groupId: "x", linkId: "l2" }, b3);
    const made = (widget(d, "b3") as unknown as { groups: { _id: string; title?: string }[] }).groups;
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ _id: g, title: "Media" });
  });

  it("a whole group: reordered, or to another widget; a widget left with no groups drops the key", () => {
    const d = draft();
    moveGroup(d, { widget: b1, groupId: "x" }, { widget: b1, index: 2 });
    expect(groups(widget(d, "b1")).map((g) => g[0])).toEqual(["y", "x"]);
    moveGroup(d, { widget: b2, groupId: "z" }, { widget: b3, index: 0 });
    expect("groups" in (widget(d, "b2") as object)).toBe(false);
    expect(groups(widget(d, "b3"))).toEqual([["z", []]]);
  });

  it("lists every Bookmarks widget, on every page, with its groups", () => {
    expect(bookmarkPlaces(draft()).map((p) => [p.label, p.groups.map((g) => g.title)])).toEqual([
      ["Home › Column 1 › Bookmarks", ["Media", "Group 2"]], ["Home › Column 2 › Bookmarks", ["Group 1"]], ["Other › Column 1 › Bookmarks", []],
    ]);
  });
});
