<!-- History (D-30, D-31; flow 7 "Roll back"): versions newest first, including changes made outside the editor.
     Detail shows what the version changed and a line diff against the live version; Restore loads it into the draft. -->
<script lang="ts">
  import { changeText, diffHunks, diffLines, formatWhen, plural, sourceLabel, versionSummary } from "@glance-editor/editing";
  import { api, type VersionDetail } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();

  let selected = $state<number | null>(null);
  let detail = $state<VersionDetail | null>(null);
  let liveText = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    void app.reloadVersions();
  });

  async function select(n: number) {
    selected = n;
    detail = null;
    loadError = null;
    try {
      const [d, live] = await Promise.all([api.version(n), app.liveVersion !== null && app.liveVersion !== n ? api.version(app.liveVersion) : null]);
      if (selected !== n) return;
      detail = d;
      liveText = live?.text ?? null;
    } catch (e) {
      loadError = (e as Error).message;
    }
  }

  const notes = (d: VersionDetail): string[] =>
    d.source === "outside"
      ? ["Spotted by comparing the file with the last save.", "Kept as its own version so it can be restored or compared."]
      : d.source === "import"
        ? ["Your glance.yml as it was before the editor first wrote it.", "Kept so it can always be restored."]
        : d.changes.map(changeText);
  const diff = $derived(detail && liveText !== null ? diffLines(liveText, detail.text) : null);
  const hunks = $derived(diff ? diffHunks(diff) : null);
</script>

<h1 class="h1">History</h1>
<p class="note">Every save stores the whole config as a version. Restoring loads a version into the draft; Glance doesn't change until you save.</p>
{#if app.versions.length === 0}
  <div class="empty" style="padding: 32px">No versions yet. The first save creates version 1{app.liveExists ? ", and keeps the file it replaces as version 0." : "."}</div>
{:else}
  <div class="histgrid">
    <ol class="vlist" aria-label="Versions">
      {#each app.versions as v (v.number)}
        <li>
          <button type="button" class="vrow" class:on={selected === v.number} aria-pressed={selected === v.number} onclick={() => select(v.number)}>
            <span class="row between"><span class="mono" style="color: var(--ink)">Version {v.number}</span>
              <span class="row">{#if v.source === "outside"}<span class="pill ext">Outside editor</span>{/if}{#if v.live}<span class="pill">Live</span>{/if}</span></span>
            <span style="color: var(--ink-strong); font-weight: 600">{versionSummary(v)}</span>
            <span class="wsum">{formatWhen(v.createdAt)} · {sourceLabel(v)}</span>
          </button>
        </li>
      {/each}
    </ol>
    {#if selected === null}
      <div class="empty">Pick a version to see what it changed.</div>
    {:else if loadError}
      <div class="panel"><p class="errtxt">Couldn't load version {selected}: {loadError}</p></div>
    {:else if !detail}
      <div class="panel"><p class="note pulse">Loading version {selected}…</p></div>
    {:else}
      <div class="panel" aria-live="polite">
        <span class="lbl">Version {detail.number}</span>
        <h2 class="h2">{versionSummary(detail)}</h2>
        <span class="wsum" style="white-space: normal">{formatWhen(detail.createdAt)} · {sourceLabel(detail)}{#if detail.pages !== null} · {plural(detail.pages, "page")}, {plural(detail.widgets ?? 0, "widget")}{/if}</span>
        <ul>{#each notes(detail) as t, i (i)}<li class="note">{t}</li>{/each}</ul>
        {#if detail.live}
          <p class="help">{app.changeCount ? `Your draft has ${plural(app.changeCount, "unsaved change")} on top of this.` : "The draft matches this version."}</p>
        {:else if hunks}
          <span class="flabel" style="margin: 0">Compared with the live version (version {app.liveVersion})</span>
          {#if hunks.length === 0}
            <p class="help" style="margin: 0">Same text as the live version.</p>
          {:else}
            <pre class="diff" aria-label="Lines that differ">{#each hunks as l, i (i)}{#if l === null}<span class="gap">⋯</span>{:else}<span class={l.kind}>{l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}{l.text}</span>{/if}{/each}</pre>
            <p class="help" style="margin: 0">+ lines are in version {detail.number}; − lines are in the live version.</p>
          {/if}
        {/if}
        <div class="row wrap">
          <button type="button" class="btn pri" disabled={detail.live} onclick={() => app.restore(detail!.number)}>Restore as draft</button>
          {#if detail.live}<span class="help" style="margin: 0">This is what Glance is running.</span>{/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
