<!-- The icon finder (design D-21, D-54 to D-56; flow 4 step 3): one finder wherever an icon is set. Suggested (the item's
     title in every library, plus the site's own icon), All libraries, each library, Web (Iconify icons and Openverse
     images, Wikimedia Commons as fallback; the pick is downloaded into Glance's assets folder), URL. Every result shows
     its value and library. Picking sets the field and closes the finder. -->
<script lang="ts">
  import { tick } from "svelte";
  import { iconLibrary, iconUrl, LIBRARIES, libraryName, siteOf } from "@glance-editor/editing";
  import { api, type IconHit, type IconInfo, type LibraryStatus, type SiteIcon, type WebResult, type WebSearch } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";

  type Target = { label: string; title: string; url: string; current: string; apply: (value: string | undefined) => void };
  let { app, target }: { app: App; target: Target } = $props();

  type Tab = "sug" | "all" | "si" | "sh" | "di" | "mdi" | "web" | "url";
  const TABS: [Tab, string][] = [["sug", "Suggested"], ["all", "All libraries"], ...LIBRARIES.map((l) => [l.id, l.short] as [Tab, string]), ["web", "Web"], ["url", "URL"]];
  // svelte-ignore state_referenced_locally
  let tab = $state<Tab>(target.title ? "sug" : "all");
  let info = $state<IconInfo | null>(null);
  const cdn = $derived(info?.cdn);
  const assetsOk = $derived(info?.assets.ok === true);
  const assetsMessage = $derived(info && !info.assets.ok ? info.assets.message : "");
  const cur = $derived(target.current);
  const preview = (v: string) => (cdn ? iconUrl(v, cdn) : null);
  const libProblems = (libs: Record<string, LibraryStatus>) =>
    Object.entries(libs).filter(([, s]) => !s.ok).map(([id, s]) => `Couldn't load the ${libraryName(id)} list: ${s.error ?? "unknown error"}.`);

  function pick(v: string | undefined) {
    target.apply(v);
    app.sheet = null;
  }

  $effect(() => {
    void api.iconInfo().then((i) => (info = i)).catch(() => (info = { cdn: "", assets: { ok: false, reason: "error", message: "The editor couldn't check Glance's assets folder." } }));
  });

  // ---- Suggested (D-54) ---------------------------------------------------------------------------------------------
  let sug = $state<IconHit[] | null>(null);
  let sugNotes = $state<string[]>([]);
  let site = $state<SiteIcon | { status: "loading" } | null>(null);
  const siteInfo = $derived(siteOf(target.url));
  $effect(() => {
    if (!target.title) return;
    void api.iconSuggest(target.title).then((r) => { sug = r.results; sugNotes = libProblems(r.libraries); }).catch((e: Error) => { sug = []; sugNotes = [e.message]; });
  });
  $effect(() => {
    if (!("domain" in siteInfo)) return;
    site = { status: "loading" };
    void api.iconSite(target.url).then((r) => (site = r)).catch((e: Error) => (site = { status: "none", domain: siteInfo.domain, message: e.message }));
  });

  // ---- library search (D-21) ----------------------------------------------------------------------------------------
  let query = $state("");
  let lib = $state<{ results: IconHit[]; total: number; notes: string[] } | null>(null);
  let libLoading = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  $effect(() => {
    if (!["all", "si", "sh", "di", "mdi"].includes(tab)) return;
    const q = query, which = tab, n = ++seq;
    clearTimeout(timer);
    libLoading = true;
    timer = setTimeout(() => {
      void api.iconSearch(q, which)
        .then((r) => { if (n === seq) lib = { results: r.results, total: r.total, notes: libProblems(r.libraries) }; })
        .catch((e: Error) => { if (n === seq) lib = { results: [], total: 0, notes: [e.message] }; })
        .finally(() => { if (n === seq) libLoading = false; });
    }, q ? 200 : 0);
  });

  // ---- web (D-55, D-56) ---------------------------------------------------------------------------------------------
  // svelte-ignore state_referenced_locally
  let webQ = $state(target.title ? `${target.title} logo` : "");
  let web = $state<WebSearch | null>(null);
  let webLoading = $state(false);
  async function webSearch() {
    if (!webQ.trim()) return;
    webLoading = true;
    try {
      web = await api.iconWeb(webQ.trim());
    } catch (e) {
      web = { icons: [], images: [], imagesFrom: null, errors: [(e as Error).message] };
    } finally {
      webLoading = false;
    }
  }

  let downloading = $state<string | null>(null);
  let downloadError = $state("");
  async function download(id: string) {
    downloading = id;
    downloadError = "";
    try {
      const r = await api.iconDownload(id);
      if (!r.ok) return void (downloadError = r.message);
      app.say(`Downloaded to Glance’s assets folder as ${r.value}`);
      pick(r.value);
    } catch (e) {
      downloadError = (e as Error).message;
    } finally {
      downloading = null;
    }
  }

  // ---- URL ----------------------------------------------------------------------------------------------------------
  // svelte-ignore state_referenced_locally
  let urlText = $state(/^(https?:|\/)/.test(target.current) ? target.current : "");

  let tabsEl = $state<HTMLElement>();
  async function selectTab(t: Tab) {
    tab = t;
    await tick();
    tabsEl?.querySelector<HTMLElement>(`#ictab-${t}`)?.focus();
  }
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex(([t]) => t === tab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      void selectTab(TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]![0]);
    }
  };
  const webSub = (r: WebResult) => `${r.provider} · ${r.license}${r.width && r.height ? ` · ${r.width}×${r.height}` : ""}`;
</script>

{#snippet thumb(src: string | null, fallback: string)}
  <span class="ichip" aria-hidden="true">{#if src}<img {src} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={(e) => ((e.currentTarget as HTMLElement).style.display = "none")} />{:else}{fallback}{/if}</span>
{/snippet}

{#snippet hits(list: IconHit[])}
  <div class="icongrid">
    {#each list as r (r.value)}
      <button type="button" class="icell" class:on={r.value === cur} aria-pressed={r.value === cur} onclick={() => pick(r.value)}>
        {@render thumb(r.preview, r.library)}
        <span class="grow" style="min-width: 0"><span class="iname">{r.value}</span><span class="wsum" style="font-family: var(--ui)">{libraryName(r.library)}</span></span>
      </button>
    {/each}
  </div>
{/snippet}

<div class="row between" style="align-items: flex-start">
  <div><span class="lbl">Icon{target.title ? ` · ${target.title}` : ""}</span><h2 class="h2">Choose an icon</h2></div>
  <button type="button" class="ib" aria-label="Close" onclick={() => (app.sheet = null)}><Icon name="close" size={20} /></button>
</div>
<div class="row wrap" style="gap: 8px">
  <span class="help" style="margin: 0">Current:</span>
  {#if cur}{@render thumb(preview(cur), iconLibrary(cur) ?? "url")}{/if}
  <span class="mono" style="overflow-wrap: anywhere">{cur || "none"}</span>
  {#if cur}<button type="button" class="btn ghost" onclick={() => pick(undefined)}>Remove icon</button>{/if}
</div>
<div class="seg" role="tablist" aria-label="Where to look" bind:this={tabsEl} tabindex="-1" onkeydown={onTabKey}>
  {#each TABS as [t, label] (t)}
    <button type="button" role="tab" id={`ictab-${t}`} aria-controls="icpanel" class:on={tab === t} aria-selected={tab === t} tabindex={tab === t ? 0 : -1}
      onclick={() => (tab = t)}>{label}</button>
  {/each}
</div>

<div id="icpanel" role="tabpanel" aria-labelledby={`ictab-${tab}`} class="stack" style="gap: 10px">
  {#if tab === "sug"}
    <p class="help" style="margin: 0">{target.title ? `Matches for “${target.title}” in every icon library, plus the site’s own icon when the URL allows it.` : "Give the item a title to get suggestions."}</p>
    {#each sugNotes as n (n)}<p class="errtxt" style="margin: 0">{n}</p>{/each}
    {#if target.title && sug === null}<p class="note pulse" style="margin: 0">Looking for matches…</p>{/if}
    {#if sug?.length}{@render hits(sug)}{/if}
    {#if "unavailable" in siteInfo && siteInfo.unavailable === "placeholder"}
      <div class="icongrid"><button type="button" class="icell" disabled>{@render thumb(null, "web")}<span class="grow"><span class="iname">Site icon</span><span class="wsum" style="white-space: normal; font-family: var(--ui)">Not available: the URL is an environment variable the editor never resolves.</span></span></button></div>
    {:else if site?.status === "loading"}
      <p class="note pulse" style="margin: 0">Looking for the site’s own icon…</p>
    {:else if site?.status === "found"}
      <div class="icongrid">
        <button type="button" class="icell" disabled={!assetsOk || downloading !== null} onclick={() => download(site && "id" in site ? site.id : "")}>
          {@render thumb(site.preview, "web")}
          <span class="grow" style="min-width: 0"><span class="iname">Site icon from {site.domain}</span><span class="wsum" style="white-space: normal; font-family: var(--ui)">{downloading ? "Downloading…" : "Downloaded to Glance’s assets folder when you pick it"}</span></span>
        </button>
      </div>
    {:else if site?.status === "none"}
      <p class="help" style="margin: 0">No site icon: {site.message}</p>
    {/if}
    {#if target.title && sug !== null && !sug.length && site?.status !== "found"}<div class="empty">No suggestions for this name. Try searching the libraries or the web.</div>{/if}
  {:else if tab === "url"}
    <label class="flabel" for="iurl" style="margin: 0">Image URL or /assets/ path</label>
    <input id="iurl" class="input mono" bind:value={urlText} placeholder="https://… or /assets/…" />
    <p class="help" style="margin: 0">An external URL is used as it is; Glance loads it from that site each time.</p>
    <div class="sheetfoot"><button type="button" class="btn pri" disabled={!urlText.trim()} onclick={() => pick(urlText.trim())}>Use this</button></div>
  {:else if tab === "web"}
    <form class="row" onsubmit={(e) => { e.preventDefault(); void webSearch(); }}>
      <label class="sr" for="wq">Search the web for an icon</label>
      <input id="wq" class="input grow" placeholder="e.g. jellyfin logo" bind:value={webQ} />
      <button type="submit" class="btn pri" disabled={!webQ.trim() || webLoading}>Search</button>
    </form>
    {#if !assetsOk && assetsMessage}<div class="notice" role="status">Picking a web result needs Glance's assets folder. {assetsMessage}</div>{/if}
    {#if downloadError}<p class="errtxt" role="alert" style="margin: 0">{downloadError}</p>{/if}
    {#if webLoading}
      <p class="note pulse" style="margin: 0">Searching the web…</p>
    {:else if web}
      {#each web.errors as e (e)}<p class="help" style="margin: 0">Not available: {e}</p>{/each}
      {#each [{ title: "Icons · from Iconify", list: web.icons }, { title: `Images · from ${web.imagesFrom === "wikimedia" ? "Wikimedia Commons" : "Openverse"}`, list: web.images }] as g (g.title)}
        {#if g.list.length}
          <span class="lbl">{g.title}</span>
          <div class="icongrid">
            {#each g.list as r (r.id)}
              <button type="button" class="icell" disabled={!assetsOk || downloading !== null} onclick={() => download(r.id)}>
                {@render thumb(r.preview, "img")}
                <span class="grow" style="min-width: 0"><span class="iname" style="font-family: var(--ui)">{r.title}</span><span class="wsum" style="white-space: normal; font-family: var(--ui)">{downloading === r.id ? "Downloading…" : webSub(r)}</span></span>
              </button>
            {/each}
          </div>
        {/if}
      {/each}
      {#if !web.icons.length && !web.images.length}<div class="empty">Nothing found on the web for “{webQ}”.</div>{/if}
    {:else}
      <div class="empty">Search images on the web. The one you pick is downloaded into Glance's assets folder, so the dashboard doesn't depend on that site.</div>
    {/if}
    <p class="help" style="margin: 0">Check that you may use an image before picking it. Its licence and credit are saved next to it in the assets folder.</p>
  {:else}
    {@const name = tab === "all" ? "all four libraries" : libraryName(tab)}
    <label class="sr" for="iq">Search icons</label>
    <input id="iq" class="input" placeholder={`Search ${name}`} bind:value={query} autocomplete="off" />
    {#each lib?.notes ?? [] as n (n)}<p class="errtxt" style="margin: 0">{n}</p>{/each}
    {#if lib === null || (libLoading && !lib.results.length)}
      <p class="note pulse" style="margin: 0">Loading the icon lists…</p>
    {:else}
      {#if lib.results.length}{@render hits(lib.results)}{/if}
      {#if !lib.results.length}<div class="empty">No icon with that name. Try another word, or search the web.</div>{/if}
      {#if lib.total > lib.results.length}<p class="help" style="margin: 0">Showing the first {lib.results.length} of {lib.total}. Type more of the name to narrow it down.</p>{/if}
    {/if}
    <p class="help" style="margin: 0">Searches each library's published icon list. The previews load from the same address Glance uses.</p>
  {/if}
</div>
