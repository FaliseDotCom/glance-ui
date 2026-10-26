// ADR-0031: moving things anywhere, by drag or by Move to…: a widget between any lists (columns, the head strip, groups
// and split columns, on any page), bookmark links and groups between groups and Bookmarks widgets, pages, and the items of
// any list. Pure functions over the model, tested in Node (moves.test.ts). An `index` is where the item lands in the
// list as it was before the move: the accent line's position.

import { WIDGETS, type DashboardT, type PageT, type WidgetT } from "@glance-editor/model";
import { newId } from "./layout.ts";
import { widgetName } from "./text.ts";
import { childRef, listLabel, listOf, parentOf, tidyHead, typeLabel, widgetAt, type ListRef, type WidgetRef } from "./widgets.ts";

/** Move one item of a list to `index`. */
export function moveItem<T>(a: T[], from: number, index: number): void {
  if (from < 0 || from >= a.length) return;
  const at = index > from ? index - 1 : index;
  const [x] = a.splice(from, 1);
  a.splice(Math.max(0, Math.min(at, a.length)), 0, x!);
}

/** A page to `index` among the pages. */
export function movePageTo(d: DashboardT, pageId: string, index: number) {
  moveItem(d.pages, d.pages.findIndex((p) => p._id === pageId), index);
}

// ---- widgets ---------------------------------------------------------------------------------------------------------

type Container = WidgetT & { widgets?: WidgetT[] };

export const sameList = (a: ListRef, b: ListRef) => a.pageId === b.pageId && a.column === b.column && a.parentIds.join("/") === b.parentIds.join("/");

/** Why a widget can't go into a list (inside itself, or a type its new parent can't hold), or null. */
export function cantMoveInto(d: DashboardT, r: WidgetRef, to: ListRef): string | null {
  const w = widgetAt(d, r);
  if (!w) return "That widget isn't in the draft any more.";
  const inside = to.pageId === r.pageId && to.column === r.column && to.parentIds.length >= r.ids.length && r.ids.every((id, i) => to.parentIds[i] === id);
  if (inside) return "A widget can't go inside itself.";
  if (!to.parentIds.length) return null;
  const parent = widgetAt(d, { ...to, ids: to.parentIds });
  if (!parent || !WIDGETS[parent.type]?.container) return "That isn't a group or a split column.";
  if (WIDGETS[parent.type]?.disallowedChildren?.includes(w.type)) return `A ${typeLabel(parent.type).toLowerCase()} can’t contain a ${typeLabel(w.type).toLowerCase()}.`;
  return null;
}

/** Move a widget to `index` in any list (another page too); returns its new reference. */
export function moveWidgetToList(d: DashboardT, r: WidgetRef, to: ListRef, index: number): WidgetRef {
  const why = cantMoveInto(d, r, to);
  if (why) throw new Error(why);
  const from = listOf(d, parentOf(r));
  const i = from.findIndex((w) => w._id === r.ids[r.ids.length - 1]);
  const target = listOf(d, to, true);
  const at = from === target && index > i ? index - 1 : index;
  const [w] = from.splice(i, 1);
  target.splice(Math.max(0, Math.min(at, target.length)), 0, w!);
  for (const p of new Set([r.pageId, to.pageId])) tidyHead(d.pages.find((x) => x._id === p) as PageT);
  return childRef(to, w!._id);
}

export interface Destination {
  to: ListRef;
  /** "Home › Column 2", "Home › Column 2 › Group". */
  label: string;
}

/** Every list a widget can be moved to, for Move to…: each page's head strip and columns, and their groups and split columns. */
export function widgetDestinations(d: DashboardT, r: WidgetRef): Destination[] {
  const out: Destination[] = [];
  const add = (to: ListRef, list: WidgetT[]) => {
    if (!sameList(to, parentOf(r)) && !cantMoveInto(d, r, to)) out.push({ to, label: listLabel(d, to) });
    for (const w of list) if (WIDGETS[w.type]?.container) add({ ...to, parentIds: [...to.parentIds, w._id] }, (w as Container).widgets ?? []);
  };
  for (const p of d.pages) {
    add({ pageId: p._id, column: "head", parentIds: [] }, p["head-widgets"] ?? []);
    p.columns.forEach((c, ci) => add({ pageId: p._id, column: ci, parentIds: [] }, c.widgets));
  }
  return out;
}

// ---- bookmarks -------------------------------------------------------------------------------------------------------

type Link = { _id: string; title?: string };
type Group = { _id: string; title?: string; color?: string; links?: Link[] };
type Bookmarks = WidgetT & { groups?: Group[] };

export interface LinkRef {
  widget: WidgetRef;
  groupId: string;
  linkId: string;
}

const bookmarks = (d: DashboardT, r: WidgetRef): Bookmarks => {
  const w = widgetAt(d, r);
  if (!w || w.type !== "bookmarks") throw new Error("not a Bookmarks widget");
  return w as Bookmarks;
};
const groupOf = (d: DashboardT, r: WidgetRef, groupId: string): Group => {
  const g = bookmarks(d, r).groups?.find((x) => x._id === groupId);
  if (!g) throw new Error(`no group ${groupId}`);
  return g;
};
/** A Bookmarks widget with no groups left, or a group with no links, drops the empty key (as the Bookmarks section does). */
const tidyGroup = (g: Group) => { if (g.links?.length === 0) delete g.links; };
const tidyBookmarks = (w: Bookmarks) => { if (w.groups?.length === 0) delete w.groups; };

/** A link to `index` in a group of any Bookmarks widget. */
export function moveLink(d: DashboardT, from: LinkRef, to: { widget: WidgetRef; groupId: string; index: number }) {
  const fg = groupOf(d, from.widget, from.groupId);
  const tg = groupOf(d, to.widget, to.groupId);
  const i = (fg.links ?? []).findIndex((l) => l._id === from.linkId);
  if (i < 0) throw new Error(`no link ${from.linkId}`);
  const target = (tg.links ??= []);
  const at = fg === tg && to.index > i ? to.index - 1 : to.index;
  const [l] = fg.links!.splice(i, 1);
  target.splice(Math.max(0, Math.min(at, target.length)), 0, l!);
  tidyGroup(fg);
}

/**
 * A link dropped on another Bookmarks widget: it goes at the end of that widget's first group, or into a new group
 * named like its old one when the widget has none. Returns the group's id.
 */
export function moveLinkToWidget(d: DashboardT, from: LinkRef, widget: WidgetRef): string {
  const w = bookmarks(d, widget);
  let g = w.groups?.[0];
  if (!g) {
    const old = groupOf(d, from.widget, from.groupId);
    g = { _id: newId("group"), ...(old.title ? { title: old.title } : {}) };
    (w.groups ??= []).push(g);
  }
  moveLink(d, from, { widget, groupId: g._id, index: g.links?.length ?? 0 });
  return g._id;
}

/** A whole group to `index` among the groups of any Bookmarks widget. */
export function moveGroup(d: DashboardT, from: { widget: WidgetRef; groupId: string }, to: { widget: WidgetRef; index: number }) {
  const fw = bookmarks(d, from.widget);
  const tw = bookmarks(d, to.widget);
  const i = (fw.groups ?? []).findIndex((g) => g._id === from.groupId);
  if (i < 0) throw new Error(`no group ${from.groupId}`);
  const target = (tw.groups ??= []);
  const at = fw === tw && to.index > i ? to.index - 1 : to.index;
  const [g] = fw.groups!.splice(i, 1);
  target.splice(Math.max(0, Math.min(at, target.length)), 0, g!);
  tidyBookmarks(fw);
}

export interface BookmarksPlace {
  widget: WidgetRef;
  /** "Home › Column 2 › Services". */
  label: string;
  groups: { id: string; title: string; links: number }[];
}

/** Every Bookmarks widget in the draft (in groups too), with its groups: where Move to… can send a link or a group. */
export function bookmarkPlaces(d: DashboardT): BookmarksPlace[] {
  const out: BookmarksPlace[] = [];
  const visit = (list: WidgetT[], l: ListRef) => {
    for (const w of list) {
      if (w.type === "bookmarks") {
        const gs = (w as Bookmarks).groups ?? [];
        out.push({ widget: childRef(l, w._id), label: `${listLabel(d, l)} › ${widgetName(w, typeLabel(w.type))}`,
          groups: gs.map((g, i) => ({ id: g._id, title: g.title || `Group ${i + 1}`, links: g.links?.length ?? 0 })) });
      }
      if (WIDGETS[w.type]?.container) visit((w as Container).widgets ?? [], { ...l, parentIds: [...l.parentIds, w._id] });
    }
  };
  for (const p of d.pages) {
    visit(p["head-widgets"] ?? [], { pageId: p._id, column: "head", parentIds: [] });
    p.columns.forEach((c, ci) => visit(c.widgets, { pageId: p._id, column: ci, parentIds: [] }));
  }
  return out;
}
