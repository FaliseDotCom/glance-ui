<!-- Background (design D-52, D-53; flow 9 step 4): Colour only, Image or Slideshow, drawn by the editor's own CSS file in
     Glance's assets folder, written on Save (Preview writes its own copy). Images come from "Add images" (D-59). -->
<script lang="ts">
  import { BACKGROUND_DEFAULTS, editBackground, setBackgroundMode } from "@glance-editor/editing";
  import type { BackgroundT, DashboardT } from "@glance-editor/model";
  import { api, type IconInfo } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";

  let { app }: { app: App } = $props();

  const bg = $derived(app.draft?.["glance-editor"]?.background);
  const o = $derived({ ...BACKGROUND_DEFAULTS, ...bg });
  const images = $derived(bg?.images ?? []);
  const show = $derived(bg?.mode === "slideshow");
  const assetsPath = $derived(app.draft?.server?.["assets-path"]);
  let info = $state<IconInfo | null>(null);
  $effect(() => {
    void assetsPath;
    void app.settle().then(() => api.iconInfo()).then((i) => (info = i)).catch(() => (info = null));
  });

  const edit = (fn: (b: BackgroundT) => void) => app.mutate((d) => editBackground(d, fn));
  const mode = (m: BackgroundT["mode"] | null) => app.mutate((d) => setBackgroundMode(d, m));
  const useGlanceAssets = () => app.mutate((d: DashboardT) => { d.server = { ...d.server, "assets-path": info!.glanceAssetsPath! }; }, { toast: "Glance's assets folder is set in the draft (server: assets-path)" });
  const swap = <T,>(a: T[], i: number, j: number) => { [a[i], a[j]] = [a[j]!, a[i]!]; };

  type Opt<K extends keyof typeof BACKGROUND_DEFAULTS> = [NonNullable<BackgroundT[K]>, string][];
  const INTERVALS: Opt<"interval"> = [["1m", "1 min"], ["5m", "5 min"], ["15m", "15 min"], ["1h", "1 hour"]];
  const ORDERS: Opt<"order"> = [["in-order", "In order"], ["shuffle", "Shuffle"]];
  const TRANSITIONS: Opt<"transition"> = [["fade", "Fade"], ["cut", "Cut"]];
  const FITS: Opt<"fit"> = [["fill", "Fill (crop)"], ["whole", "Whole image"]];
  const SURFACES: Opt<"surfaces"> = [["solid", "Solid"], ["see-through", "See-through"]];
</script>

{#snippet seg<K extends keyof typeof BACKGROUND_DEFAULTS>(label: string, key: K, opts: Opt<K>)}
  <span class="flabel" style="margin: 0">{label}</span>
  <div class="seg" role="group" aria-label={label}>
    {#each opts as [v, text] (v)}
      <button type="button" class:on={o[key] === v} aria-pressed={o[key] === v} onclick={() => edit((b) => { (b as Record<string, unknown>)[key] = v; })}>{text}</button>
    {/each}
  </div>
{/snippet}

<div class="rule"><span class="lbl">Background</span></div>
<div class="seg" role="group" aria-label="Background type">
  {#each [[null, "Colour only"], ["image", "Image"], ["slideshow", "Slideshow"]] as [m, text] (text)}
    {@const on = (bg?.mode ?? null) === m}
    <button type="button" class:on aria-pressed={on} onclick={() => mode(m as BackgroundT["mode"] | null)}>{text}</button>
  {/each}
</div>
{#if !bg}
  <p class="help" style="margin: 0">The page uses the background colour above.</p>
{:else}
  <div class="notice">Glance has no background-image setting. The editor writes its own CSS file into Glance's assets folder and points Glance's custom CSS option at it. That CSS depends on Glance's page markup, so it is tested against the pinned Glance version, and Preview shows it before it goes live.</div>
  {#if info && !info.assets.ok}
    <div class="notice" role="status">
      <span>{info.assets.message}</span>
      {#if info.assets.reason === "no-assets-path" && info.glanceAssetsPath}
        <button type="button" class="btn" onclick={useGlanceAssets}>Use Glance's assets folder ({info.glanceAssetsPath})</button>
      {/if}
    </div>
  {/if}
  {#if bg["import-css"]}<p class="help" style="margin: 0">Your own CSS file ({bg["import-css"]}) is still used: the editor's file imports it.</p>{/if}
  <span class="flabel" style="margin: 0">{show ? "Images in the slideshow (at least 2)" : "Image"}</span>
  <div class="stack" style="gap: 6px">
    {#each images as im, i (im._id)}
      {@const name = im.name ?? im.file ?? im.folder ?? "image"}
      {@const inUse = show || (o.use ?? 0) === i}
      <div class="crow" class:dimmed={!inUse}>
        {#if im.folder}
          <span class="thumb folder" aria-hidden="true"><Icon name="folder" size={20} /></span>
        {:else}
          <span class="thumb" aria-hidden="true"><img src={`/assets/${im.file}`} alt="" loading="lazy" /></span>
        {/if}
        <button type="button" class="crowmain" style="padding-left: 10px" aria-pressed={show ? undefined : inUse} onclick={() => { if (!show) edit((b) => { b.use = i; }); }}>
          <span class="mono" style="color: var(--ink); overflow-wrap: anywhere">{im.folder ?? name}</span>
          <span class="wsum" style="white-space: normal">{im.folder ? "Server folder · new images in it are picked up on the next save" : im.name ? "Stored in Glance's assets folder" : im.file}{show ? ` · Slide ${i + 1}` : inUse ? " · In use" : " · Tap to use"}</span>
        </button>
        {#if show}
          <button type="button" class="ib sm" aria-label={`Move ${name} up`} disabled={i === 0} onclick={() => edit((b) => swap(b.images!, i, i - 1))}><Icon name="up" /></button>
          <button type="button" class="ib sm" aria-label={`Move ${name} down`} disabled={i === images.length - 1} onclick={() => edit((b) => swap(b.images!, i, i + 1))}><Icon name="down" /></button>
        {/if}
        <button type="button" class="ib sm" aria-label={`Remove ${name}`}
          onclick={() => edit((b) => { b.images!.splice(i, 1); if (!b.images!.length) delete b.images; if ((b.use ?? 0) >= (b.images?.length ?? 0)) delete b.use; })}><Icon name="trash" /></button>
      </div>
    {/each}
    {#if !images.length}<div class="empty">No images yet.</div>{/if}
    <button type="button" class="btn add" onclick={() => (app.sheet = { kind: "images" })}><Icon name="plus" />Add images</button>
    <p class="help" style="margin: 0">From this device or a folder on the server. Images end up in Glance's assets folder and are served from /assets/.</p>
  </div>
  {#if show}
    {@render seg("Change image every", "interval", INTERVALS)}
    {@render seg("Order", "order", ORDERS)}
    {@render seg("Transition", "transition", TRANSITIONS)}
    {#if o.order === "shuffle"}<p class="help" style="margin: 0">Shuffle needs a small script added through Glance's document option, which inserts HTML into every page's head. In order with a cut or fade can be done in CSS alone.</p>{/if}
  {/if}
  {@render seg("Fit", "fit", FITS)}
  <label class="sl" style="grid-template-columns: 70px minmax(0, 1fr) 48px">Dim<input type="range" min="0" max="80" value={o.dim} aria-label="Dim image"
    oninput={(e) => { const v = Number(e.currentTarget.value); edit((b) => { b.dim = v; }); }} /><span>{o.dim}%</span></label>
  <label class="sl" style="grid-template-columns: 70px minmax(0, 1fr) 48px">Blur<input type="range" min="0" max="20" value={o.blur} aria-label="Blur image"
    oninput={(e) => { const v = Number(e.currentTarget.value); edit((b) => { b.blur = v; }); }} /><span>{o.blur} px</span></label>
  {@render seg("Widget surfaces", "surfaces", SURFACES)}
  <p class="help" style="margin: 0">Glance paints widgets with the background colour, so the image shows only around them unless surfaces are see-through. Dim and blur keep text readable over a busy photo.</p>
{/if}
