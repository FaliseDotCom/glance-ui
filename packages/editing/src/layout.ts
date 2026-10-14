// Page and column operations, and the layout rules the UI enforces by disabling (D-07 to D-10).
// Pure functions over the model, so every rule can be tested without a browser (layout.test.ts).
// Glance v0.8.6 rules (config.go isConfigStateValid; ADR-0009): 1 to 3 columns, 1 or 2 of them full, slim ≤ 2 columns,
// at least one page.

import type { ColumnT, DashboardT, PageT } from "@glance-editor/model";

export type Width = "default" | "slim" | "wide";
export type Size = ColumnT["size"];

export interface Option<T> {
  value: T;
  label: string;
  disabled: boolean;
  /** Shown next to a disabled option (D-07: every disabled control says why). */
  why: string;
}

let counter = 0;
/** Ids for pages and columns created in the editor. Imported items keep their path ids (ADR-0015). */
export const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const fullCount = (p: PageT) => p.columns.filter((c) => c.size === "full").length;
export const maxColumns = (p: PageT) => (p.width === "slim" ? 2 : 3);

export function widthOptions(p: PageT): Option<Width>[] {
  return (["default", "slim", "wide"] as const).map((w) => {
    const disabled = w === "slim" && p.columns.length > 2 && p.width !== "slim";
    return { value: w, label: w[0]!.toUpperCase() + w.slice(1), disabled, why: disabled ? "Slim allows at most 2 columns. Remove a column to use it." : "" };
  });
}

export function sizeOptions(p: PageT, ci: number): Option<Size>[] {
  const c = p.columns[ci]!;
  const full = fullCount(p);
  return (["small", "full"] as const).map((size) => {
    let why = "";
    if (size !== c.size) {
      if (size === "full" && full >= 2) why = "At most 2 columns can be full.";
      if (size === "small" && full <= 1) why = "At least 1 column must be full.";
    }
    return { value: size, label: size === "small" ? "Small · 300 px" : "Full", disabled: why !== "", why };
  });
}

export function addColumnState(p: PageT): { disabled: boolean; why: string } {
  if (p.columns.length < maxColumns(p)) return { disabled: false, why: "" };
  return { disabled: true, why: p.width === "slim" ? "Slim pages allow at most 2 columns." : "A page holds at most 3 columns." };
}

export function removeColumnState(p: PageT, ci: number): { disabled: boolean; why: string } {
  if (p.columns.length === 1) return { disabled: true, why: "A page needs at least one column." };
  if (p.columns[ci]!.size === "full" && fullCount(p) === 1) return { disabled: true, why: "This is the only full column." };
  return { disabled: false, why: "" };
}

export const deletePageState = (d: DashboardT) =>
  d.pages.length <= 1 ? { disabled: true, why: "Glance needs at least one page." } : { disabled: false, why: "" };

// ---- operations (each returns nothing; they mutate the draft copy they are given) -----------------------------------

const pageOf = (d: DashboardT, pageId: string) => {
  const p = d.pages.find((x) => x._id === pageId);
  if (!p) throw new Error(`no page ${pageId}`);
  return p;
};

/** D-08: a new column is Small. */
export function addColumn(d: DashboardT, pageId: string) {
  const p = pageOf(d, pageId);
  if (addColumnState(p).disabled) throw new Error("column limit");
  p.columns.push({ _id: newId("col"), size: "small", widgets: [] });
}

/** D-09: the column's widgets move to the neighbour (the one before it, or the next for the first column). */
export function removeColumn(d: DashboardT, pageId: string, ci: number): { movedTo: number; count: number } {
  const p = pageOf(d, pageId);
  if (removeColumnState(p, ci).disabled) throw new Error("column can't be removed");
  const to = ci > 0 ? ci - 1 : 1;
  const moved = p.columns[ci]!.widgets;
  p.columns[to]!.widgets.push(...moved);
  p.columns.splice(ci, 1);
  return { movedTo: to > ci ? to - 1 : to, count: moved.length };
}

export function moveColumn(d: DashboardT, pageId: string, ci: number, delta: -1 | 1) {
  const p = pageOf(d, pageId);
  const j = ci + delta;
  if (j < 0 || j >= p.columns.length) return;
  [p.columns[ci], p.columns[j]] = [p.columns[j]!, p.columns[ci]!];
}

export function setSize(d: DashboardT, pageId: string, ci: number, size: Size) {
  const p = pageOf(d, pageId);
  if (sizeOptions(p, ci).find((o) => o.value === size)!.disabled) throw new Error("size not allowed");
  p.columns[ci]!.size = size;
}

export function setWidth(d: DashboardT, pageId: string, width: Width) {
  const p = pageOf(d, pageId);
  if (widthOptions(p).find((o) => o.value === width)!.disabled) throw new Error("width not allowed");
  // "default" is Glance's default, so choosing it removes the key (unless the file spells it out already).
  if (width === "default") {
    if (p.width !== "default") delete p.width;
    return;
  }
  p.width = width;
}

export function addPage(d: DashboardT, name = "New page"): string {
  const id = newId("page");
  d.pages.push({ _id: id, name, columns: [{ _id: newId("col"), size: "full", widgets: [] }] });
  return id;
}

export function deletePage(d: DashboardT, pageId: string) {
  if (deletePageState(d).disabled) throw new Error("last page");
  d.pages.splice(d.pages.findIndex((p) => p._id === pageId), 1);
}

export function movePage(d: DashboardT, pageId: string, delta: -1 | 1) {
  const i = d.pages.findIndex((p) => p._id === pageId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= d.pages.length) return;
  [d.pages[i], d.pages[j]] = [d.pages[j]!, d.pages[i]!];
}

/** Widgets on a page, including those inside groups and split columns. */
export function widgetCount(p: PageT): number {
  let n = 0;
  const visit = (ws: readonly object[] | undefined) => ws?.forEach((w) => { n++; visit((w as { widgets?: object[] }).widgets); });
  visit(p["head-widgets"]);
  p.columns.forEach((c) => visit(c.widgets));
  return n;
}
