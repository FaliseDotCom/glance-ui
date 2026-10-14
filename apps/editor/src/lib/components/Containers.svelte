<!-- Containers section of a docker-containers widget (design D-22 to D-24, flow "Hide a container"; design 03 "Docker
     socket unreachable"). The list comes from the editor's read-only Docker connection (ADR-0005); the eye shows the
     outcome and writes only this widget's containers map. Containers hidden by a glance.hide label are read-only (D-23).
     Each row opens its settings in the same map (ADR-0026): icon (with the icon finder), name, URL, description, same tab;
     the container's own glance.* labels show greyed until set here. -->
<script lang="ts">
  import type { ModelWidgetT } from "@glance-editor/model";
  import { containerEntry, containerRows, emptyFields, iconTerm, iconUrl, plural, resolveWebui, setContainerField, setContainerVisible, type ContainerField, type ContainerInfo, type WidgetRef } from "@glance-editor/editing";
  import { api, type ContainersResult } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";

  let { app, wref, w, disabled }: { app: App; wref: WidgetRef; w: ModelWidgetT; disabled: boolean } = $props();

  let result = $state<ContainersResult | null>(null);
  // Ask Docker again whenever another docker-containers widget is opened, or its socket path changes. A path to another
  // server's Docker (tcp://, http(s)://) is asked directly, once the draft with it has reached the server.
  const wid = $derived(w._id);
  const sock = $derived(typeof (w as Record<string, unknown>)["sock-path"] === "string" ? String((w as Record<string, unknown>)["sock-path"]) : "");
  const remote = $derived(/^(tcp|https?):\/\//.test(sock));
  $effect(() => {
    void wid;
    const path = sock;
    result = null;
    let live = true;
    const t = setTimeout(() => {
      void app.settle()
        .then(() => api.containers(path || undefined))
        .then((r) => { if (live) result = r; })
        .catch((e: Error) => { if (live) result = { status: "unreachable", message: e.message }; });
    }, path ? 400 : 0);
    return () => { live = false; clearTimeout(t); };
  });

  const docker = $derived(result?.status === "ok" ? result.containers : null);
  const list = $derived(containerRows(w as Record<string, unknown>, docker));
  const info = (name: string): ContainerInfo | null => docker?.find((c) => c.name === name) ?? null;
  const toggle = (name: string, visible: boolean) =>
    app.editWidget(wref, (x) => setContainerVisible(x as Record<string, unknown>, name, visible, info(name)));
  const setField = (name: string, key: ContainerField, v: string | boolean | undefined) =>
    app.editWidget(wref, (x) => setContainerField(x as Record<string, unknown>, name, key, v));
  // What Glance uses for a setting: this widget's map, else the container's glance.* label (the map wins, ADR-0009).
  const value = (name: string, key: ContainerField): string => {
    const e = containerEntry(w as Record<string, unknown>, name);
    return e?.[key] !== undefined ? String(e[key]) : "";
  };
  const label = (name: string, key: ContainerField): string => info(name)?.glance[key] ?? "";
  // Previews come from the address Glance uses (Glance's default for a container is si:docker).
  let cdn = $state<string | undefined>(undefined);
  $effect(() => { void api.iconInfo().then((i) => (cdn = i.cdn)).catch(() => undefined); });
  const preview = (name: string) => {
    const v = value(name, "icon") || label(name, "icon") || "si:docker";
    return cdn ? iconUrl(v.replace(/^auto-invert /, ""), cdn) : null;
  };
  let open = $state<string | null>(null);
  const fid = (name: string) => `ct-${wid}-${name.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  // ADR-0027: icons and links from what the containers carry (Unraid's template icon and WebUI), names tidied. Only
  // empty settings are filled: the widget's map and the containers' own glance.* labels win.
  let filling = $state(false);
  let fillNotes = $state<string[]>([]);
  async function fill() {
    if (!docker) return;
    filling = true;
    fillNotes = [];
    const wr = w as Record<string, unknown>;
    // The server as the browser reaches it: another server's Docker by its socket path, this one by the editor's address.
    const server = remote ? new URL(sock.replace(/^tcp:/, "http:")).hostname : location.hostname;
    const r = await api.containerIcons(sock || undefined, docker.filter((c) => emptyFields(wr, c).icon).map((c) => c.name))
      .catch((e: Error) => ({ icons: {} as Record<string, string>, notes: [e.message] }));
    const urls = docker.flatMap((c) => {
      const u = emptyFields(wr, c).url ? resolveWebui(c, server) : null;
      return u ? [[c.name, u] as const] : [];
    });
    const icons = Object.entries(r.icons);
    const tidy = wr["format-container-names"] !== true;
    filling = false;
    fillNotes = r.notes;
    if (!icons.length && !urls.length && !tidy) {
      app.say("Nothing to fill in: every container already has an icon and a link, or Unraid doesn't give one.");
      return;
    }
    const done = [icons.length ? plural(icons.length, "icon") : "", urls.length ? plural(urls.length, "link") : "", tidy ? "names tidied" : ""].filter(Boolean);
    app.editWidget(wref, (x) => {
      const xr = x as Record<string, unknown>;
      for (const [n, v] of icons) setContainerField(xr, n, "icon", v);
      for (const [n, u] of urls) setContainerField(xr, n, "url", u);
      if (tidy) xr["format-container-names"] = true;
    }, { toast: `Filled in: ${done.join(", ")}`, undo: true });
  }

  function findIcon(name: string) {
    const c = info(name);
    app.sheet = {
      kind: "icon", label: "Icon", title: iconTerm(name, value(name, "name") || label(name, "name"), c?.image),
      url: value(name, "url") || label(name, "url"), current: value(name, "icon"),
      apply: (v) => setField(name, "icon", v),
      offers: c?.unraidIcon ? [{ value: c.unraidIcon, name: "Unraid's icon", note: "The icon Unraid shows for this container" }] : [],
    };
  }
</script>

<div class="rule"><span class="lbl">Containers</span></div>
{#if result === null}
  <p class="note pulse" style="margin: 0">Asking Docker for its containers…</p>
{:else}
  {#if result.status === "ok"}
    <p class="help" style="margin: 0 0 6px">{list.shown} of {list.rows.length} containers shown. The list comes from {remote ? `the Docker at ${sock}` : "this server's Docker"}; hiding writes to this widget’s containers map in glance.yml.</p>
    <div class="row wrap" style="gap: 8px; margin-bottom: 6px">
      <button type="button" class="btn" disabled={disabled || filling || !docker?.length} onclick={fill}>{filling ? "Filling in…" : "Fill in icons and links"}</button>
      <span class="help" style="margin: 0; flex: 1 1 220px">Each container's Unraid icon (downloaded into Glance's assets folder) or a library icon matching its image, and its Unraid web address. Only empty settings are filled; names are tidied.</span>
    </div>
    {#each fillNotes as n (n)}<p class="errtxt" style="margin: 0">{n}</p>{/each}
  {:else}
    <div class="notice" role="status" style="margin-bottom: 6px">
      <span><strong>Can't reach the Docker socket.</strong> Containers already named in the widget's map are still listed and can be toggled; new ones can't be discovered.</span>
      <span class="help" style="margin: 0">{result.status === "not-configured" ? "The editor has no Docker connection set up." : result.message}</span>
    </div>
  {/if}
  <div class="stack" style="gap: 6px">
    {#each list.rows as r (r.name)}
      {@const isOpen = open === r.name}
      {@const src = preview(r.name)}
      {@const id = fid(r.name)}
      <div class="blink" class:open={isOpen}>
        <div class="crow" style="box-shadow: none; background: transparent">
          <span class="cdot" class:run={r.state === "running"} class:stop={r.state !== "running"}></span>
          <span class="ichip" aria-hidden="true">{#if src}<img {src} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={(e) => ((e.currentTarget as HTMLElement).style.display = "none")} />{/if}</span>
          <button type="button" class="crowmain" style="padding: 6px 0 6px 6px" aria-expanded={isOpen} aria-label={`${r.name} settings`} onclick={() => (open = isOpen ? null : r.name)}>
            <span class="mono" style="color: var(--ink); display: block">{value(r.name, "name") || label(r.name, "name") || r.name}</span><span class="wsum" style="white-space: normal">{r.sub}</span>
          </button>
          {#if r.locked}
            <span class="lock">Label</span>
          {:else}
            <button type="button" class="ib" class:off={!r.visible} aria-pressed={r.visible} aria-label={`Show ${r.name}`} {disabled}
              onclick={() => toggle(r.name, !r.visible)}><Icon name={r.visible ? "eye" : "eyeoff"} size={20} /></button>
          {/if}
        </div>
        {#if isOpen}
          <div class="blinkbody">
            <p class="help" style="margin: 0 0 4px">Container <span class="mono">{r.name}</span>. Written to this widget's containers map; empty fields use the container's own glance.* labels.</p>
            <div class="field"><label class="flabel" for={`${id}-i`}>Icon</label>
              <div class="row"><input id={`${id}-i`} class="input mono grow" value={value(r.name, "icon")} placeholder={label(r.name, "icon") || "si:docker (Glance's default)"} {disabled}
                oninput={(e) => setField(r.name, "icon", e.currentTarget.value || undefined)} />
              <button type="button" class="btn" {disabled} aria-label={`Find icon for ${r.name}`} onclick={() => findIcon(r.name)}>Find</button></div></div>
            <div class="field"><label class="flabel" for={`${id}-n`}>Name</label>
              <input id={`${id}-n`} class="input" value={value(r.name, "name")} placeholder={label(r.name, "name") || r.name} {disabled}
                oninput={(e) => setField(r.name, "name", e.currentTarget.value || undefined)} /></div>
            <div class="field"><label class="flabel" for={`${id}-u`}>URL</label>
              <input id={`${id}-u`} class="input mono" value={value(r.name, "url")} placeholder={label(r.name, "url") || "https://…"} {disabled}
                oninput={(e) => setField(r.name, "url", e.currentTarget.value || undefined)} />
              <p class="help">Where the container's name links to on the dashboard.</p></div>
            <div class="field"><label class="flabel" for={`${id}-d`}>Description</label>
              <input id={`${id}-d`} class="input" value={value(r.name, "description")} placeholder={label(r.name, "description")} {disabled}
                oninput={(e) => setField(r.name, "description", e.currentTarget.value || undefined)} /></div>
            <div class="field row between"><span id={`${id}-s`}>Open in the same tab</span>
              <button type="button" class="tog" class:on={value(r.name, "same-tab") === "true"} aria-pressed={value(r.name, "same-tab") === "true"} aria-labelledby={`${id}-s`} {disabled}
                onclick={() => setField(r.name, "same-tab", value(r.name, "same-tab") === "true" ? undefined : true)}><span class="track"><span class="knob"></span></span></button></div>
          </div>
        {/if}
      </div>
    {/each}
    {#if !list.rows.length}<div class="empty">{result.status === "ok" ? "Docker reports no containers." : "No containers are named in this widget's map."}</div>{/if}
  </div>
{/if}
