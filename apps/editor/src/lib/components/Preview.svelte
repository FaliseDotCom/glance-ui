<!-- Preview (design 04, flow 8; handoff §4b; D-39, D-47 to D-49): the draft as the preview Glance renders it, full screen,
     at desktop or phone width. The status says when the draft changed after it was built; only Refresh rebuilds. "Save
     and go live" is the normal Review → check → save; the preview isn't promoted. The frame stays loaded while hidden, so
     going back to editing and returning doesn't make Glance fetch every widget's data again. -->
<script lang="ts">
  import { tick } from "svelte";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  let { app }: { app: App } = $props();

  const pv = $derived(app.preview!);
  const stale = $derived(app.previewStale);
  const hasChanges = $derived(app.changeCount > 0 || app.restored);
  const status = $derived(
    pv.failed ? "Not built" : pv.building ? "Building from the draft" : stale ? "Out of date: the draft changed after this was built" : "Built from the current draft",
  );

  let wrap = $state<HTMLElement>();
  let frame = $state<HTMLIFrameElement>();
  // Focus moves into the preview when it opens and returns to what opened it when it closes (design §7).
  $effect(() => {
    if (pv.open) void tick().then(() => { if (!wrap?.contains(document.activeElement)) wrap?.focus(); });
    else if (app.previewReturn?.isConnected) app.previewReturn.focus();
  });
  // The editor behind doesn't scroll while the preview covers it.
  $effect(() => {
    document.documentElement.style.overflow = pv.open ? "hidden" : "";
    return () => (document.documentElement.style.overflow = "");
  });
  // The page the frame is on, so Refresh rebuilds on the same page (same origin, so the frame's address is readable).
  const onload = () => {
    try {
      const p = frame?.contentWindow?.location.pathname;
      if (p?.startsWith("/preview")) pv.path = p;
    } catch {
      /* not readable: keep the last known page */
    }
  };
  const onkey = (e: KeyboardEvent) => {
    if (pv.open && !app.sheet && !e.defaultPrevented && e.key === "Escape") {
      e.preventDefault();
      app.closePreview();
    }
  };
</script>

<svelte:window onkeydown={onkey} />

<div class="pvwrap" role="dialog" aria-modal="true" aria-label="Preview of the draft" tabindex="-1" hidden={!pv.open} inert={!!app.sheet} bind:this={wrap}>
  <div class="pvbar">
    <span class="pill ext">Preview · not live</span>
    <span class="pvstatus" class:stale={stale && !pv.failed} role="status">{#if stale && !pv.failed}<Icon name="alert" size={16} />{/if}{status}</span>
    <span class="spacer"></span>
    <div class="seg" role="group" aria-label="Preview width">
      <button type="button" class:on={pv.device === "desktop"} aria-pressed={pv.device === "desktop"} onclick={() => (pv.device = "desktop")}>Desktop</button>
      <button type="button" class:on={pv.device === "phone"} aria-pressed={pv.device === "phone"} onclick={() => (pv.device = "phone")}>Phone</button>
    </div>
    <button type="button" class="btn" disabled={pv.building} onclick={() => app.buildPreview()}>Refresh</button>
    <button type="button" class="btn ghost" onclick={() => app.closePreview()}>Back to editing</button>
    <button type="button" class="btn pri" disabled={!hasChanges} onclick={() => (app.sheet = { kind: "review" })}>Save and go live</button>
  </div>
  <div class="pvstage">
    {#if pv.failed}
      <div class="pvbuild">
        <p class="h2" style="margin: 0 0 8px">The preview Glance didn't start. Live Glance is unaffected.</p>
        <p class="note">{pv.failed}</p>
        <div class="row" style="justify-content: center">
          <button type="button" class="btn ghost" onclick={() => app.closePreview()}>Back to editing</button>
          <button type="button" class="btn pri" onclick={() => app.buildPreview()}>Retry</button>
        </div>
      </div>
    {:else if pv.building}
      <div class="pvbuild">
        <p class="h2 pulse" style="margin: 0 0 8px">Starting the preview</p>
        <p class="note">A separate preview Glance is loading the draft. Its widgets fetch their data fresh, so the first load can take a moment. Live Glance is not touched.</p>
      </div>
    {:else}
      {#key pv.build}
        <iframe id="pvframe" class="pvframe" class:phone={pv.device === "phone"} title="Draft as Glance shows it" src={pv.path} bind:this={frame} {onload}></iframe>
      {/key}
    {/if}
  </div>
</div>
