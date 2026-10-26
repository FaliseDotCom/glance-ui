<!-- ADR-0029: Values. Every ${NAME} the dashboard uses, and every name in .env, with which widgets use it. Values are
     stored in .env next to glance.yml right away (not with Save): glance.yml keeps the placeholders, and the container
     restarts Glance with the new values within seconds. Names set in the container's own settings aren't listed.
     ADR-0030: a community widget's value shows its label and help; a value is stored only if Glance can still load the
     dashboard with it, and one the dashboard uses can't be removed. -->
<script lang="ts">
  import { api, type ValuesList } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import ValueRow from "./ValueRow.svelte";

  let { app }: { app: App } = $props();
  let list = $state<ValuesList | null>(null);
  let error = $state("");
  let typed = $state<Record<string, string | null>>({});
  let busy = $state<string | null>(null);
  // A value Glance can't load the dashboard with is refused (ADR-0030): the reason shows under that value.
  let refused = $state<{ name: string; message: string } | null>(null);

  async function load() {
    await app.settle();
    list = await api.values().catch((e: Error) => { error = e.message; return null; });
  }
  $effect(() => { void app.draft; void load(); });

  async function save(name: string, value: string | null) {
    busy = name;
    error = "";
    refused = null;
    try {
      list = await api.setValues({ [name]: value });
      typed = { ...typed, [name]: null };
      await app.reload(); // Review's "no value" warnings follow .env
      const label = list.values.find((x) => x.name === name)?.field?.label ?? name;
      app.say(value === null ? `Removed ${label}` : `Stored ${label}. Glance restarts with it in a few seconds.`);
    } catch (e) {
      refused = { name, message: (e as Error).message };
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
        <ValueRow info={v} {id} bind:text={typed[v.name]} note={`${v.set ? "Set" : "Not set"}${v.usedBy.length ? ` · used by ${v.usedBy.join(", ")}` : " · not used by any widget"}`}>
          <div class="row" style="gap: 8px; margin-top: 8px">
            <button type="button" class="btn pri" disabled={busy !== null || !typed[v.name]} onclick={() => save(v.name, typed[v.name] ?? "")}>Store</button>
            {#if v.set}<button type="button" class="btn ghost" disabled={busy !== null} onclick={() => save(v.name, null)}>Remove</button>{/if}
          </div>
          {#if refused?.name === v.name}<p class="errtxt" role="alert" style="margin: 6px 0 0">{refused.message}</p>{/if}
        </ValueRow>
      </div>
    {/each}
  </div>
{/if}
