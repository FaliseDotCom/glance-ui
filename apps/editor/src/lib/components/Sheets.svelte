<!-- Dialogs (design §4 and 03): Review → Checking → Problems or Saved; the outside-change choice (D-32); Discard (D-33);
     Delete page (D-17); Add widget (D-18). Centred modal on desktop, bottom sheet on a phone. -->
<script lang="ts">
  import { tick } from "svelte";
  import { WIDGETS, type DashboardT, type WidgetT } from "@glance-editor/model";
  import { THEME_LABELS, addOptions, changeText, fieldPathLabel, listLabel, plural, widgetAt, widgetCount, widgetName } from "@glance-editor/editing";
  import type { Problem } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  let { app }: { app: App } = $props();

  const sheet = $derived(app.sheet);
  const titles: Record<string, string> = {
    review: "Review and save", checking: "Checking", problems: "Problems", saved: "Saved", conflict: "Changed outside the editor",
    loadFile: "Load the file", error: "Not saved", discard: "Discard changes", deletePage: "Delete page", add: "Add widget",
  };
  const close = () => (app.sheet = null);

  // Warnings shown on Review (ADR-0018 and other "Glance accepts it, but…" rules). Unknown or kept-as-is keys were
  // reported at import and aren't repeated on every save.
  const warnings = $derived(app.problems.filter((p) => p.severity === "warning" && !p.code.startsWith("key.")));
  const changeLines = $derived([...(app.restored ? [`Restored version ${app.baseVersion} as the draft`] : []), ...app.changes.map(changeText)]);

  function where(p: Problem, d: DashboardT | null): string {
    const loc = p.location;
    const page = d?.pages.find((x) => x._id === loc.pageId);
    if (!page && loc.field?.startsWith("theme")) return "Theme";
    if (!page) return loc.field ? `Settings › ${loc.field}` : "Whole config";
    const parts = [page.name || "Untitled page"];
    if (loc.column === "head") parts.push("Head widgets");
    else if (typeof loc.column === "number") parts.push(`Column ${loc.column + 1}`);
    let list: WidgetT[] | undefined = loc.column === "head" ? page["head-widgets"] : typeof loc.column === "number" ? page.columns[loc.column]?.widgets : undefined;
    for (const id of loc.widgetIds ?? []) {
      const w = list?.find((x) => x._id === id);
      if (!w) break;
      parts.push(widgetName(w, WIDGETS[w.type]?.label ?? w.type));
      list = (w as { widgets?: WidgetT[] }).widgets;
    }
    return parts.join(" › ");
  }

  function fieldLabel(p: Problem, d: DashboardT | null): string {
    const f = p.location.field;
    if (!f) return p.source === "glance" ? "Glance's message" : "Layout";
    if (f.startsWith("theme.")) return THEME_LABELS[f.slice(6) as keyof typeof THEME_LABELS] ?? f.slice(6);
    if (!p.location.widgetIds?.length || !d || !p.location.pageId || p.location.column === undefined) return f === "name" ? "Page name" : f === "slug" ? "Slug" : f;
    const w = widgetAt(d, { pageId: p.location.pageId, column: p.location.column, ids: p.location.widgetIds });
    return w ? fieldPathLabel(w.type, p.location.path ?? [f]) : f;
  }

  // Add widget (D-18): a searchable list; types not allowed in the target are disabled with the reason.
  let addQuery = $state("");
  let addInput = $state<HTMLInputElement>();
  const addTarget = $derived(sheet?.kind === "add" ? sheet.target : null);
  const addParentType = $derived(addTarget && addTarget.parentIds.length && app.draft ? widgetAt(app.draft, { ...addTarget, ids: addTarget.parentIds })?.type ?? null : null);
  const addList = $derived(addTarget ? addOptions(addParentType, addQuery) : []);
  $effect(() => {
    if (!addTarget) return;
    addQuery = "";
    void tick().then(() => addInput?.focus());
  });

  const savedText = (reload: string) =>
    reload === "reloaded"
      ? "glance.yml is written and Glance reloaded. Its cached data was cleared, so widgets fetch fresh data on the next page load."
      : reload === "not-confirmed"
        ? "glance.yml is written, but Glance didn't pick it up within 10 seconds, so the reload is not confirmed. Glance keeps its old config if it can't load the new one."
        : app.glance === "not-configured"
          ? "glance.yml is written. The editor isn't set up to reach Glance (GLANCE_URL), so it can't confirm the reload."
          : "glance.yml is written, but Glance did not respond, so the reload is not confirmed.";
  const delPage = $derived(sheet?.kind === "deletePage" ? app.draft?.pages.find((p) => p._id === sheet.pageId) : undefined);

  let dialog = $state<HTMLElement>();
  let opener: HTMLElement | null = null;
  // Keyboard (design §7): focus moves into the dialog, Tab stays inside it, Escape closes it (not while checking),
  // and focus returns to what opened it.
  $effect(() => {
    if (!sheet) return;
    if (!dialog?.contains(document.activeElement)) {
      opener ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog?.focus();
    }
  });
  $effect(() => {
    if (sheet) return;
    const o = opener;
    opener = null;
    if (o?.isConnected) o.focus();
  });
  const focusable = () =>
    [...(dialog?.querySelectorAll<HTMLElement>("button:not([disabled]), input, textarea, select, [href]") ?? [])].filter((el) => el.offsetParent !== null);
  const onkey = (e: KeyboardEvent) => {
    if (!sheet) return;
    if (e.key === "Escape" && sheet.kind !== "checking") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const els = focusable();
      if (!els.length) return e.preventDefault();
      const first = els[0]!, last = els[els.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
</script>

<svelte:window onkeydown={onkey} />

{#if sheet}
  <div class="scrim">
    <div class="sheet" role="dialog" aria-modal="true" aria-label={titles[sheet.kind]} tabindex="-1" bind:this={dialog}>
      {#if sheet.kind === "add" && app.draft}
        <div class="row between" style="align-items: flex-start">
          <div><span class="lbl">{listLabel(app.draft, sheet.target)}</span><h2 class="h2">{addParentType === "group" ? "Add tab" : "Add widget"}</h2></div>
          <button type="button" class="ib" aria-label="Close" onclick={close}><Icon name="close" size={20} /></button>
        </div>
        <label class="sr" for="addq">Search widget types</label>
        <input id="addq" class="input" placeholder="Search widget types" bind:value={addQuery} bind:this={addInput} autocomplete="off" />
        <div class="tlist" role="list" aria-label="Widget types">
          {#each addList as t (t.type)}
            <div role="listitem">
              <button type="button" class="trow" disabled={t.disabled} onclick={() => app.addWidgetTo(sheet.target, t.type)}>
                <span><span class="wname">{t.label}</span>{#if t.why}<span class="wsum" style="white-space: normal">{t.why}</span>{/if}</span>
                <span class="tlabel">{t.category}</span>
              </button>
            </div>
          {/each}
          {#if !addList.length}<div class="empty">No widget type matches.</div>{/if}
        </div>
      {:else if sheet.kind === "review"}
        <span class="lbl">Save</span>
        <h2 class="h2">Save {plural(Math.max(changeLines.length, 1), "change")} to Glance</h2>
        <ul class="checks">{#each changeLines as t, i (i)}<li><span class="mono grow" style="white-space: normal">{t}</span></li>{/each}</ul>
        {#if warnings.length}
          <span class="flabel" style="margin: 0">{plural(warnings.length, "thing")} to check (saving still works)</span>
          <div class="stack" style="gap: 8px">
            {#each warnings as w, i (i)}
              <div class="erow warning"><span class="grow"><span class="mono" style="font-size: 12px; color: var(--ink-quiet)">{where(w, app.draft)}</span><span class="note">{w.message}</span></span></div>
            {/each}
          </div>
        {/if}
        <div class="notice">Saving writes glance.yml. Glance reloads on its own and clears its cached data, so widgets fetch fresh data on the next page load.</div>
        <p class="help">Before writing, the draft is checked twice: against the editor's schema, then with Glance's own config:validate.</p>
        <div class="sheetfoot">
          <button type="button" class="btn warn phone-only" onclick={() => (app.sheet = { kind: "discard" })}>Discard</button>
          <button type="button" class="btn ghost" onclick={close}>Keep editing</button>
          <button type="button" class="btn pri" onclick={() => app.save()}>Check and save</button>
        </div>
      {:else if sheet.kind === "checking"}
        <span class="lbl">Save</span><h2 class="h2 pulse">Checking the draft</h2>
        <p class="help">glance.yml is written only if both checks pass.</p>
      {:else if sheet.kind === "problems"}
        <span class="lbl">Not saved</span>
        <h2 class="h2">{plural(app.errors.length, "problem")} found</h2>
        <p class="note">glance.yml is unchanged and Glance keeps running the live version. Fix these, then save again.</p>
        <div class="stack" style="gap: 8px">
          {#each app.errors as e, i (i)}
            <div class="erow">
              <span style="color: var(--warn); flex: none; margin-top: 2px"><Icon name="alert" size={20} /></span>
              <span class="grow">
                <span class="mono" style="font-size: 12px; color: var(--ink-quiet)">{e.source === "glance" ? "Glance config:validate" : "Editor check"} · {where(e, app.draft)}</span>
                <span style="font-weight: 700; color: var(--ink)">{fieldLabel(e, app.draft)}</span>
                <span class={e.source === "glance" ? "glance" : "note"}>{e.message}</span>
              </span>
              {#if e.location.pageId || e.location.field?.startsWith("theme")}<button type="button" class="btn" onclick={() => app.goTo(e)}>Go to</button>{/if}
            </div>
          {/each}
          {#if app.errors.length === 0}<p class="note">All fixed. Save again to write glance.yml.</p>{/if}
        </div>
        <div class="sheetfoot"><button type="button" class="btn ghost" onclick={close}>Close</button></div>
      {:else if sheet.kind === "saved"}
        <span class="lbl">Saved</span>
        <h2 class="h2">Version {sheet.version} is {sheet.reload === "reloaded" ? "live" : "written"}</h2>
        <p class="note">{savedText(sheet.reload)}</p>
        {#each sheet.warnings as w, i (i)}<p class="help" style="margin: 0">{w}</p>{/each}
        <div class="sheetfoot">
          <button type="button" class="btn ghost" onclick={() => { close(); app.screen = "history"; }}>View history</button>
          <button type="button" class="btn pri" onclick={close}>Done</button>
        </div>
      {:else if sheet.kind === "conflict"}
        <span class="lbl">Not saved yet</span>
        <h2 class="h2">glance.yml changed outside the editor</h2>
        <p class="note">The file changed after your draft began. That version is stored in History as version {sheet.outsideVersion}, so nothing is lost either way.</p>
        <div class="sheetfoot">
          <button type="button" class="btn ghost" onclick={() => (app.sheet = { kind: "loadFile" })}>Load the file</button>
          <button type="button" class="btn pri" onclick={() => app.save(sheet.outsideVersion)}>Keep my draft</button>
        </div>
      {:else if sheet.kind === "loadFile"}
        <span class="lbl">Load the file</span>
        <h2 class="h2">Discard your draft and load glance.yml?</h2>
        <p class="note">Your {plural(app.changeCount, "unsaved change")} will be lost. The file's version stays in History.</p>
        <div class="sheetfoot">
          <button type="button" class="btn ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn warn" onclick={() => app.discard("Loaded glance.yml as the draft")}>Discard draft and load</button>
        </div>
      {:else if sheet.kind === "error"}
        <span class="lbl">Not saved</span>
        <h2 class="h2">Couldn't write glance.yml</h2>
        <p class="note">{sheet.message}</p>
        <p class="help">Your draft is kept, and Save stays available.</p>
        <div class="sheetfoot"><button type="button" class="btn pri" onclick={close}>Close</button></div>
      {:else if sheet.kind === "discard"}
        <span class="lbl">Discard</span>
        <h2 class="h2">Discard {app.changesLabel}?</h2>
        <p class="note">The draft goes back to the live version. Saved versions are not affected.</p>
        <div class="sheetfoot">
          <button type="button" class="btn ghost" onclick={close}>Keep editing</button>
          <button type="button" class="btn warn" onclick={() => app.discard()}>Discard changes</button>
        </div>
      {:else if sheet.kind === "deletePage" && delPage}
        <span class="lbl">Delete page</span>
        <h2 class="h2">Delete “{delPage.name || "Untitled page"}”?</h2>
        <p class="note">Its {plural(widgetCount(delPage), "widget")} go with it. This only changes the draft; nothing is removed from Glance until you save, and every saved version stays in History.</p>
        <div class="sheetfoot">
          <button type="button" class="btn ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn warn" onclick={() => app.deletePage(delPage._id)}>Delete page</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
