<!-- ADR-0028: the Community tab of Add widget. The community widgets bundled with this release (glanceapp/community-widgets,
     CC0, pinned): a searchable list; opening one shows its YAML (and variants), the values it needs and its author; Add
     puts it in the column exactly as written. Widgets the pinned Glance or the editor can't use are shown with the
     reason and no Add. Previews load from GitHub at the pinned commit. -->
<script lang="ts">
  import type { ListRef } from "@glance-editor/editing";
  import { api, type CommunityList, type CommunityWidget } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";

  let { app, target }: { app: App; target: ListRef } = $props();

  let list = $state<CommunityList | null>(null);
  let loadError = $state("");
  let query = $state("");
  let open = $state<CommunityWidget | null>(null);
  let variant = $state(0);
  let addError = $state("");
  let adding = $state(false);

  $effect(() => {
    void api.community().then((l) => (list = l)).catch((e: Error) => (loadError = e.message));
  });

  const base = $derived(list ? `https://github.com/${list.source}` : "");
  const raw = (dir: string) => (list ? `https://raw.githubusercontent.com/${list.source}/${list.commit}/widgets/${dir}/preview.png` : "");
  const folder = (dir: string) => (list ? `${base}/tree/${list.commit}/widgets/${dir}` : "");
  const usable = (w: { variants: { check: { ok: boolean } }[] }) => w.variants.some((v) => v.check.ok);
  const reason = (w: { variants: { check: { ok: boolean } }[] }) => (!w.variants.length ? "Needs its own server" : usable(w) ? "" : `Doesn't work with Glance ${list?.glance ?? ""}`);
  const shown = $derived.by(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    const all = q ? list.widgets.filter((w) => `${w.title} ${w.description} ${w.author}`.toLowerCase().includes(q)) : list.widgets;
    return [...all].sort((a, b) => Number(!usable(a)) - Number(!usable(b)));
  });

  async function show(dir: string) {
    addError = "";
    variant = 0;
    open = await api.communityWidget(dir).catch((e: Error) => { loadError = e.message; return null; });
    if (open) variant = Math.max(0, open.variants.findIndex((v) => v.check.ok));
  }
  async function add() {
    if (!open) return;
    const v = open.variants[variant];
    if (!v?.check.ok) return;
    adding = true;
    addError = (await app.addCommunityWidget(target, v.yaml, open.title)) ?? "";
    adding = false;
  }
  const v = $derived(open?.variants[variant]);
</script>

{#snippet thumb(dir: string, has: boolean, big = false)}
  <span class="cwthumb" class:big aria-hidden="true">{#if has}<img src={raw(dir)} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={(e) => ((e.currentTarget as HTMLElement).style.display = "none")} />{/if}</span>
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
          <button type="button" class:on={variant === i} aria-pressed={variant === i} onclick={() => { variant = i; addError = ""; }}>{x.name || `Variant ${i + 1}`}</button>
        {/each}
      </div>
    {/if}
    {#if v}
      {#if v.variables.length}
        <div class="notice">
          <span><strong>Needs {v.variables.length === 1 ? "a value" : `${v.variables.length} values`}:</strong> <span class="mono">{v.variables.map((n) => `\${${n}}`).join(", ")}</span></span>
          <span class="help" style="margin: 0">Add them to .env next to glance.yml, or as variables in the container's settings. The editor keeps them as written; Review warns about any without a value.</span>
        </div>
      {/if}
      <span class="flabel" style="margin: 0">YAML, added exactly as written</span>
      <pre class="pre cwyaml" tabindex="0" role="region" aria-label={`YAML of ${open.title}`}>{v.yaml}</pre>
      {#if !v.check.ok}<p class="errtxt" style="margin: 0">Can't be added: {v.check.message}</p>{/if}
      {#if addError}<p class="errtxt" role="alert" style="margin: 0">{addError}</p>{/if}
      <div class="sheetfoot">
        <button type="button" class="btn pri" disabled={!v.check.ok || adding} onclick={add}>Add {open.title}</button>
      </div>
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
        <button type="button" class="trow cw" onclick={() => show(w.dir)}>
          {@render thumb(w.dir, w.preview)}
          <span class="grow" style="min-width: 0"><span class="wname">{w.title}</span><span class="wsum cwdesc">{w.description}</span>
            <span class="help" style="margin: 0">by {w.author}{why ? ` · ${why}` : ""}</span></span>
        </button>
      </div>
    {/each}
    {#if !shown.length}<div class="empty">No community widget matches.</div>{/if}
  </div>
{/if}
