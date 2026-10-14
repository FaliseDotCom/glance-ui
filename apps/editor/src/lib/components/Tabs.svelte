<!-- Phone bottom tabs (D-02): Pages · Theme · History. -->
<script lang="ts">
  import type { App } from "../client/app.svelte.ts";
  let { app }: { app: App } = $props();
</script>

<nav class="tabs" aria-label="Sections">
  <button type="button" class:on={app.screen === "pages"} aria-current={app.screen === "pages" ? "page" : undefined} onclick={() => (app.screen = "pages")}>Pages</button>
  <button type="button" class:on={app.screen === "theme"} aria-current={app.screen === "theme" ? "page" : undefined} onclick={() => (app.screen = "theme")}>Theme</button>
  <button type="button" class:on={app.screen === "history"} aria-current={app.screen === "history" ? "page" : undefined} onclick={() => (app.screen = "history")}>History</button>
</nav>
