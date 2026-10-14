// The change list (design D-26, handoff §2): a structural diff of the draft against its base, not a log of edits.

import { isRawWidget, WIDGETS, type DashboardT, type Field, type WidgetT } from "@glance-editor/model";
import { deepEqual, stripIds } from "@glance-editor/document";

export interface Change {
  kind: "added" | "removed" | "changed" | "moved" | "renamed";
  /** What the user recognises: page name, widget title or type. */
  label: string;
  /** Id of the page or widget, when there is one (for "Go to"). */
  id?: string;
}

interface Placed {
  w: WidgetT;
  where: string;
  index: number;
}

function widgets(d: DashboardT): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const visit = (list: WidgetT[], where: string) =>
    list.forEach((w, index) => {
      out.set(w._id, { w, where, index });
      if (!isRawWidget(w) && (w.type === "group" || w.type === "split-column")) visit(w.widgets ?? [], `${where}/${w._id}`);
    });
  for (const p of d.pages) {
    visit(p["head-widgets"] ?? [], `${p._id}/head`);
    p.columns.forEach((c) => visit(c.widgets, `${p._id}/${c._id}`));
  }
  return out;
}

const widgetLabel = (w: WidgetT) => {
  const title = !isRawWidget(w) ? w.title : (w._raw.title as string | undefined);
  return title ? `${title} (${w.type})` : w.type;
};

/**
 * Keyed lists are maps in the file (a docker-containers widget's `containers`, for example), and Glance reads them as
 * Go maps, so their order means nothing: compare them sorted by key. Hiding a container and showing it again
 * removes and re-adds its entry, and that is no change.
 */
function canonical(v: unknown, fields: readonly Field[]): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const out: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const f of fields) {
    const x = out[f.key];
    if (!Array.isArray(x) || !f.item) continue;
    const items = x.map((i) => canonical(i, f.item!));
    if (f.kind === "keyedList" && f.keyField) {
      const k = f.keyField.key;
      items.sort((a, b) => String((a as Record<string, unknown>)?.[k]).localeCompare(String((b as Record<string, unknown>)?.[k])));
    }
    out[f.key] = items;
  }
  return out;
}

/** The widget's own settings, without its children (children are compared separately). */
const own = (w: WidgetT) => {
  const { widgets: _children, ...rest } = w as WidgetT & { widgets?: unknown };
  const fields = !isRawWidget(w) && !w._yaml ? WIDGETS[w.type]?.fields : undefined;
  return stripIds(fields ? canonical(rest, fields) : rest);
};

export function describeChanges(base: DashboardT, draft: DashboardT): Change[] {
  const out: Change[] = [];
  const basePages = new Map(base.pages.map((p, i) => [p._id, { p, i }]));
  const draftIds = new Set(draft.pages.map((p) => p._id));
  draft.pages.forEach((p, i) => {
    const b = basePages.get(p._id);
    if (!b) return out.push({ kind: "added", label: `Page "${p.name}"`, id: p._id });
    if (b.p.name !== p.name) out.push({ kind: "renamed", label: `Page "${b.p.name}" → "${p.name}"`, id: p._id });
    const settings = (x: typeof p) => stripIds({ ...x, name: undefined, columns: x.columns.map((c) => ({ ...c, widgets: c.widgets.map((w) => w._id) })), "head-widgets": (x["head-widgets"] ?? []).map((w) => w._id) });
    const layoutBase = b.p.columns.map((c) => [c._id, c.size]), layoutDraft = p.columns.map((c) => [c._id, c.size]);
    if (!deepEqual(layoutBase, layoutDraft)) out.push({ kind: "changed", label: `Page "${p.name}": columns`, id: p._id });
    else if (!deepEqual(settings({ ...b.p, columns: p.columns, "head-widgets": p["head-widgets"] }), settings(p))) {
      out.push({ kind: "changed", label: `Page "${p.name}": settings`, id: p._id });
    }
    if (b.i !== i && base.pages.length === draft.pages.length) out.push({ kind: "moved", label: `Page "${p.name}"`, id: p._id });
  });
  for (const [id, { p }] of basePages) if (!draftIds.has(id)) out.push({ kind: "removed", label: `Page "${p.name}"`, id });

  const bw = widgets(base), dw = widgets(draft);
  // Widgets that come or go with their whole page are covered by the page's own entry.
  const pageOf = (where: string) => where.split("/")[0]!;
  const newPages = new Set(draft.pages.filter((p) => !basePages.has(p._id)).map((p) => p._id));
  for (const [id, d] of dw) {
    const b = bw.get(id);
    if (!b && newPages.has(pageOf(d.where))) continue;
    if (!b) out.push({ kind: "added", label: `Widget ${widgetLabel(d.w)}`, id });
    else {
      if (!deepEqual(own(b.w), own(d.w))) out.push({ kind: "changed", label: `Widget ${widgetLabel(d.w)}`, id });
      if (b.where !== d.where) out.push({ kind: "moved", label: `Widget ${widgetLabel(d.w)}`, id });
    }
  }
  for (const [id, b] of bw) if (!dw.has(id) && draftIds.has(pageOf(b.where))) out.push({ kind: "removed", label: `Widget ${widgetLabel(b.w)}` });

  // Reordering inside one list: the relative order of the widgets that stayed in it changed.
  const order = (m: Map<string, Placed>) => {
    const lists = new Map<string, string[]>();
    for (const [id, p] of [...m].sort((a, b) => a[1].index - b[1].index)) lists.set(p.where, [...(lists.get(p.where) ?? []), id]);
    return lists;
  };
  const bo = order(bw), dorder = order(dw);
  for (const [where, ids] of dorder) {
    const kept = ids.filter((id) => bw.get(id)?.where === where);
    const before = (bo.get(where) ?? []).filter((id) => kept.includes(id));
    if (!deepEqual(kept, before)) out.push({ kind: "moved", label: `Widgets reordered (${kept.length})`, id: kept[0] });
  }

  for (const section of ["theme", "branding", "server", "document", "auth"] as const) {
    if (!deepEqual(stripIds(base[section]), stripIds(draft[section]))) out.push({ kind: "changed", label: section[0]!.toUpperCase() + section.slice(1) });
  }
  if (!deepEqual(base.extra, draft.extra)) out.push({ kind: "changed", label: "Other settings" });
  return out;
}
