<!-- First run (D-34; design 03 "First run and empty"): Import glance.yml or Start empty. -->
<script lang="ts">
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();

  async function goImport() {
    app.fixText = null;
    app.screen = "import";
    await app.runImportCheck();
  }
</script>

<div class="center"><div class="welcome">
  <span class="lbl">First run</span>
  <h1 class="h1">Set up the editor</h1>
  <p class="note">The editor owns one file: Glance's <span class="mono">glance.yml</span>. Nothing is written until you press Save.</p>
  <div class="choices">
    <button type="button" class="choice" onclick={goImport} disabled={!app.liveExists}>
      <span class="h3">Import glance.yml</span>
      <span class="wsum">{app.liveExists ? "Found glance.yml. It is read and checked first; nothing is written." : "No glance.yml found at the mounted path. Check the volume mount, or start empty."}</span>
    </button>
    <button type="button" class="choice" onclick={() => (app.screen = "layout")}>
      <span class="h3">Start empty</span>
      <span class="wsum">{app.liveExists ? "One page with a column layout. On first save the existing glance.yml is kept in History as version 0." : "One page with a column layout. glance.yml is created on first save."}</span>
    </button>
  </div>
</div></div>
