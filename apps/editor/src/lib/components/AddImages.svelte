<!-- Add images (design D-59, D-60; flow 9 step 4): This device (files, or a whole folder on desktop browsers) and Server
     folder (folders mounted into the editor: pick images, or use a whole folder, whose new images are picked up on the
     next save). Files end up in Glance's assets folder. Pixabay is the third source (plan v2 Phase 10b). -->
<script lang="ts">
  import { editBackground, newId, plural } from "@glance-editor/editing";
  import type { BackgroundImageT } from "@glance-editor/model";
  import { api, type FolderList } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";

  let { app }: { app: App } = $props();
  let tab = $state<"device" | "server">("device");
  let busy = $state("");
  let error = $state("");

  function add(list: Omit<BackgroundImageT, "_id">[], what: string) {
    app.mutate((d) => editBackground(d, (b) => { b.images = [...(b.images ?? []), ...list.map((x) => ({ _id: newId("image"), ...x }))]; }));
    app.sheet = null;
    app.say(what);
  }

  // ---- This device ----------------------------------------------------------------------------------------------------
  async function upload(files: FileList | null, folder: boolean) {
    const list = [...(files ?? [])].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (!list.length) return void (error = folder ? "That folder has no images." : "Pick one or more images.");
    error = "";
    const done: Omit<BackgroundImageT, "_id">[] = [];
    for (const [i, f] of list.entries()) {
      busy = `Uploading ${i + 1} of ${list.length}…`;
      const r = await api.uploadImage(f).catch((e: Error) => ({ ok: false as const, message: e.message }));
      if (!r.ok) {
        busy = "";
        error = `Couldn't store the image: ${r.message}`;
        if (done.length) add(done, `Uploaded ${plural(done.length, "image")}; ${f.name} failed`);
        return;
      }
      done.push({ file: r.file, name: f.name });
    }
    busy = "";
    add(done, `Uploaded ${plural(done.length, "image")}${folder ? " from a folder" : ""}`);
  }

  // ---- Server folder --------------------------------------------------------------------------------------------------
  let roots = $state<string[] | null>(null);
  let path = $state<string | null>(null);
  let listing = $state<FolderList | null>(null);
  let picked = $state<string[]>([]);
  $effect(() => {
    if (tab !== "server" || roots) return;
    void api.folders().then((r) => (roots = "roots" in r ? r.roots : [])).catch(() => (roots = []));
  });
  async function open(p: string | null) {
    path = p;
    picked = [];
    error = "";
    if (p === null) return void (listing = null);
    const r = await api.folders(p).catch((e: Error) => ({ error: e.message }));
    if ("error" in r) { error = r.error; listing = null; } else if ("entries" in r) listing = r;
  }
  const rootOf = (p: string) => roots?.find((r) => p === r || p.startsWith(`${r}/`)) ?? "";
  const crumbs = $derived.by(() => {
    if (!path) return [];
    const root = rootOf(path);
    const rest = path.slice(root.length).split("/").filter(Boolean);
    return [{ label: root, to: root }, ...rest.map((x, i) => ({ label: x, to: `${root}/${rest.slice(0, i + 1).join("/")}` }))];
  });
  async function addPicked() {
    busy = `Copying ${plural(picked.length, "image")}…`;
    const r = await api.copyImages(picked).catch((e: Error) => ({ ok: false as const, message: e.message }));
    busy = "";
    if (!r.ok) return void (error = `Couldn't store the image: ${r.message}`);
    add(r.images.map((x) => ({ file: x.file, name: x.name })), `Added ${plural(r.images.length, "image")} from the server`);
  }
</script>

<div class="row between" style="align-items: flex-start">
  <div><span class="lbl">Background</span><h2 class="h2">Add images</h2></div>
  <button type="button" class="ib" aria-label="Close" onclick={() => (app.sheet = null)}><Icon name="close" size={20} /></button>
</div>
<div class="seg" role="tablist" aria-label="Image source">
  <button type="button" role="tab" class:on={tab === "device"} aria-selected={tab === "device"} onclick={() => (tab = "device")}>This device</button>
  <button type="button" role="tab" class:on={tab === "server"} aria-selected={tab === "server"} onclick={() => (tab = "server")}>Server folder</button>
</div>
{#if error}<p class="errtxt" role="alert" style="margin: 0">{error}</p>{/if}
{#if busy}<p class="note pulse" style="margin: 0">{busy}</p>{/if}

{#if tab === "device"}
  <label class="drop" for="devfiles">
    <span class="h3" style="font-size: 16px">Choose files or a folder from this device</span>
    <span class="help" style="margin: 0">JPEG, PNG or WebP. On a phone this opens your photo library. Files are uploaded to Glance's assets folder.</span>
    <input id="devfiles" class="sr" type="file" accept="image/*" multiple disabled={!!busy} onchange={(e) => upload(e.currentTarget.files, false)} />
    <span class="btn pri" aria-hidden="true">Choose files</span>
  </label>
  <label class="btn" for="devfolder" style="align-self: flex-start">Choose a whole folder<input id="devfolder" class="sr" type="file" accept="image/*" multiple webkitdirectory
    disabled={!!busy} onchange={(e) => upload(e.currentTarget.files, true)} /></label>
  <p class="help" style="margin: 0">Folder upload works in desktop browsers; phones generally only offer files.</p>
{:else}
  <p class="help" style="margin: 0">Folders mounted into the editor's container, for example your photo library. Pick single images, or use a whole folder for a slideshow.</p>
  {#if roots === null}
    <p class="note pulse" style="margin: 0">Loading folders…</p>
  {:else if !roots.length}
    <div class="empty">No folders are mounted into the editor.</div>
    <p class="help" style="margin: 0">Mount a folder into the editor's container (read only is enough) and list it in its SERVER_FOLDERS setting, for example <span class="mono">SERVER_FOLDERS=/photos</span>.</p>
  {:else}
    <div class="row wrap" style="gap: 4px">
      <button type="button" class="btn ghost" style="font-family: var(--mono); font-size: 13px" onclick={() => open(null)}>mounts</button>
      {#each crumbs as c (c.to)}<span class="help" style="margin: 0">/</span><button type="button" class="btn ghost" style="font-family: var(--mono); font-size: 13px" onclick={() => open(c.to)}>{c.label}</button>{/each}
    </div>
    <div class="stack" style="gap: 6px; max-height: 340px; overflow: auto">
      {#if path === null}
        {#each roots as r (r)}
          <div class="crow">
            <Icon name="folder" size={20} />
            <button type="button" class="crowmain" style="padding-left: 10px" onclick={() => open(r)}><span class="mono" style="color: var(--ink)">{r}</span><span class="wsum">Mounted folder</span></button>
            <button type="button" class="btn" onclick={() => add([{ folder: r }], `Added folder ${r}`)}>Use folder</button>
          </div>
        {/each}
      {:else if listing}
        {#each listing.entries as en (en.path)}
          {#if en.dir}
            <div class="crow">
              <Icon name="folder" size={20} />
              <button type="button" class="crowmain" style="padding-left: 10px" onclick={() => open(en.path)}><span class="mono" style="color: var(--ink)">{en.name}</span><span class="wsum">{plural(en.images ?? 0, "image")}</span></button>
              <button type="button" class="btn" onclick={() => add([{ folder: en.path }], `Added folder ${en.name}`)}>Use folder</button>
            </div>
          {:else}
            {@const on = picked.includes(en.path)}
            <div class="crow" class:picked={on}>
              <span class="thumb" aria-hidden="true"><img src={`/api/folders/image?path=${encodeURIComponent(en.path)}`} alt="" loading="lazy" /></span>
              <button type="button" class="crowmain" style="padding-left: 10px" aria-pressed={on}
                onclick={() => (picked = on ? picked.filter((p) => p !== en.path) : [...picked, en.path])}><span class="mono" style="color: var(--ink)">{en.name}</span><span class="wsum">{Math.max(1, Math.round((en.size ?? 0) / 1024))} KB</span></button>
              {#if on}<span class="pill">Selected</span>{/if}
            </div>
          {/if}
        {/each}
        {#if !listing.entries.length}<div class="empty">This folder has no images or folders.</div>{/if}
      {/if}
    </div>
    <div class="sheetfoot">
      {#if path}<button type="button" class="btn" onclick={() => add([{ folder: path! }], `Added folder ${path}`)}>Use this folder</button>{/if}
      <button type="button" class="btn pri" disabled={!picked.length || !!busy} onclick={addPicked}>{picked.length ? `Add ${plural(picked.length, "image")}` : "Select images"}</button>
    </div>
  {/if}
{/if}
