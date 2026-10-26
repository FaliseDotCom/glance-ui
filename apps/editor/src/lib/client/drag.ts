// Drag a grip (design D-15, extended by ADR-0031): with a mouse, or a finger on the grip itself (grips have
// `touch-action: none`, so a touch anywhere else still scrolls). A click or tap without movement stays a click (it
// opens move buttons). Escape cancels. Near the edge of the screen, or of a scrolling panel, the page scrolls along.
// Drop targets carry data attributes; the innermost one that accepts what is dragged wins:
//   data-drop-for="<kinds>"   the kinds it accepts, space separated
//   data-drop-list="<key>"    the list it belongs to (see the key helpers below)
//   and one of: data-drop-index="<i>"  an item: its later half means "after it" (data-drop-axis="x" side by side)
//               data-drop-end="<n>"    the end of a list of n items
//               data-drop-at="<i>"     exactly that place (a column, a widget card that takes links)
// Lists draw their accent line from `app.drag.target`.

import type { ListRef, WidgetRef } from "@glance-editor/editing";
import type { App } from "./app.svelte.ts";

export type DragKind = "widget" | "column" | "link" | "group" | "page" | "image";
export interface DropTarget {
  list: string;
  index: number;
}

export interface GripDrag {
  app: App;
  kind: DragKind;
  /** What is dragged (a widget id, a column index, "groupId/linkId"…), to show it as dragged. */
  id: string;
  /** Lists the dragged thing can't go to don't light up. */
  accept?: (list: string) => boolean;
  onDrop: (target: DropTarget) => void;
}

// ---- list keys --------------------------------------------------------------------------------------------------------
// "w|<page>|<column>|<parent ids>" a widget list; "c|<page>" a page's columns; "b|<widget>" a Bookmarks widget (its
// card); "g|<widget>" its groups; "l|<widget>|<group>" a group's links; "p" the pages; "i" slideshow images.

export const widgetKey = (r: WidgetRef) => `${r.pageId}|${r.column}|${r.ids.join("/")}`;
export const parseWidgetKey = (k: string): WidgetRef => {
  const [pageId, column, ids] = k.split("|") as [string, string, string];
  return { pageId, column: column === "head" ? "head" : Number(column), ids: ids.split("/") };
};
export const listKey = (l: ListRef) => `w|${l.pageId}|${l.column}|${l.parentIds.join("/")}`;
export function parseListKey(k: string): ListRef | null {
  const [t, pageId, column, parents] = k.split("|");
  if (t !== "w" || pageId === undefined || column === undefined) return null;
  return { pageId, column: column === "head" ? "head" : Number(column), parentIds: parents ? parents.split("/") : [] };
}
/** The part of a key after its type: `rest("l|p|0|b1|g1")` is "p|0|b1|g1". */
export const rest = (k: string) => k.slice(k.indexOf("|") + 1);

function targetAt(x: number, y: number, p: GripDrag): DropTarget | null {
  let el: Element | null = document.elementFromPoint(x, y);
  for (; el; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || !el.dataset.dropFor?.split(" ").includes(p.kind)) continue;
    const list = el.dataset.dropList ?? "";
    if (p.accept && !p.accept(list)) return null;
    if (el.dataset.dropAt !== undefined) return { list, index: Number(el.dataset.dropAt) };
    if (el.dataset.dropEnd !== undefined) return { list, index: Number(el.dataset.dropEnd) };
    const i = Number(el.dataset.dropIndex);
    const r = el.getBoundingClientRect();
    const after = el.dataset.dropAxis === "x" ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    return { list, index: after ? i + 1 : i };
  }
  return null;
}

/** The nearest scrolling ancestor under the pointer, or null for the page itself. */
function scroller(x: number, y: number): HTMLElement | null {
  for (let el = document.elementFromPoint(x, y); el && el !== document.body; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const o = getComputedStyle(el).overflowY;
    if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

const EDGE = 56;

/** Svelte action for a grip button. */
export function gripDrag(node: HTMLElement, params: GripDrag) {
  let p = params;
  let start: { x: number; y: number } | null = null;
  let at = { x: 0, y: 0 };
  let dragging = false;
  let suppressClick = false;
  let frame = 0;

  // While dragging, scroll the panel or page when the pointer is near its top or bottom edge.
  const scroll = () => {
    if (!dragging) return;
    const box = scroller(at.x, at.y);
    const top = box ? Math.max(0, box.getBoundingClientRect().top) : 0;
    const bottom = box ? Math.min(innerHeight, box.getBoundingClientRect().bottom) : innerHeight;
    const dy = at.y < top + EDGE ? -Math.ceil((top + EDGE - at.y) / 4) : at.y > bottom - EDGE ? Math.ceil((at.y - bottom + EDGE) / 4) : 0;
    if (dy) {
      if (box) box.scrollTop += dy;
      else scrollBy(0, dy);
      retarget();
    }
    frame = requestAnimationFrame(scroll);
  };
  const retarget = () => {
    const d = p.app.drag;
    if (d) d.target = targetAt(at.x, at.y, p);
  };
  const move = (e: PointerEvent) => {
    if (!start) return;
    at = { x: e.clientX, y: e.clientY };
    if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
    if (!dragging) {
      dragging = true;
      p.app.drag = { kind: p.kind, id: p.id, target: null };
      document.body.style.cursor = "grabbing";
      frame = requestAnimationFrame(scroll);
    }
    e.preventDefault();
    retarget();
  };
  const end = (e: PointerEvent | null) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key);
    cancelAnimationFrame(frame);
    document.body.style.cursor = "";
    const d = p.app.drag;
    if (dragging) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      if (e && d?.target) p.onDrop(d.target);
    }
    p.app.drag = null;
    start = null;
    dragging = false;
  };
  const up = (e: PointerEvent) => end(e);
  const cancel = () => end(null);
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") end(null); };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || (e.pointerType !== "mouse" && e.pointerType !== "touch" && e.pointerType !== "pen")) return;
    start = { x: e.clientX, y: e.clientY };
    at = { ...start };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
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
      if (start) end(null);
    },
  };
}
