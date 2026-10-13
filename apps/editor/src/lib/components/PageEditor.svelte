<!-- Page editor (IA "Page editor", flow 2 "Edit a page layout"): name, slug, width, toggles, then the layout schematic
     (D-03). Column rules are enforced by disabling, each with its reason (D-07 to D-10). Widget cards are shown here;
     moving, adding and editing widgets come with the inspector in Phase 6. -->
<script lang="ts">
  import { tick } from "svelte";
  import { WIDGETS, pageSlug, type PageT, type WidgetT } from "@glance-editor/model";
  import {
    addColumn, addColumnState, addPage, deletePageState, moveColumn, movePage, plural, removeColumn, removeColumnState,
    setSize, setWidth, sizeOptions, widgetName, widgetSummary, widthOptions, type Width,
  } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  import Seg from "./Seg.svelte";
  import Toggle from "./Toggle.svelte";

  let { app, page }: { app: App; page: PageT } = $props();

  const pi = $derived(app.draft!.pages.findIndex((p) => p._id === page._id));
  const n = $derived(page.columns.length);
  const width = $derived((page.width ?? "default") as Width);
  const widths = $derived(widthOptions(page));
  const addCol = $derived(addColumnState(page));
  const delPage = $derived(deletePageState(app.draft!));
  const frameMax = $derived(width === "slim" ? "860px" : width === "wide" ? "100%" : "1120px");
  const colTemplate = $derived(page.columns.map((c) => (c.size === "small" ? "minmax(200px, 260px)" : "minmax(0, 1fr)")).join(" "));
  let moveOpen = $state<number | null>(null);

  // Problems on this page (D-28): field highlights, and Fix badges on the cards involved.
  const hl = $derived(app.highlight?.pageId === page._id ? app.highlight : null);
  const pageErrors = $derived(app.showErrors ? app.errors.filter((p) => p.location.pageId === page._id) : []);
  const badIds = $derived(new Set(pageErrors.flatMap((p) => p.location.widgetIds ?? [])));
  const nameBad = $derived(page.name === "" || pageErrors.some((p) => p.location.field === "name" && !p.location.widgetIds));
  const slugBad = $derived(pageErrors.some((p) => p.location.field === "slug" && !p.location.widgetIds));

  const edit = (fn: (p: PageT) => void) => app.mutate((d) => fn(d.pages.find((p) => p._id === page._id)!));
  const typeLabel = (w: WidgetT) => WIDGETS[w.type]?.label ?? w.type;

  let nameInput = $state<HTMLInputElement>();
  let slugInput = $state<HTMLInputElement>();
  let colEls = $state<HTMLElement[]>([]);
  let cardEls = $state<Record<string, HTMLElement>>({});
  // Go to: bring the highlighted field, column or card into view and focus it.
  $effect(() => {
    const h = hl;
    if (!h) return;
    void tick().then(() => {
      const target = h.field === "name" && !h.widgetIds ? nameInput : h.field === "slug" && !h.widgetIds ? slugInput
        : h.widgetIds?.length ? cardEls[h.widgetIds[0]!] : typeof h.column === "number" ? colEls[h.column] : undefined;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target instanceof HTMLInputElement) target.focus();
    });
  });

  function removeCol(ci: number) {
    let r = { movedTo: 0, count: 0 };
    // D-09 and D-17: the widgets move to the neighbour; immediate, with Undo.
    app.mutate((d) => (r = removeColumn(d, page._id, ci)), {
      undo: true,
      toast: () => (r.count ? `Column removed. Its ${plural(r.count, "widget")} moved to column ${r.movedTo + 1}.` : "Column removed"),
    });
    moveOpen = null;
  }
</script>

<section class="pagehead" aria-label="Page settings">
  <div class="row wrap" style="align-items: flex-end; gap: 16px">
    <div class="grow field" class:hl={hl?.field === "name" && !hl.widgetIds} style="flex: 1 1 260px; margin: 0; padding: 0">
      <label class="flabel" for="pname">Page name <span class="req">Required</span></label>
      <input id="pname" class="input big" bind:this={nameInput} value={page.name} aria-invalid={nameBad}
        aria-describedby={page.name === "" ? "pname-err" : undefined}
        oninput={(e) => edit((p) => (p.name = (e.currentTarget as HTMLInputElement).value))} />
      {#if page.name === ""}<p class="errtxt" id="pname-err">Glance needs a page name.</p>{/if}
    </div>
    <div class="field" class:hl={hl?.field === "slug" && !hl.widgetIds} style="flex: 0 1 220px; min-width: 160px; margin: 0; padding: 0">
      <label class="flabel" for="pslug">Slug</label>
      <input id="pslug" class="input mono" bind:this={slugInput} value={page.slug ?? ""} aria-invalid={slugBad}
        placeholder={`${pageSlug({ name: page.name }) || "page"} (from name)`}
        oninput={(e) => edit((p) => { const v = (e.currentTarget as HTMLInputElement).value; if (v === "") delete p.slug; else p.slug = v; })} />
    </div>
  </div>
  <div class="row wrap" style="gap: 12px 24px; align-items: flex-start">
    <div>
      <span class="flabel" id="lwidth">Width</span>
      <Seg label="Page width" options={widths} value={width} onpick={(w) => app.mutate((d) => setWidth(d, page._id, w))} />
      {#if widths.some((o) => o.disabled)}<p class="help">{widths.find((o) => o.disabled)!.why}</p>{/if}
    </div>
    <Toggle id="lcv" label="Center vertically" on={page["center-vertically"] === true}
      ontoggle={() => edit((p) => { if (p["center-vertically"] === true) delete p["center-vertically"]; else p["center-vertically"] = true; })} />
    <Toggle id="lhn" label="Hide desktop navigation" on={page["hide-desktop-navigation"] === true}
      ontoggle={() => edit((p) => { if (p["hide-desktop-navigation"] === true) delete p["hide-desktop-navigation"]; else p["hide-desktop-navigation"] = true; })} />
    <span class="spacer"></span>
    <div class="row wrap">
      <button type="button" class="btn phone-only" disabled={pi === 0} onclick={() => app.mutate((d) => movePage(d, page._id, -1))}>Move up</button>
      <button type="button" class="btn phone-only" disabled={pi === app.draft!.pages.length - 1} onclick={() => app.mutate((d) => movePage(d, page._id, 1))}>Move down</button>
      <button type="button" class="btn phone-only" onclick={() => { let id = ""; app.mutate((d) => (id = addPage(d))); app.pageId = id; }}>Add page</button>
      <button type="button" class="btn warn" disabled={delPage.disabled} aria-describedby={delPage.disabled ? "delwhy" : undefined}
        onclick={() => (app.sheet = { kind: "deletePage", pageId: page._id })}>Delete page</button>
    </div>
  </div>
  {#if delPage.disabled}<p class="help" id="delwhy" style="margin: 0; text-align: right">{delPage.why}</p>{/if}
</section>

<div class="rules" aria-label="Layout rules"><span>Up to 3 columns</span><span>1–2 full</span><span>Small = 300 px</span><span>Slim width: max 2 columns</span></div>

<div class="frame" style:max-width={frameMax}>
  <span class="frametag">{widths.find((o) => o.value === width)!.label} width · {plural(n, "column")} · schematic, not to scale</span>
  <section class="head" aria-label="Head widgets">
    <span class="lbl">Head widgets · span all columns</span>
    {#if !(page["head-widgets"] ?? []).length}
      <p class="help" style="margin: 0">None. Head widgets sit above the columns, full width.</p>
    {:else}
      <div class="headlist">
        {#each page["head-widgets"] ?? [] as w (w._id)}
          <div class="wcard" class:hl={badIds.has(w._id)} bind:this={cardEls[w._id]}>
            <span class="row between"><span class="tlabel">{typeLabel(w)}</span>{#if badIds.has(w._id)}<span class="errdot">Fix</span>{/if}</span>
            <span class="wname">{widgetName(w, typeLabel(w))}</span><span class="wsum">{widgetSummary(w)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <div class="cols" style:grid-template-columns={colTemplate}>
    {#each page.columns as c, ci (c._id)}
      {@const sizes = sizeOptions(page, ci)}
      {@const rm = removeColumnState(page, ci)}
      <section class="col" class:hl={hl?.column === ci && !hl.widgetIds} aria-label={`Column ${ci + 1}`} bind:this={colEls[ci]}>
        <div class="colhead">
          <button type="button" class="grip" aria-label={`Move column ${ci + 1}`} aria-expanded={moveOpen === ci} title="Tap for move buttons"
            onclick={() => (moveOpen = moveOpen === ci ? null : ci)}><Icon name="grip" size={16} /></button>
          <span class="lbl">Column {ci + 1}</span>
          <span class="spacer"></span>
          <button type="button" class="ib sm" aria-label={`Remove column ${ci + 1}`} title={rm.disabled ? rm.why : "Remove column"} disabled={rm.disabled}
            aria-describedby={rm.disabled ? `rmwhy-${ci}` : undefined} onclick={() => removeCol(ci)}><Icon name="close" /></button>
        </div>
        {#if rm.disabled}<span class="sr" id={`rmwhy-${ci}`}>{rm.why}</span>{/if}
        {#if moveOpen === ci}
          <div class="row wrap">
            <button type="button" class="btn" disabled={ci === 0} onclick={() => { app.mutate((d) => moveColumn(d, page._id, ci, -1)); moveOpen = ci - 1; }}>
              <span class="desk-only">Move left</span><span class="phone-only">Move up</span></button>
            <button type="button" class="btn" disabled={ci === n - 1} onclick={() => { app.mutate((d) => moveColumn(d, page._id, ci, 1)); moveOpen = ci + 1; }}>
              <span class="desk-only">Move right</span><span class="phone-only">Move down</span></button>
          </div>
        {/if}
        <Seg label={`Column ${ci + 1} size`} options={sizes} value={c.size} onpick={(s) => app.mutate((d) => setSize(d, page._id, ci, s))} />
        {#if sizes.some((o) => o.disabled)}<p class="help" style="margin: 0">{sizes.filter((o) => o.disabled).map((o) => o.why).join(" ")}</p>{/if}
        <div class="stack">
          {#each c.widgets as w (w._id)}
            <div class="wcard" class:hl={badIds.has(w._id)} bind:this={cardEls[w._id]}>
              <span class="row between"><span class="tlabel">{typeLabel(w)}</span>{#if badIds.has(w._id)}<span class="errdot">Fix</span>{/if}</span>
              <span class="wname">{widgetName(w, typeLabel(w))}</span>
              {#if widgetSummary(w)}<span class="wsum">{widgetSummary(w)}</span>{/if}
            </div>
          {/each}
          {#if !c.widgets.length}<div class="empty">No widgets in this column yet.</div>{/if}
        </div>
      </section>
    {/each}
  </div>
  <div class="row wrap">
    <button type="button" class="btn" disabled={addCol.disabled} onclick={() => app.mutate((d) => addColumn(d, page._id))}><Icon name="plus" />Add column</button>
    {#if addCol.disabled}<span class="help" style="margin: 0">{addCol.why}</span>{/if}
  </div>
</div>
