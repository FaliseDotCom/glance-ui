<!-- ADR-0029: Values. Every ${NAME} the dashboard uses, and every name in .env, with which widgets use it. Values are
     stored in .env next to glance.yml right away (not with Save): glance.yml keeps the placeholders, and the container
     restarts Glance with the new values within seconds. Names set in the container's own settings aren't listed. -->
<script lang="ts">
  import { api, type ValuesList } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import ValueField from "./ValueField.svelte";

  let { app }: { app: App } = $props();
  let list = $state<ValuesList | null>(null);
  let error = $state("");
  let typed = $state<Record<string, string | null>>({});
  let busy = $state<string | null>(null);

  async function load() {
    await app.settle();
    list = await api.values().catch((e: Error) => { error = e.message; return null; });
  }
  $effect(() => { void app.draft; void load(); });

  async function save(name: string, value: string | null) {
    busy = name;
    error = "";
    try {
      list = await api.setValues({ [name]: value });
      typed = { ...typed, [name]: null };
      await app.reload(); // Review's "no value" warnings follow .env
      app.say(value === null ? `Removed ${name}` : `Stored ${name}. Glance restarts with it in a few seconds.`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = null;
    }
  }
</script>

<h1 class="h1">Values</h1>
<p class="note">Widgets often need an address, a key or a password, written as <span class="mono">{"${NAME}"}</span>. Their values are kept in <span class="mono">.env</span> next to glance.yml, not in glance.yml itself, so they stay out of History and shared configs. They're stored as soon as you press Store; Glance restarts with them within a few seconds.</p>
{#if error}<p class="errtxt" role="alert">{error}</p>{/if}
{#if !list}
  <p class="note pulse">Loading…</p>
{:else}
  {#if !list.applies}
    <div class="notice">In this setup Glance doesn't read <span class="mono">.env</span>: set these values where your Glance is started.</div>
  {/if}
  {#if !list.values.length}
    <div class="empty">Your dashboard doesn't use any <span class="mono">{"${NAME}"}</span> values. Community widgets that need one ask for it when you add them.</div>
  {/if}
  <div class="stack" style="gap: 10px; max-width: 760px">
    {#each list.values as v (v.name)}
      {@const id = `val-${v.name}`}
      <div class="panel" style="gap: 8px">
        <div class="row between wrap">
          <label class="flabel mono" for={id} style="margin: 0">{v.name}</label>
          <span class="help" style="margin: 0">{v.set ? "Set" : "Not set"}{v.usedBy.length ? ` · used by ${v.usedBy.join(", ")}` : " · not used by any widget"}</span>
        </div>
        <ValueField info={v} {id} bind:text={typed[v.name]} />
        <div class="row" style="gap: 8px">
          <button type="button" class="btn pri" disabled={busy !== null || !typed[v.name]} onclick={() => save(v.name, typed[v.name] ?? "")}>Store</button>
          {#if v.set}<button type="button" class="btn ghost" disabled={busy !== null} onclick={() => save(v.name, null)}>Remove</button>{/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
