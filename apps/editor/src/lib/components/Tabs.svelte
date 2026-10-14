<!-- Phone bottom tabs (D-02). Theme joins in Phase 6. -->
<script lang="ts">
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();
</script>

<nav class="tabs" aria-label="Sections">
  <button type="button" class:on={app.screen === "pages"} aria-current={app.screen === "pages" ? "page" : undefined} onclick={() => (app.screen = "pages")}>Pages</button>
  <button type="button" class:on={app.screen === "history"} aria-current={app.screen === "history" ? "page" : undefined} onclick={() => (app.screen = "history")}>History</button>
</nav>
