<!-- Desktop left rail (D-02): pages, each with a grip that drags it into order or, tapped, shows move buttons (D-15,
     ADR-0031); Add page; then Theme, Values (ADR-0029) and History. -->
<script lang="ts">
  import { GALLERY, addPage, isGalleryTheme, movePage, movePageTo, plural, widgetCount } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import { gripDrag } from "../client/drag.ts";
  import Icon from "./Icon.svelte";
  let { app }: { app: App } = $props();

  const pages = $derived(app.draft?.pages ?? []);
  let movesFor = $state<string | null>(null);
  const verMeta = $derived(app.liveVersion !== null ? `Live: version ${app.liveVersion}` : "No versions yet");
  const themeMeta = $derived(GALLERY.find((t) => isGalleryTheme(app.draft?.theme, t))?.name ?? "Your own colours");

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
    <div class="navrow" class:on class:dragging={app.drag?.kind === "page" && app.drag.id === p._id}
      class:dropbefore={app.drag?.kind === "page" && app.drag.target?.list === "p" && app.drag.target.index === i && app.drag.id !== p._id}
      data-drop-for="page" data-drop-list="p" data-drop-index={i}>
      <button type="button" class="grip" aria-label={`Move page ${p.name || "Untitled page"}`} title="Drag to move, or tap for move buttons"
        use:gripDrag={{ app, kind: "page", id: p._id, accept: (k) => k === "p", onDrop: (t) => app.mutate((d) => movePageTo(d, p._id, t.index)) }}
        aria-expanded={movesFor === p._id} onclick={() => (movesFor = movesFor === p._id ? null : p._id)}><Icon name="grip" size={16} /></button>
      <button type="button" class="navbtn" aria-current={on ? "page" : undefined} onclick={() => { app.pageId = p._id; app.screen = "pages"; }}>
        <span class="navname">{p.name || "Untitled page"}</span>
        <span class="navmeta">{plural(widgetCount(p), "widget")} · {p.columns.length} col</span>
      </button>
    </div>
    {#if movesFor === p._id}
      <div class="row" role="group" aria-label={`Move page ${p.name || "Untitled page"}`} style="padding-left: 44px">
        <button type="button" class="ib sm" aria-label="Move page up" disabled={i === 0} onclick={() => app.mutate((d) => movePage(d, p._id, -1))}><Icon name="up" /></button>
        <button type="button" class="ib sm" aria-label="Move page down" disabled={i === pages.length - 1} onclick={() => app.mutate((d) => movePage(d, p._id, 1))}><Icon name="down" /></button>
      </div>
    {/if}
  {/each}
  {#if app.drag?.kind === "page"}
    <div class="dropzone show" class:on={app.drag.target?.list === "p" && app.drag.target.index === pages.length}
      data-drop-for="page" data-drop-list="p" data-drop-end={pages.length} aria-hidden="true"></div>
  {/if}
  <button type="button" class="btn ghost" style="justify-content: flex-start; color: var(--ink-muted)" onclick={add}><Icon name="plus" />Add page</button>
  <div class="rule" style="margin-top: 16px"><span class="lbl">Site</span></div>
  <button type="button" class="navbtn" class:on={app.screen === "theme"} aria-current={app.screen === "theme" ? "page" : undefined} onclick={() => (app.screen = "theme")}>
    Theme<span class="navmeta">{themeMeta}</span>
  </button>
  <button type="button" class="navbtn" class:on={app.screen === "values"} aria-current={app.screen === "values" ? "page" : undefined} onclick={() => (app.screen = "values")}>
    Values<span class="navmeta">{"${NAME}"} values in .env</span>
  </button>
  <button type="button" class="navbtn" class:on={app.screen === "history"} aria-current={app.screen === "history" ? "page" : undefined} onclick={() => (app.screen = "history")}>
    History<span class="navmeta">{verMeta}</span>
  </button>
</nav>
