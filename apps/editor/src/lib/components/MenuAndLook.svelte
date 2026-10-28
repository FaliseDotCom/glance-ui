<!-- ADR-0026: the dashboard's look and menu, on the Theme screen. Lines between items (Glance's look, or none), compact
     widgets (ADR-0034), which
     of the themes in Glance's docs the dashboard's theme picker offers, and an Edit link to the editor in the
     dashboard's menu. Hidden lines and the Edit link are files the editor writes into Glance's assets folder on Save. -->
<script lang="ts">
  import { MENU_THEMES, hslCss, hslParts, inMenu, presetKey, setEditorOption, setInMenu, GLANCE_DEFAULTS, type ColourKey, type GalleryTheme } from "@glance-editor/editing";
  import type { DashboardT } from "@glance-editor/model";
  import { api, type IconInfo } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Toggle from "./Toggle.svelte";

  let { app }: { app: App } = $props();

  const ed = $derived(app.draft?.["glance-editor"]);
  const hideLines = $derived(ed?.["hide-lines"] === true);
  const editLink = $derived(ed?.["edit-link"]);
  const own = $derived((app.draft?.theme?.presets ?? []).filter((p) => !MENU_THEMES.some((t) => presetKey(t) === p.key)));
  const compact = $derived(ed?.["compact-widgets"] === true);
  const needsFiles = $derived(hideLines || compact || !!editLink);

  // Hidden lines, compact widgets and the Edit link need Glance to serve the editor's files from its assets folder.
  const assetsPath = $derived(app.draft?.server?.["assets-path"]);
  let info = $state<IconInfo | null>(null);
  $effect(() => {
    void assetsPath;
    void app.settle().then(() => api.iconInfo()).then((i) => (info = i)).catch(() => (info = null));
  });
  const useGlanceAssets = () => app.mutate((d: DashboardT) => { d.server = { ...d.server, "assets-path": info!.glanceAssetsPath! }; }, { toast: "Glance's assets folder is set in the draft (server: assets-path)" });

  const dot = (t: GalleryTheme, k: ColourKey) =>
    hslCss(hslParts(t.properties[k] ?? (k === "positive-color" ? t.properties["primary-color"] ?? GLANCE_DEFAULTS["primary-color"] : GLANCE_DEFAULTS[k]))!);
  // The address this editor is open at: the dashboard and the editor share a host, on different ports.
  const here = () => `${location.origin}/`;
  let typed = $state<string | null>(null);
  const urlOk = (v: string) => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };
  function setUrl(v: string) {
    typed = v;
    if (urlOk(v.trim())) { typed = null; app.mutate((d) => setEditorOption(d, "edit-link", v.trim())); }
  }
</script>

<div class="rule"><span class="lbl">Dashboard look</span></div>
<Toggle id="lines" label="Lines between items (containers, monitors, bookmarks, markets, and between bookmark groups)" on={!hideLines}
  ontoggle={() => app.mutate((d) => setEditorOption(d, "hide-lines", !hideLines))} />
<p class="help" style="margin: 0">On is Glance's own look. Off removes the lines with the editor's CSS file; the spacing stays.</p>
<Toggle id="compact" label="Compact widgets (titles inside their boxes)" on={compact}
  ontoggle={() => app.mutate((d) => setEditorOption(d, "compact-widgets", !compact))} />
<p class="help" style="margin: 0">Off is Glance's own look. On puts each widget's title inside its box, so widgets in a column are as far apart as the columns are. Search, videos, cards, iframes and groups have no box of their own and keep their titles above.</p>

<div class="rule"><span class="lbl">Dashboard menu</span></div>
<span class="flabel" style="margin: 0">Themes in the menu</span>
<p class="help" style="margin: 0">The dashboard's theme picker always offers your theme and Glance's light theme. Switch on the themes from Glance's docs it should offer too; each is written to glance.yml as a theme preset.</p>
<div class="menuthemes">
  {#each MENU_THEMES as t (t.name)}
    {@const on = inMenu(app.draft, t)}
    <button type="button" class="mtheme" class:on aria-pressed={on} aria-label={`Offer ${t.name} in the dashboard menu`} onclick={() => app.mutate((d) => setInMenu(d, t, !on))}>
      <span class="mswatch" style:background={dot(t, "background-color")} aria-hidden="true">
        <span class="dotc" style:background={dot(t, "primary-color")}></span>
        <span class="dotc" style:background={dot(t, "negative-color")}></span>
      </span>
      <span class="grow">{t.name}</span>
      <span class="mcheck" aria-hidden="true">{on ? "✓" : ""}</span>
    </button>
  {/each}
</div>
{#if own.length}<p class="help" style="margin: 0">Also in the menu, kept as written: {own.map((p) => p.key).join(", ")}.</p>{/if}

<Toggle id="editlink" label="Edit link in the dashboard's menu" on={!!editLink}
  ontoggle={() => app.mutate((d) => setEditorOption(d, "edit-link", editLink ? undefined : here()))} />
<p class="help" style="margin: 0">A pencil next to the theme picker, and "Edit dashboard" in the phone menu. It opens this editor on the page you were looking at. Anyone who can open the dashboard sees it, and the editor has no login.</p>
{#if editLink}
  <div class="field" style="margin: 0">
    <label class="flabel" for="editurl">The editor's address</label>
    <input id="editurl" class="input mono" value={typed ?? editLink} aria-invalid={typed !== null} aria-describedby={typed !== null ? "editurl-e" : undefined}
      oninput={(e) => setUrl(e.currentTarget.value)} />
    {#if typed !== null}<p class="errtxt" id="editurl-e">Type a full address, such as http://server:8090/.</p>{/if}
    <p class="help">Filled in with the address you opened the editor at. Change it if the dashboard is opened at another address.</p>
  </div>
{/if}
{#if needsFiles && info && !info.assets.ok}
  <div class="notice" role="status">
    <span>{info.assets.message}</span>
    {#if info.assets.reason === "no-assets-path" && info.glanceAssetsPath}
      <button type="button" class="btn" onclick={useGlanceAssets}>Use Glance's assets folder ({info.glanceAssetsPath})</button>
    {/if}
  </div>
{/if}
