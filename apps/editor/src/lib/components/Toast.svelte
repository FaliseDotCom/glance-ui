<!-- Undo toast (D-17). The live region is always present so screen readers announce new messages. -->
<script lang="ts">
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();
</script>

<div role="status" aria-live="polite">
  {#if app.toast}
    <div class="toast">
      <span>{app.toast.text}</span>
      {#if app.toast.undo}<button type="button" class="btn" onclick={app.toast.undo}>Undo</button>{/if}
    </div>
  {/if}
</div>
