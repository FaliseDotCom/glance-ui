<!-- ADR-0028, ADR-0030: the Community tab of Add widget. The community widgets bundled with this release
     (glanceapp/community-widgets, CC0, pinned): a searchable list; opening one shows its variants, a labelled field for
     each value it needs (optional ones under More options, filled with their defaults), what else it needs, and its
     YAML under Show YAML. Add stores the values in .env, if Glance can load the widget with them, and adds the widget.
     A widget already on the dashboard can share its values with the new copy or have its own (NAME_2…). Widgets the
     pinned Glance or the editor can't use are shown with the reason and no Add. Previews load from GitHub. -->
<script lang="ts">
  import { copyNames, renameValues, type ListRef } from "@glance-editor/editing";
  import { api, type CommunityList, type CommunityWidgetView, type ValueInfo } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  import ValueRow from "./ValueRow.svelte";

  let { app, target }: { app: App; target: ListRef } = $props();

  let list = $state<CommunityList | null>(null);
  let loadError = $state("");
  let query = $state("");
  let open = $state<CommunityWidgetView | null>(null);
  let variant = $state(0);
  let addError = $state("");
  let adding = $state(false);
  let more = $state(false);
  let showYaml = $state(false);

  $effect(() => {
    void api.community().then((l) => (list = l)).catch((e: Error) => (loadError = e.message));
  });

  const base = $derived(list ? `https://github.com/${list.source}` : "");
  const raw = (dir: string, file: string) => (list ? `https://raw.githubusercontent.com/${list.source}/${list.commit}/widgets/${dir}/${file}` : "");
  const folder = (dir: string) => (list ? `${base}/tree/${list.commit}/widgets/${dir}` : "");
  const usable = (w: { variants: { check: { ok: boolean } }[] }) => w.variants.some((v) => v.check.ok);
  const reason = (w: { variants: { check: { ok: boolean } }[] }) => (!w.variants.length ? "Needs its own server" : usable(w) ? "" : "Can't be added");
  const shown = $derived.by(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    const all = q ? list.widgets.filter((w) => `${w.title} ${w.description} ${w.author}`.toLowerCase().includes(q)) : list.widgets;
    return [...all].sort((a, b) => Number(!usable(a)) - Number(!usable(b)));
  });

  async function show(dir: string) {
    addError = "";
    variant = 0;
    more = false;
    showYaml = false;
    open = await api.communityWidget(dir).catch((e: Error) => { loadError = e.message; return null; });
    if (open) variant = Math.max(0, open.variants.findIndex((v) => v.check.ok));
  }
  const v = $derived(open?.variants[variant]);

  // The values the variant needs, as the editor knows them (set or not, where the dashboard uses them), and every name
  // already taken (for a second copy's own names).
  let infos = $state<ValueInfo[] | null>(null);
  let taken = $state<Set<string>>(new Set());
  let typed = $state<Record<string, string | null>>({});
  let own = $state(false);
  $effect(() => {
    const names = v?.variables ?? [];
    infos = null;
    typed = {};
    own = false;
    addError = "";
    if (!names.length) return;
    // Pending edits first: which widgets use a value is read from the server's draft.
    void app.settle().then(() => api.values(names)).then((l) => {
      infos = names.map((n) => l.values.find((x) => x.name === n)!).filter(Boolean);
      taken = new Set(l.values.map((x) => x.name));
    }).catch(() => (infos = []));
  });
  // ADR-0030: a widget on the dashboard already uses these names: the same values, or this copy's own.
  const sharedWith = $derived((infos ?? []).find((i) => i.usedBy.length)?.usedBy[0] ?? null);
  const rename = $derived(own && sharedWith && v ? copyNames(v.variables, taken) : null);
  const fields = $derived.by((): ValueInfo[] => (infos ?? []).map((i) => {
    if (!rename) return i;
    const n = rename[i.name]!;
    const copy = n.slice(i.name.length + 1);
    return { name: n, set: false, container: false, hidden: i.hidden, usedBy: [], ...(i.field ? { field: { ...i.field, label: `${i.field.label} (copy ${copy})` } } : {}) };
  }));
  // Optional values start with their defaults (unless .env has one already), so leaving them alone works (ADR-0030).
  $effect(() => {
    for (const f of fields) if (f.field?.optional && !f.set && typed[f.name] == null) typed[f.name] = f.field.default ?? "";
  });
  const required = $derived(fields.filter((f) => !f.field?.optional && !(f.container && !f.set)));
  const optional = $derived(fields.filter((f) => f.field?.optional && !(f.container && !f.set)));
  const fromContainer = $derived(fields.filter((f) => f.container && !f.set));
  const yaml = $derived(v ? (rename ? renameValues(v.yaml, rename) : v.yaml) : "");

  async function add() {
    if (!open || !v?.check.ok) return;
    adding = true;
    addError = "";
    // Typed values; an optional one cleared on purpose is stored empty, never left unset (Glance won't load without it).
    const values = Object.fromEntries(fields.flatMap((f) => {
      const t = typed[f.name];
      if (typeof t !== "string") return [];
      if (t === "" && !f.field?.optional) return [];
      return [[f.name, t]];
    }));
    try {
      if (v.variables.length) await api.setValues(values, yaml);
    } catch (e) {
      addError = (e as Error).message;
      adding = false;
      return;
    }
    addError = (await app.addCommunityWidget(target, yaml, open.title)) ?? "";
    adding = false;
  }
</script>

{#snippet thumb(dir: string, file: string | undefined, big = false)}
  <span class="cwthumb" class:big aria-hidden="true">{#if file}<img src={raw(dir, file)} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={(e) => ((e.currentTarget as HTMLElement).style.display = "none")} />{/if}</span>
{/snippet}

{#snippet values(list: ValueInfo[], prefix: string)}
  {#each list as info (info.name)}
    <ValueRow {info} id={`${prefix}-${info.name}`} bind:text={typed[info.name]} note={info.set ? "Already set" : undefined} />
  {/each}
{/snippet}

{#if loadError}
  <p class="errtxt" role="alert" style="margin: 0">Couldn't load the community widgets: {loadError}</p>
{:else if !list}
  <p class="note pulse" style="margin: 0">Loading the community widgets…</p>
{:else if open}
  <button type="button" class="btn ghost" style="align-self: flex-start" onclick={() => (open = null)}><Icon name="left" size={18} />All community widgets</button>
  <div class="row" style="gap: 12px; align-items: flex-start">
    {@render thumb(open.dir, open.preview, true)}
    <span class="grow" style="min-width: 0">
      <span class="h3" style="display: block">{open.title}</span>
      <span class="wsum" style="white-space: normal">{open.description}</span>
      <span class="help" style="margin: 0">by {open.author}</span>
    </span>
  </div>
  <a class="btn ghost" style="align-self: flex-start" href={folder(open.dir)} target="_blank" rel="noreferrer">Instructions and screenshots</a>
  {#if !open.variants.length}
    <div class="notice">This widget needs a program of its own running next to Glance, so it can't be added from here. Its instructions say how to set it up.</div>
  {:else}
    {#if open.variants.length > 1}
      <div class="seg" role="group" aria-label="Variant">
        {#each open.variants as x, i (i)}
          <button type="button" class:on={variant === i} aria-pressed={variant === i} onclick={() => { variant = i; more = false; showYaml = false; }}>{x.name || `Variant ${i + 1}`}</button>
        {/each}
      </div>
    {/if}
    {#if v}
      {#if !v.check.ok}
        <div class="notice">Can't be added: {v.check.message}</div>
      {:else}
        {#if open.needs}<div class="notice">{open.needs}</div>{/if}
        {#if v.variables.length}
          {#if infos === null}
            <p class="note pulse" style="margin: 0">Checking which values are set…</p>
          {:else}
            {#if sharedWith}
              <div class="stack" style="gap: 6px">
                <span class="flabel" style="margin: 0">Values</span>
                <p class="help" style="margin: 0">{sharedWith} uses some of the same values. This copy can share them, or have its own (to show another server, say).</p>
                <div class="seg" role="group" aria-label="Values for this copy">
                  <button type="button" class:on={!own} aria-pressed={!own} onclick={() => (own = false)}>Share them</button>
                  <button type="button" class:on={own} aria-pressed={own} onclick={() => (own = true)}>Its own</button>
                </div>
              </div>
            {/if}
            <div class="stack" style="gap: 10px">
              {#if required.length}
                <span class="flabel" style="margin: 0">{required.length === 1 ? "What it needs" : `What it needs (${required.length})`}</span>
                <p class="help" style="margin: 0">Kept in .env next to glance.yml, not in glance.yml. Leave one empty to fill it in later on the Values screen.</p>
                {@render values(required, "cwv")}
              {/if}
              {#each fromContainer as info (info.name)}
                <p class="help" style="margin: 0">{info.field?.label ?? info.name}: set in the container's settings.</p>
              {/each}
              {#if optional.length}
                <button type="button" class="btn ghost" style="align-self: flex-start; padding: 0 8px" aria-expanded={more} aria-controls="cw-more" onclick={() => (more = !more)}>
                  <Icon name={more ? "up" : "down"} />More options ({optional.length})</button>
                {#if more}
                  <div id="cw-more" class="stack" style="gap: 10px">
                    <p class="help" style="margin: 0">Filled in with the widget's defaults. Change any of them now or later.</p>
                    {@render values(optional, "cwo")}
                  </div>
                {/if}
              {/if}
            </div>
          {/if}
        {:else}
          <p class="help" style="margin: 0">Nothing to fill in.</p>
        {/if}
      {/if}
      <button type="button" class="btn ghost" style="align-self: flex-start; padding: 0 8px" aria-expanded={showYaml} aria-controls="cw-yaml" onclick={() => (showYaml = !showYaml)}>
        <Icon name={showYaml ? "up" : "down"} />Show YAML</button>
      {#if showYaml}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region needs keyboard access: axe scrollable-region-focusable) -->
        <pre id="cw-yaml" class="pre cwyaml" tabindex="0" role="region" aria-label={`YAML of ${open.title}`}>{yaml}</pre>
        <p class="help" style="margin: 0">Added as shown. Each {"${NAME}"} is filled in by Glance from .env.</p>
      {/if}
      {#if addError}<p class="errtxt" role="alert" style="margin: 0">{addError}</p>{/if}
      {#if v.check.ok}
        <div class="sheetfoot">
          <button type="button" class="btn pri" disabled={adding || (v.variables.length > 0 && infos === null)} onclick={add}>Add {open.title}</button>
        </div>
      {/if}
    {/if}
  {/if}
{:else}
  <label class="sr" for="cwq">Search community widgets</label>
  <input id="cwq" class="input" placeholder="Search community widgets" bind:value={query} autocomplete="off" />
  <div class="row wrap between" style="gap: 6px">
    <p class="help" style="margin: 0; flex: 1 1 240px">Made by Glance users and shared under CC0. Each one was checked with Glance {list.glance} for this release.</p>
    <a class="btn ghost" href={base} target="_blank" rel="noreferrer">{list.source}</a>
  </div>
  <div class="tlist" role="list" aria-label="Community widgets">
    {#each shown as w (w.dir)}
      {@const why = reason(w)}
      <div role="listitem">
        <button type="button" class="trow cw" data-dir={w.dir} onclick={() => show(w.dir)}>
          {@render thumb(w.dir, w.preview)}
          <span class="grow" style="min-width: 0"><span class="wname">{w.title}</span><span class="wsum cwdesc">{w.description}</span>
            <span class="help" style="margin: 0">by {w.author}{why ? ` · ${why}` : ""}</span></span>
        </button>
      </div>
    {/each}
    {#if !shown.length}<div class="empty">No community widget matches.</div>{/if}
  </div>
{/if}
