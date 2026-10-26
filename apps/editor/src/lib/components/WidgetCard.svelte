<!-- A widget card on the layout (design: .wcard). The grip (D-15, ADR-0031) drags with a mouse or a finger, and is a
     button that opens move buttons (keyboard, a tap). A dragged widget lands before or after a card, at the end of a
     list, or into a Group or Split column through the "Into" strip its card shows while a widget is dragged. A Bookmarks
     card takes a link or group dropped on it. Move to… lists every place a widget can go. The card opens the inspector
     (D-04). Actions show on the selected card (D-16) or after tapping the grip. -->
<script lang="ts">
  import { tick } from "svelte";
  import { WIDGETS, type DashboardT, type WidgetT } from "@glance-editor/model";
  import {
    canMove, canMoveColumn, cantMoveInto, findWidget, moveWidget, moveWidgetColumn, moveWidgetToList, parentOf, typeLabel,
    widgetDestinations, widgetName, widgetSummary, type ListRef, type WidgetRef,
  } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import { gripDrag, listKey, parseListKey, widgetKey } from "../client/drag.ts";
  import Icon from "./Icon.svelte";

  let { app, w, ref, index, bad, bindEl }: { app: App; w: WidgetT; ref: WidgetRef; index: number; bad: boolean; bindEl?: (el: HTMLElement) => void } = $props();

  // The move buttons stay open on this widget while it moves between columns (the card is re-created there).
  const movesOpen = $derived(app.movesFor === w._id);
  const d = $derived(app.draft!);
  const sel = $derived(app.sel?.pageId === ref.pageId && app.sel.ids.length === 1 && app.sel.ids[0] === w._id);
  const head = $derived(ref.column === "head");
  const label = $derived(WIDGETS[w.type]?.label ?? w.type);
  const name = $derived(widgetName(w, typeLabel(w.type)));
  const list = $derived(listKey(parentOf(ref)));
  const drag = $derived(app.drag);
  const dragging = $derived(drag?.kind === "widget" && drag.id === w._id);
  const dropBefore = $derived(drag?.kind === "widget" && drag.target?.list === list && drag.target.index === index && !dragging);
  const showActions = $derived(sel || movesOpen);
  const summary = $derived(w._yaml ? "Edited as YAML" : widgetSummary(w));
  // A Group or Split column: while another widget is dragged, a strip to drop it into this one (when it may go there).
  const into = $derived<ListRef>({ pageId: ref.pageId, column: ref.column, parentIds: ref.ids });
  const intoKey = $derived(listKey(into));
  const kids = $derived(((w as WidgetT & { widgets?: WidgetT[] }).widgets ?? []).length);
  const draggedRef = $derived(drag?.kind === "widget" && drag.id !== w._id ? findWidget(d, drag.id) : undefined);
  const canInto = $derived(!!WIDGETS[w.type]?.container && !!draggedRef && !cantMoveInto(d, draggedRef, into));
  // A Bookmarks widget: a link or a group dropped on its card goes into it.
  const bmKey = $derived(`b|${widgetKey(ref)}`);
  const bmOn = $derived((drag?.kind === "link" || drag?.kind === "group") && drag.target?.list === bmKey);

  let el = $state<HTMLElement>();
  $effect(() => { if (el) bindEl?.(el); });

  /** Move, then keep the keyboard where it was: the same button on this card, wherever the card now is. */
  async function move(fn: (d: DashboardT) => void, button?: string) {
    app.mutate(fn);
    if (!button) return;
    await tick();
    const card = document.querySelector<HTMLElement>(`[data-wid="${CSS.escape(w._id)}"]`);
    const same = card?.querySelector<HTMLButtonElement>(`[aria-label="${button}"]`);
    // At an edge the same button is disabled now: the card's grip keeps the keyboard on the card.
    (same && !same.disabled ? same : card?.querySelector<HTMLElement>(".grip"))?.focus();
  }
  /** Anywhere: a drop or Move to…; the inspector follows the widget if it was open on it. */
  function moveTo(to: ListRef, at: number, toast?: string) {
    const was = sel;
    let r = ref;
    app.mutate((x) => (r = moveWidgetToList(x, ref, to, at)), toast ? { toast, undo: true } : {});
    if (was) app.sel = r;
    if (r.pageId !== ref.pageId) app.movesFor = null;
  }
  function moveToSheet() {
    app.sheet = {
      kind: "moveTo", what: name,
      options: widgetDestinations(d, ref).map((x) => ({ label: x.label, go: () => moveTo(x.to, Number.MAX_SAFE_INTEGER, `Moved ${name} to ${x.label}`) })),
    };
  }
</script>

<div class="wcard" class:sel class:hl={bad} class:dropbefore={dropBefore} class:x={head} class:dragging class:droptarget={bmOn} bind:this={el}
  data-drop-for="widget" data-drop-list={list} data-drop-index={index} data-drop-axis={head ? "x" : undefined} data-wid={w._id}>
  <div class="wrow">
    <button type="button" class="grip" aria-label={`Move ${name}`} aria-expanded={showActions} title="Drag to move, or tap for move buttons"
      use:gripDrag={{ app, kind: "widget", id: w._id,
        accept: (k) => { const l = parseListKey(k); return !!l && !cantMoveInto(app.draft!, ref, l); },
        onDrop: (t) => { const l = parseListKey(t.list); if (l) moveTo(l, t.index); } }}
      onclick={() => (app.movesFor = movesOpen ? null : w._id)}><Icon name="grip" size={16} /></button>
    <button type="button" class="wmain" aria-label={`${name}, ${label}. Open settings`} onclick={() => app.select(ref)}
      data-drop-for={w.type === "bookmarks" ? "link group" : undefined} data-drop-list={w.type === "bookmarks" ? bmKey : undefined} data-drop-at={w.type === "bookmarks" ? 0 : undefined}>
      <span class="row between"><span class="tlabel">{label}</span>{#if bad}<span class="errdot">Fix</span>{/if}</span>
      <span class="wname">{name}</span>
      {#if summary}<span class="wsum">{summary}</span>{/if}
    </button>
  </div>
  {#if canInto}
    <div class="intostrip" class:on={drag?.target?.list === intoKey} data-drop-for="widget" data-drop-list={intoKey} data-drop-end={kids} aria-hidden="true">Into {name}</div>
  {/if}
  {#if showActions}
    <div class="wact" role="group" aria-label={`Move or delete ${name}`}>
      {#if head}
        <button type="button" class="ib" aria-label="Move left" disabled={!canMove(d, ref, -1)} onclick={() => move((x) => moveWidget(x, ref, -1), "Move left")}><Icon name="left" /></button>
        <button type="button" class="ib" aria-label="Move right" disabled={!canMove(d, ref, 1)} onclick={() => move((x) => moveWidget(x, ref, 1), "Move right")}><Icon name="right" /></button>
      {:else}
        <button type="button" class="ib" aria-label="Move up" disabled={!canMove(d, ref, -1)} onclick={() => move((x) => moveWidget(x, ref, -1), "Move up")}><Icon name="up" /></button>
        <button type="button" class="ib" aria-label="Move down" disabled={!canMove(d, ref, 1)} onclick={() => move((x) => moveWidget(x, ref, 1), "Move down")}><Icon name="down" /></button>
        <button type="button" class="ib" aria-label="Move to previous column" disabled={!canMoveColumn(d, ref, -1)}
          onclick={() => { const was = sel; let r = ref; void move((x) => (r = moveWidgetColumn(x, ref, -1)), "Move to previous column"); if (was) app.sel = r; }}><Icon name="left" /></button>
        <button type="button" class="ib" aria-label="Move to next column" disabled={!canMoveColumn(d, ref, 1)}
          onclick={() => { const was = sel; let r = ref; void move((x) => (r = moveWidgetColumn(x, ref, 1)), "Move to next column"); if (was) app.sel = r; }}><Icon name="right" /></button>
      {/if}
      <button type="button" class="btn ghost" style="padding: 0 10px" onclick={moveToSheet}>Move to…</button>
      <span class="spacer"></span>
      <button type="button" class="ib" aria-label={`Delete ${name}`} onclick={() => app.deleteWidgetAt(ref)}><Icon name="trash" /></button>
    </div>
  {/if}
</div>
