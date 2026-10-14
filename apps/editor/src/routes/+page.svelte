<!-- The editor (design pass 1, Phases 5 and 6): first run, pages and layout, the widget inspector, theme, history, Save. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { App } from "#lib/client/app.svelte.ts";
  import TopBar from "#lib/components/TopBar.svelte";
  import Rail from "#lib/components/Rail.svelte";
  import Tabs from "#lib/components/Tabs.svelte";
  import Welcome from "#lib/components/Welcome.svelte";
  import ImportScreen from "#lib/components/ImportScreen.svelte";
  import LayoutPick from "#lib/components/LayoutPick.svelte";
  import PageEditor from "#lib/components/PageEditor.svelte";
  import History from "#lib/components/History.svelte";
  import Inspector from "#lib/components/Inspector.svelte";
  import ThemeScreen from "#lib/components/ThemeScreen.svelte";
  import Sheets from "#lib/components/Sheets.svelte";
  import Toast from "#lib/components/Toast.svelte";

  const app = new App();
  onMount(() => {
    void app.init();
    // Glance's status dot: checked on load, after saves, on "Check again", and every minute.
    const t = setInterval(() => void app.checkGlance(), 60_000);
    return () => clearInterval(t);
  });
  const editing = $derived(app.screen === "pages" || app.screen === "theme" || app.screen === "history");
  const inspecting = $derived(app.screen === "pages" && !!app.sel && !!app.selWidget);
</script>

<svelte:head><title>Glance Editor</title></svelte:head>

<div class="app">
  <TopBar {app} />
  {#if app.loadError}
    <div class="center"><div class="welcome">
      <span class="lbl">Error</span><h1 class="h1">The editor couldn't load</h1>
      <p class="note">{app.loadError}</p>
      <div class="row"><button type="button" class="btn pri" onclick={() => { app.loadError = null; void app.init(); }}>Try again</button></div>
    </div></div>
  {:else if app.screen === "loading"}
    <div class="center"><p class="note pulse">Loading…</p></div>
  {:else if app.screen === "welcome"}
    <main><Welcome {app} /></main>
  {:else if app.screen === "import"}
    <main><ImportScreen {app} /></main>
  {:else if app.screen === "layout"}
    <main><LayoutPick {app} /></main>
  {:else if editing}
    <div class="shell">
      <Rail {app} />
      <main class="work" class:open={inspecting}><div class="canvas">
        {#if app.screen === "history"}
          <History {app} />
        {:else if app.screen === "theme"}
          <ThemeScreen {app} />
        {:else if app.page}
          {#key app.page._id}<PageEditor {app} page={app.page} />{/key}
        {:else}
          <div class="empty" style="padding: 40px">No pages. Glance needs at least one page before it will start.</div>
        {/if}
      </div>
      {#if inspecting}{#key app.sel!.ids.join("/")}<Inspector {app} wref={app.sel!} />{/key}{/if}
      </main>
    </div>
    <Tabs {app} />
  {/if}
  <Sheets {app} />
  <Toast {app} />
</div>
