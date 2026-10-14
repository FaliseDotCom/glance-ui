<!-- Add images → Pixabay (design D-61, D-62; decided 2026-10-13: largeImageURL ≤ 1280 px; a local pool downloaded only
     when you press the button; the schedule only switches between local files). The category chips show straight away;
     the API key is asked for below them, once, checked with Pixabay and kept by the editor's server (never in the
     browser after that, never in glance.yml). Results say where they come from (Pixabay's terms). -->
<script lang="ts">
  import { editBackground, newId, plural } from "@glance-editor/editing";
  import type { BackgroundImageT } from "@glance-editor/model";
  import { api, type PixabayHit } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";

  let { app }: { app: App } = $props();

  let chipsList = $state<string[]>([]);
  let key = $state<{ hasKey: boolean; masked: string | null } | null>(null);
  $effect(() => {
    void api.pixabay().then((r) => { chipsList = r.chips; key = { hasKey: r.hasKey, masked: r.masked }; }).catch(() => (key = { hasKey: false, masked: null }));
  });
  let cats = $state<string[]>([]);
  let mode = $state<"feed" | "pick">("feed");
  let count = $state<10 | 20 | 40>(20);
  let swap = $state<"daily" | "weekly" | "monthly" | "never">("weekly");
  let words = $state("");
  let hits = $state<PixabayHit[] | null>(null);
  let picked = $state<string[]>([]);
  let busy = $state("");
  let error = $state("");

  let keyDraft = $state("");
  let keyError = $state("");
  let checking = $state(false);
  async function saveKey() {
    checking = true;
    keyError = "";
    const r = await api.setPixabayKey(keyDraft).catch((e: Error) => ({ ok: false as const, reason: "unreachable", message: e.message }));
    checking = false;
    if (!r.ok) return void (keyError = r.message);
    key = { hasKey: true, masked: r.masked };
    keyDraft = "";
  }
  async function changeKey() {
    key = await api.clearPixabayKey();
    hits = null;
  }

  const toggle = (c: string) => { cats = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]; hits = null; picked = []; };

  async function search() {
    busy = "Searching Pixabay…";
    error = "";
    const r = await api.pixabaySearch(cats, words).catch((e: Error) => ({ ok: false as const, message: e.message }));
    busy = "";
    if (!r.ok) return void (error = r.message);
    hits = r.hits;
    picked = [];
  }

  function add(list: Omit<BackgroundImageT, "_id">[], what: string) {
    app.mutate((d) => editBackground(d, (b) => { b.images = [...(b.images ?? []), ...list.map((x) => ({ _id: newId("image"), ...x }))]; }));
    app.sheet = null;
    app.say(what);
  }

  async function go() {
    error = "";
    if (mode === "pick") {
      busy = `Downloading ${plural(picked.length, "image")}…`;
      const r = await api.pixabayAdd(picked).catch((e: Error) => ({ ok: false as const, message: e.message }));
      busy = "";
      if (!r.ok) return void (error = r.message);
      add(r.images.map((x) => ({ file: x.file, name: x.name })), `Added ${plural(r.images.length, "image")} from Pixabay`);
    } else {
      const set = `set-${Math.random().toString(36).slice(2, 8)}`;
      busy = `Downloading ${count} images…`;
      const r = await api.pixabayPool(set, cats, count).catch((e: Error) => ({ ok: false as const, message: e.message }));
      busy = "";
      if (!r.ok) return void (error = r.message);
      add([{ pixabay: set, name: `Pixabay · ${cats.join(", ")}`, categories: [...cats], count, swap }], `Added a Pixabay set of ${plural(r.files, "image")}`);
    }
  }
  const goLabel = $derived(!key?.hasKey ? "Add your API key first" : !cats.length ? "Pick a category" : mode === "feed" ? "Use this set" : picked.length ? `Add ${plural(picked.length, "image")}` : "Select images");
  const goDisabled = $derived(!key?.hasKey || !cats.length || (mode === "pick" && !picked.length) || !!busy);
</script>

<span class="flabel" style="margin: 0">Categories <span class="help">· pick one or more</span></span>
<div class="swrow" role="group" aria-label="Categories">
  {#each chipsList as c (c)}<button type="button" class="chipbtn" class:on={cats.includes(c)} aria-pressed={cats.includes(c)} onclick={() => toggle(c)}>{c}</button>{/each}
</div>
<div class="seg" role="group" aria-label="How to use Pixabay">
  <button type="button" class:on={mode === "feed"} aria-pressed={mode === "feed"} onclick={() => (mode = "feed")}>Keep a rotating set</button>
  <button type="button" class:on={mode === "pick"} aria-pressed={mode === "pick"} onclick={() => (mode = "pick")}>Pick images myself</button>
</div>

{#if mode === "feed"}
  <p class="note" style="margin: 0">The editor downloads a set of images from these categories when you press the button below, and keeps them in Glance's assets folder. On the schedule it switches to the next image in the set. Nothing more is downloaded until you press Get new images.</p>
  <span class="flabel" style="margin: 0">Keep ready</span>
  <div class="seg" role="group" aria-label="How many images">
    {#each [10, 20, 40] as n (n)}<button type="button" class:on={count === n} aria-pressed={count === n} onclick={() => (count = n as 10 | 20 | 40)}>{n} images</button>{/each}
  </div>
  <span class="flabel" style="margin: 0">Switch to the next image</span>
  <div class="seg" role="group" aria-label="Switch to the next image">
    {#each [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["never", "Never"]] as [v, t] (v)}
      <button type="button" class:on={swap === v} aria-pressed={swap === v} onclick={() => (swap = v as typeof swap)}>{t}</button>
    {/each}
  </div>
  <p class="help" style="margin: 0">Switching replaces image files only; glance.yml doesn't change and nothing needs saving. In a slideshow every image in the set is a slide; the schedule is for a single background image.</p>
{:else}
  <form class="row" onsubmit={(e) => { e.preventDefault(); void search(); }}>
    <label class="sr" for="pixq">Refine with words</label>
    <input id="pixq" class="input grow" placeholder="Optional words, e.g. alps winter" bind:value={words} />
    <button type="submit" class="btn" disabled={!key?.hasKey || !cats.length || !!busy}>Search</button>
  </form>
  {#if hits}
    <div class="pixgrid">
      {#each hits as h (h.id)}
        {@const on = picked.includes(h.id)}
        <button type="button" class="pixcell" class:picked={on} aria-pressed={on} onclick={() => (picked = on ? picked.filter((x) => x !== h.id) : [...picked, h.id])}>
          <img class="pixthumb" src={h.preview} alt="" loading="lazy" referrerpolicy="no-referrer" />
          <span class="wsum" style="padding: 6px 8px 0">{h.tags || "Photo"}</span><span class="wsum" style="padding: 0 8px 8px">by {h.user}</span>
        </button>
      {/each}
    </div>
    {#if !hits.length}<div class="empty">Pixabay found no photos for these categories and words.</div>{/if}
  {/if}
{/if}

{#if key && !key.hasKey}
  <div class="picker">
    <label class="flabel" for="pixkey" style="margin: 0">Pixabay API key</label>
    <p class="help" style="margin: 0">Free from your Pixabay account. Stored in the editor's settings, never in glance.yml; only the editor's server talks to Pixabay.</p>
    <form class="row" onsubmit={(e) => { e.preventDefault(); void saveKey(); }}>
      <input id="pixkey" class="input mono grow" type="password" autocomplete="off" bind:value={keyDraft} placeholder="Paste your key" aria-invalid={!!keyError} />
      <button type="submit" class="btn" disabled={!keyDraft.trim() || checking}>{checking ? "Checking key…" : "Check and save key"}</button>
    </form>
    {#if keyError}<p class="errtxt" role="alert" style="margin: 0">{keyError}</p>{/if}
  </div>
{:else if key?.hasKey}
  <div class="row between wrap"><span class="help" style="margin: 0">Key saved · <span class="mono">{key.masked}</span></span>
    <button type="button" class="btn ghost" onclick={changeKey}>Change key</button></div>
{/if}
{#if error}<p class="errtxt" role="alert" style="margin: 0">{error}</p>{/if}
{#if busy}<p class="note pulse" style="margin: 0">{busy}</p>{/if}
<div class="row wrap" style="gap: 4px">
  <a class="btn ghost" href="https://pixabay.com/" target="_blank" rel="noreferrer">Images from Pixabay</a>
  <span class="help" style="margin: 0">At most 1280 px wide, stored in Glance's assets folder with each photographer's name.</span>
</div>
<div class="sheetfoot"><button type="button" class="btn pri" disabled={goDisabled} onclick={go}>{goLabel}</button></div>
