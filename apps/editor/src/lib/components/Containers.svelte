<!-- Containers section of a docker-containers widget (design D-22 to D-24, flow "Hide a container"; design 03 "Docker
     socket unreachable"). The list comes from the editor's read-only Docker connection (ADR-0005); the eye shows the
     outcome and writes only this widget's containers map. Containers hidden by a glance.hide label are read-only (D-23). -->
<script lang="ts">
  import type { ModelWidgetT } from "@glance-editor/model";
  import { containerRows, setContainerVisible, type ContainerInfo, type WidgetRef } from "@glance-editor/editing";
  import { api, type ContainersResult } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";

  let { app, wref, w, disabled }: { app: App; wref: WidgetRef; w: ModelWidgetT; disabled: boolean } = $props();

  let result = $state<ContainersResult | null>(null);
  // Ask Docker again whenever another docker-containers widget is opened.
  const wid = $derived(w._id);
  $effect(() => {
    void wid;
    result = null;
    let live = true;
    api.containers()
      .then((r) => { if (live) result = r; })
      .catch((e: Error) => { if (live) result = { status: "unreachable", message: e.message }; });
    return () => { live = false; };
  });

  const docker = $derived(result?.status === "ok" ? result.containers : null);
  const list = $derived(containerRows(w as Record<string, unknown>, docker));
  const info = (name: string): ContainerInfo | null => docker?.find((c) => c.name === name) ?? null;
  const toggle = (name: string, visible: boolean) =>
    app.editWidget(wref, (x) => setContainerVisible(x as Record<string, unknown>, name, visible, info(name)));
</script>

<div class="rule"><span class="lbl">Containers</span></div>
{#if result === null}
  <p class="note pulse" style="margin: 0">Asking Docker for its containers…</p>
{:else}
  {#if result.status === "ok"}
    <p class="help" style="margin: 0 0 6px">{list.shown} of {list.rows.length} containers shown. The list comes from the Docker socket; hiding writes to this widget’s containers map in glance.yml.</p>
  {:else}
    <div class="notice" role="status" style="margin-bottom: 6px">
      <span><strong>Can't reach the Docker socket.</strong> Containers already named in the widget's map are still listed and can be toggled; new ones can't be discovered.</span>
      <span class="help" style="margin: 0">{result.status === "not-configured" ? "The editor has no Docker connection set up." : result.message}</span>
    </div>
  {/if}
  <div class="stack" style="gap: 6px">
    {#each list.rows as r (r.name)}
      <div class="crow">
        <span class="cdot" class:run={r.state === "running"} class:stop={r.state !== "running"}></span>
        <span class="grow" style="padding: 6px 0"><span class="mono" style="color: var(--ink); display: block">{r.name}</span><span class="wsum" style="white-space: normal">{r.sub}</span></span>
        {#if r.locked}
          <span class="lock">Label</span>
        {:else}
          <button type="button" class="ib" class:off={!r.visible} aria-pressed={r.visible} aria-label={`Show ${r.name}`} {disabled}
            onclick={() => toggle(r.name, !r.visible)}><Icon name={r.visible ? "eye" : "eyeoff"} size={20} /></button>
        {/if}
      </div>
    {/each}
    {#if !list.rows.length}<div class="empty">{result.status === "ok" ? "Docker reports no containers." : "No containers are named in this widget's map."}</div>{/if}
  </div>
{/if}
