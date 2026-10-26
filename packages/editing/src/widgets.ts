// Widget operations for the layout and the inspector (design D-05, D-15 to D-18): add, move, delete, children.
// Pure functions over the model, tested in Node (widgets.test.ts). A widget is addressed by its page, its column (or the
// head strip) and the ids from the outermost container down to it, so a reference stays valid while things move around.
// Nesting rule (Glance v0.8.6 widget-group.go, tested in packages/glance): a group can't hold a group or a split column.

import { WIDGETS, WIDGET_TYPES, type DashboardT, type PageT, type WidgetT } from "@glance-editor/model";
import { newId } from "./layout.ts";

export type Column = number | "head";

/** A widget: where it sits on the page, and the ids from the outermost widget down to it. */
export interface WidgetRef {
  pageId: string;
  column: Column;
  ids: string[];
}

/** A list of widgets: a column, the head strip, or a container's children (`parentIds` = the container's ids). */
export interface ListRef {
  pageId: string;
  column: Column;
  parentIds: string[];
}

type Container = WidgetT & { widgets?: WidgetT[] };

const pageOf = (d: DashboardT, id: string): PageT => {
  const p = d.pages.find((x) => x._id === id);
  if (!p) throw new Error(`no page ${id}`);
  return p;
};

/** A column's or the head strip's widgets. Reading never changes the draft; `create` adds a missing head list. */
function topList(p: PageT, column: Column, create = false): WidgetT[] {
  if (column === "head") return create ? (p["head-widgets"] ??= []) : (p["head-widgets"] ?? []);
  const c = p.columns[column];
  if (!c) throw new Error(`no column ${column}`);
  return c.widgets;
}

/** The widgets in a list. Throws if the list doesn't exist. `create` adds a missing list (for adding to it). */
export function listOf(d: DashboardT, l: ListRef, create = false): WidgetT[] {
  let list = topList(pageOf(d, l.pageId), l.column, create);
  for (const id of l.parentIds) {
    const w = list.find((x) => x._id === id) as Container | undefined;
    if (!w) throw new Error(`no widget ${id}`);
    list = create ? (w.widgets ??= []) : (w.widgets ?? []);
  }
  return list;
}

export const parentOf = (r: WidgetRef): ListRef => ({ pageId: r.pageId, column: r.column, parentIds: r.ids.slice(0, -1) });
export const childRef = (l: ListRef, id: string): WidgetRef => ({ pageId: l.pageId, column: l.column, ids: [...l.parentIds, id] });

export function widgetAt(d: DashboardT, r: WidgetRef): WidgetT | undefined {
  try {
    return listOf(d, parentOf(r)).find((w) => w._id === r.ids[r.ids.length - 1]);
  } catch {
    return undefined;
  }
}

/** Where a widget is: its list and its index there. */
function locate(d: DashboardT, r: WidgetRef): { list: WidgetT[]; i: number } {
  const list = listOf(d, parentOf(r));
  const i = list.findIndex((w) => w._id === r.ids[r.ids.length - 1]);
  if (i < 0) throw new Error(`no widget ${r.ids.join("/")}`);
  return { list, i };
}

/** A widget anywhere in the draft, by id. */
export function findWidget(d: DashboardT, id: string): WidgetRef | undefined {
  const visit = (list: WidgetT[], l: ListRef): WidgetRef | undefined => {
    for (const w of list) {
      if (w._id === id) return childRef(l, w._id);
      const kids = (w as Container).widgets;
      if (Array.isArray(kids)) {
        const r = visit(kids, { ...l, parentIds: [...l.parentIds, w._id] });
        if (r) return r;
      }
    }
    return undefined;
  };
  for (const p of d.pages) {
    const h = visit(p["head-widgets"] ?? [], { pageId: p._id, column: "head", parentIds: [] });
    if (h) return h;
    for (const [ci, c] of p.columns.entries()) {
      const r = visit(c.widgets, { pageId: p._id, column: ci, parentIds: [] });
      if (r) return r;
    }
  }
  return undefined;
}

// ---- add (D-18) -------------------------------------------------------------------------------------------------

export interface TypeOption {
  type: string;
  label: string;
  category: string;
  disabled: boolean;
  /** D-07 and D-18: a disabled type says why, where it applies. */
  why: string;
}

/**
 * Add widget's list: every type Glance v0.8.6 accepts (aliases left out), filtered by the search text (label, type name or
 * category). In a group, Group and Split column are disabled with the reason.
 */
export function addOptions(parentType: string | null, query = ""): TypeOption[] {
  const q = query.trim().toLowerCase();
  const disallowed = parentType ? (WIDGETS[parentType]?.disallowedChildren ?? []) : [];
  const parentLabel = parentType ? (WIDGETS[parentType]?.label ?? parentType).toLowerCase() : "";
  return WIDGET_TYPES.map((t) => WIDGETS[t]!)
    .filter((s) => !s.aliasOf)
    .filter((s) => !q || s.label.toLowerCase().includes(q) || s.type.includes(q) || s.category.toLowerCase().includes(q))
    .map((s) => {
      const disabled = disallowed.includes(s.type);
      return { type: s.type, label: s.label, category: s.category, disabled, why: disabled ? `A ${parentLabel} can’t contain this.` : "" };
    });
}

/**
 * A new widget of this type. Only `type` is set (containers also get an empty list of children): Glance's defaults
 * apply and the form shows them as placeholders, so nothing is written that the user didn't choose.
 */
export function newWidget(type: string): WidgetT {
  const w: WidgetT = { _id: newId("w"), type } as WidgetT;
  if (WIDGETS[type]?.container) (w as Container).widgets = [];
  return w;
}

/** Add a widget at the end of a list; returns its reference. */
export function addWidget(d: DashboardT, l: ListRef, type: string): WidgetRef {
  const parentType = l.parentIds.length ? widgetAt(d, { ...l, ids: l.parentIds })?.type ?? null : null;
  if (addOptions(parentType).find((o) => o.type === type)?.disabled) throw new Error(`a ${parentType} can't contain a ${type}`);
  const w = newWidget(type);
  listOf(d, l, true).push(w);
  return childRef(l, w._id);
}

// ---- move (D-15) ------------------------------------------------------------------------------------------------

/** Can it move one step up (-1) or down (+1) in its own list? */
export function canMove(d: DashboardT, r: WidgetRef, delta: -1 | 1): boolean {
  const { list, i } = locate(d, r);
  return i + delta >= 0 && i + delta < list.length;
}

export function moveWidget(d: DashboardT, r: WidgetRef, delta: -1 | 1) {
  const { list, i } = locate(d, r);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
}

/** Previous/next column (top-level column widgets only). False at the edge, in the head strip and inside containers. */
export function canMoveColumn(d: DashboardT, r: WidgetRef, delta: -1 | 1): boolean {
  if (r.ids.length !== 1 || r.column === "head") return false;
  const c = r.column + delta;
  return c >= 0 && c < pageOf(d, r.pageId).columns.length;
}

/** Move to the end of the previous or next column; returns the new reference. */
export function moveWidgetColumn(d: DashboardT, r: WidgetRef, delta: -1 | 1): WidgetRef {
  if (!canMoveColumn(d, r, delta)) return r;
  const { list, i } = locate(d, r);
  const [w] = list.splice(i, 1);
  const to = (r.column as number) + delta;
  pageOf(d, r.pageId).columns[to]!.widgets.push(w!);
  return { ...r, column: to };
}

/**
 * Drag and drop (desktop): move a top-level widget to `index` in a column or the head strip of the same page. `index` is
 * where it lands in the list as it was before the move (the accent line's position). Returns the new reference.
 */
export function moveWidgetTo(d: DashboardT, r: WidgetRef, column: Column, index: number): WidgetRef {
  if (r.ids.length !== 1) throw new Error("only top-level widgets are dragged");
  const { list, i } = locate(d, r);
  const target = topList(pageOf(d, r.pageId), column, true);
  const at = list === target && index > i ? index - 1 : index;
  const [w] = list.splice(i, 1);
  target.splice(Math.max(0, Math.min(at, target.length)), 0, w!);
  tidyHead(pageOf(d, r.pageId));
  return { ...r, column };
}

/** An emptied head strip drops its key, so the file doesn't gain a `head-widgets: []` nobody wrote. */
export function tidyHead(p: PageT) {
  if (p["head-widgets"]?.length === 0) delete p["head-widgets"];
}

// ---- delete, replace (D-17) ----------------------------------------------------------------------------------------

export function deleteWidget(d: DashboardT, r: WidgetRef): WidgetT {
  const { list, i } = locate(d, r);
  const [w] = list.splice(i, 1);
  if (r.ids.length === 1) tidyHead(pageOf(d, r.pageId));
  return w!;
}

export function replaceWidget(d: DashboardT, r: WidgetRef, w: WidgetT) {
  const { list, i } = locate(d, r);
  list[i] = w;
}

/** Change a widget in place (the inspector's form). */
export function editWidget(d: DashboardT, r: WidgetRef, fn: (w: WidgetT) => void) {
  const { list, i } = locate(d, r);
  fn(list[i]!);
}

// ---- wording -----------------------------------------------------------------------------------------------------

export const typeLabel = (type: string) => WIDGETS[type]?.label ?? type;

/** "Home › Column 2", "Home › Head widgets", "Home › Column 2 › Group" (the inspector's crumb, Add widget's target). */
export function listLabel(d: DashboardT, l: ListRef): string {
  const p = d.pages.find((x) => x._id === l.pageId);
  const parts = [p?.name || "Untitled page", l.column === "head" ? "Head widgets" : `Column ${(l.column as number) + 1}`];
  let list: WidgetT[] = p ? topList(p, l.column) : [];
  for (const id of l.parentIds) {
    const w = list.find((x) => x._id === id);
    if (!w) break;
    const t = typeof (w as { title?: unknown }).title === "string" && (w as { title: string }).title ? (w as { title: string }).title : typeLabel(w.type);
    parts.push(t);
    list = (w as Container).widgets ?? [];
  }
  return parts.join(" › ");
}
