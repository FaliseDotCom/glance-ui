<!-- A widget card on the layout (design: .wcard). The grip (D-15) drags on desktop with a mouse, and is a button that opens
     move buttons (keyboard, phone). The card opens the inspector (D-04). Actions show on the selected card (D-16) or
     after tapping the grip. -->
<script lang="ts">
  import { tick } from "svelte";
  import { WIDGETS, type DashboardT, type WidgetT } from "@glance-editor/model";
  import {
    canMove, canMoveColumn, moveWidget, moveWidgetColumn, moveWidgetTo, typeLabel, widgetName, widgetSummary, type WidgetRef,
  } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import { gripDrag } from "../client/drag.ts";
  import Icon from "./Icon.svelte";

  let { app, w, ref, index, bad, bindEl }: { app: App; w: WidgetT; ref: WidgetRef; index: number; bad: boolean; bindEl?: (el: HTMLElement) => void } = $props();

  // The move buttons stay open on this widget while it moves between columns (the card is re-created there).
  const movesOpen = $derived(app.movesFor === w._id);
  const d = $derived(app.draft!);
  const sel = $derived(app.sel?.pageId === ref.pageId && app.sel.ids.length === 1 && app.sel.ids[0] === w._id);
  const head = $derived(ref.column === "head");
  const label = $derived(WIDGETS[w.type]?.label ?? w.type);
  const name = $derived(widgetName(w, typeLabel(w.type)));
  const dragging = $derived(app.drag?.kind === "widget" && app.drag.id === w._id);
  const dropBefore = $derived(app.drag?.kind === "widget" && app.drag.target?.column === ref.column && app.drag.target.index === index && !dragging);
  const showActions = $derived(sel || movesOpen);
  const summary = $derived(w._yaml ? "Edited as YAML" : widgetSummary(w));

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
</script>

<div class="wcard" class:sel class:hl={bad} class:dropbefore={dropBefore} class:dragging bind:this={el}
  data-drop="w" data-col={String(ref.column)} data-index={index} data-wid={w._id}>
  <div class="wrow">
    <button type="button" class="grip" aria-label={`Move ${name}`} aria-expanded={showActions} title="Drag to move, or tap for move buttons"
      use:gripDrag={{ app, kind: "widget", id: w._id, column: ref.column, onDrop: (t) => typeof t === "object" && move((x) => moveWidgetTo(x, ref, t.column, t.index)) }}
      onclick={() => (app.movesFor = movesOpen ? null : w._id)}><Icon name="grip" size={16} /></button>
    <button type="button" class="wmain" aria-label={`${name}, ${label}. Open settings`} onclick={() => app.select(ref)}>
      <span class="row between"><span class="tlabel">{label}</span>{#if bad}<span class="errdot">Fix</span>{/if}</span>
      <span class="wname">{name}</span>
      {#if summary}<span class="wsum">{summary}</span>{/if}
    </button>
  </div>
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
      <span class="spacer"></span>
      <button type="button" class="ib" aria-label={`Delete ${name}`} onclick={() => app.deleteWidgetAt(ref)}><Icon name="trash" /></button>
    </div>
  {/if}
</div>
