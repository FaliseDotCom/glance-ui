<!-- Global bar (design §1 "Global bar", D-01, D-26): Glance status, change count, Discard, Save. On a phone the page
     select sits here and Discard moves into Review (IA "Navigation by device"). -->
<script lang="ts">
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();

  const statusText = $derived(
    app.glance === "reachable" ? "Glance reachable" : app.glance === "unreachable" ? "Glance not responding" : "Glance status not checked",
  );
  const inEditor = $derived(app.screen === "pages" || app.screen === "theme" || app.screen === "history");
  const hasChanges = $derived(app.changeCount > 0 || app.restored);
</script>

<header class="top">
  <span class="lbl desk-only">Glance editor</span>
  {#if app.screen === "pages" && app.draft}
    <label class="phone-only pagepick"><span class="sr">Page</span>
      <select class="input" value={app.page?._id} onchange={(e) => (app.pageId = (e.currentTarget as HTMLSelectElement).value)}>
        {#each app.draft.pages as p (p._id)}<option value={p._id}>{p.name || "Untitled page"}</option>{/each}
      </select>
    </label>
  {/if}
  <span class="spacer"></span>
  <span class="status" class:bad={app.glance === "unreachable"} class:off={app.glance === "not-configured"} title={statusText}>
    <span class="dot"></span><span class="desk-only">{statusText}</span><span class="sr phone-only">{statusText}</span>
  </span>
  {#if inEditor}
    {#if hasChanges}
      <button type="button" class="btn ghost desk-only" onclick={() => (app.sheet = { kind: "discard" })}>Discard</button>
      <button type="button" class="btn chip desk-only" onclick={() => (app.sheet = { kind: "review" })}>{app.changesLabel}</button>
    {/if}
    {#if app.previewConfigured}
      <!-- D-49: with no unsaved changes the preview would equal live Glance. -->
      <button type="button" class="btn" disabled={!hasChanges || !app.draft?.pages.length} title={hasChanges ? "Preview the draft before it goes live" : "No unsaved changes to preview"}
        onclick={() => app.openPreview()}>Preview</button>
    {/if}
    <button type="button" class="btn pri" disabled={!hasChanges} onclick={() => (app.sheet = { kind: "review" })}>Save</button>
  {/if}
</header>

{#if inEditor && app.glance === "unreachable"}
  <div class="banner" role="status">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
    <span class="grow">Glance is not responding. Editing still works and saves still write glance.yml, but the reload can't be confirmed.</span>
    <button type="button" class="btn" onclick={async () => { if ((await app.checkGlance()) === "unreachable") app.say("Still no response from Glance."); }}>Check again</button>
  </div>
{/if}
{#if inEditor && app.showErrors && app.errors.length > 0 && !app.sheet}
  <div class="banner" role="status">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
    <span class="grow">{app.errors.length === 1 ? "1 problem" : `${app.errors.length} problems`} to fix before saving.</span>
    <button type="button" class="btn" onclick={() => (app.sheet = { kind: "problems" })}>Show problems</button>
  </div>
{/if}
