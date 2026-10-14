<!-- First run (D-34; design 03 "First run and empty"): Import glance.yml, upload a Glance folder as .zip (ADR-0025),
     or Start empty. -->
<script lang="ts">
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();
  let drag = $state(false);

  async function goImport() {
    app.fixText = null;
    app.upload = null;
    app.screen = "import";
    await app.runImportCheck();
  }

  function picked(files: FileList | null | undefined) {
    const f = files?.[0];
    if (f) void app.runUploadCheck(f);
  }
</script>

<div class="center"><div class="welcome">
  <span class="lbl">First run</span>
  <h1 class="h1">Set up the editor</h1>
  <p class="note">The editor owns one file: Glance's <span class="mono">glance.yml</span>. Nothing is written until you press Save.</p>
  <div class="choices three">
    <button type="button" class="choice" onclick={goImport} disabled={!app.liveExists}>
      <span class="h3">Import glance.yml</span>
      <span class="wsum">{app.liveExists ? "Found glance.yml. It is read and checked first; nothing is written." : "No glance.yml in the data folder. Upload your Glance folder instead, or start empty."}</span>
    </button>
    <label class="choice" class:drag for="zipfile"
      ondragover={(e) => { e.preventDefault(); drag = true; }} ondragleave={() => (drag = false)}
      ondrop={(e) => { e.preventDefault(); drag = false; picked(e.dataTransfer?.files); }}>
      <span class="h3">Upload your Glance folder</span>
      <span class="wsum">A .zip of the folder with your glance.yml. Include files, assets and .env come with it. Checked first; nothing is written until you import.</span>
      <input id="zipfile" class="sr" type="file" accept=".zip,application/zip" disabled={app.busy} onchange={(e) => { picked(e.currentTarget.files); e.currentTarget.value = ""; }} />
    </label>
    <button type="button" class="choice" onclick={() => (app.screen = "layout")}>
      <span class="h3">Start empty</span>
      <span class="wsum">{app.liveExists ? "One page with a column layout. On first save the existing glance.yml is kept in History as version 0." : "One page with a column layout. glance.yml is created on first save."}</span>
    </button>
  </div>
</div></div>
