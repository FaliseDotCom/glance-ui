<!-- Desktop left rail (D-02): pages with reorder arrows on the active one, Add page, then History.
     Theme joins the rail in Phase 6. -->
<script lang="ts">
  import { addPage, movePage, plural, widgetCount } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  let { app }: { app: App } = $props();

  const pages = $derived(app.draft?.pages ?? []);
  const verMeta = $derived(app.liveVersion !== null ? `Live: version ${app.liveVersion}` : "No versions yet");

  function add() {
    let id = "";
    app.mutate((d) => (id = addPage(d)));
    app.pageId = id;
    app.screen = "pages";
  }
</script>

<nav class="rail" aria-label="Editor">
  <div class="rule"><span class="lbl">Pages</span></div>
  {#each pages as p, i (p._id)}
    {@const on = app.screen === "pages" && app.page?._id === p._id}
    <div class="navrow" class:on>
      <button type="button" class="navbtn" aria-current={on ? "page" : undefined} onclick={() => { app.pageId = p._id; app.screen = "pages"; }}>
        <span class="navname">{p.name || "Untitled page"}</span>
        <span class="navmeta">{plural(widgetCount(p), "widget")} · {p.columns.length} col</span>
      </button>
      {#if on}
        <button type="button" class="ib sm" aria-label="Move page up" disabled={i === 0} onclick={() => app.mutate((d) => movePage(d, p._id, -1))}><Icon name="up" /></button>
        <button type="button" class="ib sm" aria-label="Move page down" disabled={i === pages.length - 1} onclick={() => app.mutate((d) => movePage(d, p._id, 1))}><Icon name="down" /></button>
      {/if}
    </div>
  {/each}
  <button type="button" class="btn ghost" style="justify-content: flex-start; color: var(--ink-muted)" onclick={add}><Icon name="plus" />Add page</button>
  <div class="rule" style="margin-top: 16px"><span class="lbl">Site</span></div>
  <button type="button" class="navbtn" class:on={app.screen === "history"} aria-current={app.screen === "history" ? "page" : undefined} onclick={() => (app.screen = "history")}>
    History<span class="navmeta">{verMeta}</span>
  </button>
</nav>
