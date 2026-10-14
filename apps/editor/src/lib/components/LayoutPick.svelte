<!-- Start empty (D-34): a page name and one of the six valid column layouts, so the first save can't fail on columns. -->
<script lang="ts">
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();

  // design prototype PRESETS; keys are the server's START_LAYOUTS.
  const PRESETS: { key: string; label: string; sizes: ("small" | "full")[] }[] = [
    { key: "one-full", label: "One full column", sizes: ["full"] },
    { key: "small-full", label: "Small + full", sizes: ["small", "full"] },
    { key: "full-small", label: "Full + small", sizes: ["full", "small"] },
    { key: "two-full", label: "Two full", sizes: ["full", "full"] },
    { key: "small-full-small", label: "Small + full + small", sizes: ["small", "full", "small"] },
    { key: "small-full-full", label: "Small + full + full", sizes: ["small", "full", "full"] },
  ];
  let name = $state("Home");
  let preset = $state(0);
</script>

<div class="center"><div class="welcome">
  <span class="lbl">Start empty</span>
  <h1 class="h1">First page</h1>
  <div>
    <label class="flabel" for="newname">Page name</label>
    <input id="newname" class="input big" bind:value={name} />
  </div>
  <div class="rule"><span class="lbl">Column layout</span></div>
  <p class="note">Every option follows Glance's rule: up to 3 columns, 1 or 2 of them full. Small columns are 300 px wide. You can change this later.</p>
  <div class="choices" role="group" aria-label="Column layout">
    {#each PRESETS as p, i (p.key)}
      <button type="button" class="choice" class:on={preset === i} aria-pressed={preset === i} onclick={() => (preset = i)}>
        <span class="minicols" aria-hidden="true">{#each p.sizes as s, j (j)}<span class="mc {s}"></span>{/each}</span>
        <span class="h3" style="font-size: 15px">{p.label}</span>
      </button>
    {/each}
  </div>
  <div class="row wrap">
    <button type="button" class="btn pri" disabled={!name.trim() || app.busy} onclick={() => app.startEmpty(name.trim(), PRESETS[preset]!.key)}>Create page</button>
    <button type="button" class="btn ghost" onclick={() => (app.screen = "welcome")}>Back</button>
  </div>
</div></div>
