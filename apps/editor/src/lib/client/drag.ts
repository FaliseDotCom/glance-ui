// Drag a grip (design D-15, handoff §7): mouse only, so touch scrolling is never captured. On a phone, and from the
// keyboard, the grip is a button that opens move buttons instead. Drop targets carry data attributes:
//   widgets: [data-drop="w"][data-col][data-index] (lands before that card), [data-drop="end"][data-col] (end of a list)
//   columns: [data-coldrop][data-index]
// The accent line is drawn by the layout from `app.drag.target`.

import type { App } from "./app.svelte.ts";

export interface GripDrag {
  app: App;
  kind: "widget" | "column";
  /** Widget id, or the column index for a column. */
  id: string;
  column: number | "head";
  onDrop: (target: { column: number | "head"; index: number } | number) => void;
}

const colOf = (v: string | undefined): number | "head" => (v === "head" ? "head" : Number(v));

function targetAt(x: number, y: number, kind: GripDrag["kind"]) {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof Element)) return null;
  if (kind === "column") {
    const c = el.closest<HTMLElement>("[data-coldrop]");
    return c ? Number(c.dataset.index) : null;
  }
  const w = el.closest<HTMLElement>("[data-drop]");
  if (!w) return null;
  const column = colOf(w.dataset.col);
  if (w.dataset.drop === "end") return { column, index: Number(w.dataset.count) };
  const r = w.getBoundingClientRect();
  const i = Number(w.dataset.index);
  // The lower half of a card means "after it".
  return { column, index: y > r.top + r.height / 2 ? i + 1 : i };
}

/** Svelte action for a grip button. A click without movement stays a click (it toggles the move buttons). */
export function gripDrag(node: HTMLElement, params: GripDrag) {
  let p = params;
  let start: { x: number; y: number } | null = null;
  let dragging = false;
  let suppressClick = false;

  const move = (e: PointerEvent) => {
    if (!start) return;
    if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
    if (!dragging) {
      dragging = true;
      p.app.drag = p.kind === "widget"
        ? { kind: "widget", id: p.id, column: p.column, target: null }
        : { kind: "column", index: Number(p.id), target: null };
      document.body.style.cursor = "grabbing";
    }
    e.preventDefault();
    const t = targetAt(e.clientX, e.clientY, p.kind);
    const d = p.app.drag;
    if (d?.kind === "widget") d.target = t && typeof t === "object" ? t : null;
    else if (d?.kind === "column") d.target = typeof t === "number" ? t : null;
  };
  const end = (e: PointerEvent | null) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key);
    document.body.style.cursor = "";
    const d = p.app.drag;
    if (dragging) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      if (e && d) {
        const t = d.target;
        if (t !== null) p.onDrop(t);
      }
    }
    p.app.drag = null;
    start = null;
    dragging = false;
  };
  const up = (e: PointerEvent) => end(e);
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") end(null); };
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
  };
  const click = (e: MouseEvent) => {
    if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); }
  };
  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  return {
    update(next: GripDrag) { p = next; },
    destroy() {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      end(null);
    },
  };
}
