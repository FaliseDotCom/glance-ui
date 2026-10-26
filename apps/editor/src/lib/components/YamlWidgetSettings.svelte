<!-- ADR-0030: the settings of a widget kept as YAML with no form behind it (a community widget): its title and cache,
     written into its YAML (only those lines change), and its values, stored in .env at once (as on the Values screen,
     checked with Glance first). ADR-0032: below them, whether its service answered, tried by the pinned Glance when the
     settings open and after each value is stored. -->
<script lang="ts">
  import { untrack } from "svelte";
  import { asksAService, glanceErrorReason, plural, setYamlKey, valueNames, type WidgetRef } from "@glance-editor/editing";
  import type { WidgetT } from "@glance-editor/model";
  import { api, type TryResult, type ValueInfo } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  import ValueRow from "./ValueRow.svelte";

  let { app, wref, w }: { app: App; wref: WidgetRef; w: WidgetT } = $props();

  const text = $derived(w._yaml?.text ?? "");
  const own = $derived(w as WidgetT & { title?: unknown; cache?: unknown });
  let keyError = $state<{ key: string; message: string } | null>(null);

  /** Title or cache: that line of the YAML changes, and the widget is read again from it, as Apply YAML does. */
  async function setKey(key: "title" | "cache", value: string) {
    keyError = null;
    const next = setYamlKey(text, key, value.trim());
    if (next === null || next === text) return;
    const r = await api.parseWidget(next, w._id).catch((e: Error) => ({ ok: false as const, message: e.message, line: null }));
    if (!r.ok) { keyError = { key, message: r.message }; return; }
    const form = w._yaml!.form;
    app.editWidget(wref, (x) => {
      for (const k of Object.keys(x)) delete (x as Record<string, unknown>)[k];
      Object.assign(x, r.widget, { _yaml: { text: next, form } });
    });
  }

  // Its values: as the editor knows them, reloaded when the YAML's names change and after each Store.
  const names = $derived(valueNames(text));
  let infos = $state<ValueInfo[] | null>(null);
  let typed = $state<Record<string, string | null>>({});
  let busy = $state<string | null>(null);
  let refused = $state<{ name: string; message: string } | null>(null);
  async function load(list: string[]) {
    if (!list.length) { infos = []; return; }
    await app.settle();
    const l = await api.values(list).catch(() => null);
    infos = l ? list.map((n) => l.values.find((x) => x.name === n)!).filter((x) => x && !(x.container && !x.set)) : [];
  }
  $effect(() => { void load(names); });
  async function store(name: string) {
    busy = name;
    refused = null;
    try {
      await api.setValues({ [name]: typed[name] ?? "" });
      typed = { ...typed, [name]: null };
      await load(names);
      await app.reload(); // Review's "no value" warnings follow .env
      const label = infos?.find((x) => x.name === name)?.field?.label ?? name;
      app.say(`Stored ${label}. Glance restarts with it in a few seconds.`);
      void tryIt();
    } catch (e) {
      refused = { name, message: (e as Error).message };
    } finally {
      busy = null;
    }
  }

  // ADR-0032: its service, asked as Glance asks it. Only the latest try counts.
  const asks = $derived(asksAService(text));
  let tried = $state<TryResult | null>(null);
  let trying = $state(false);
  let run = 0;
  async function tryIt() {
    const mine = ++run;
    trying = true;
    const r = await api.tryWidget(text).catch((e: Error): TryResult => ({ state: "not-tried", reason: e.message }));
    if (mine !== run) return;
    tried = r;
    trying = false;
  }
  $effect(() => {
    void w._id;
    untrack(() => {
      tried = null;
      if (asks) void tryIt();
    });
  });
</script>

<div class="field">
  <label class="flabel" for="yw-title">Title</label>
  <input id="yw-title" class="input" value={typeof own.title === "string" ? own.title : ""} autocomplete="off"
    aria-describedby={keyError?.key === "title" ? "yw-title-err" : undefined} onchange={(e) => setKey("title", e.currentTarget.value)} />
  {#if keyError?.key === "title"}<p class="errtxt" id="yw-title-err" role="alert" style="margin: 0">{keyError.message}</p>{/if}
</div>
<div class="field">
  <label class="flabel" for="yw-cache">Cache</label>
  <p class="help" id="yw-cache-help" style="margin: 0 0 4px">How long Glance keeps its data before fetching it again, like 30m or 1h. Empty: Glance's default.</p>
  <input id="yw-cache" class="input mono" value={typeof own.cache === "string" ? own.cache : ""} autocomplete="off" spellcheck="false"
    aria-describedby={keyError?.key === "cache" ? "yw-cache-help yw-cache-err" : "yw-cache-help"} onchange={(e) => setKey("cache", e.currentTarget.value)} />
  {#if keyError?.key === "cache"}<p class="errtxt" id="yw-cache-err" role="alert" style="margin: 0">{keyError.message}</p>{/if}
</div>

{#if names.length}
  <div class="rule"><span class="lbl">Values</span></div>
  <p class="help" style="margin: 0 0 6px">Kept in .env, not in glance.yml. Stored at once; Glance restarts with them in a few seconds.</p>
  {#if infos === null}
    <p class="note pulse" style="margin: 0">Loading…</p>
  {:else}
    <div class="stack" style="gap: 12px">
      {#each infos as info (info.name)}
        <ValueRow {info} id={`yw-${info.name}`} bind:text={typed[info.name]} note={`${info.set ? "Set" : "Not set"}${info.usedBy.length > 1 ? ` · shared with ${plural(info.usedBy.length - 1, "other widget")}` : ""}`}>
          <button type="button" class="btn" style="align-self: flex-start; margin-top: 6px" disabled={busy !== null || typed[info.name] == null}
            aria-label={`Store ${info.field?.label ?? info.name}`} onclick={() => store(info.name)}>Store</button>
          {#if refused?.name === info.name}<p class="errtxt" role="alert" style="margin: 6px 0 0">{refused.message}</p>{/if}
        </ValueRow>
      {/each}
    </div>
  {/if}
{/if}

{#if asks && tried?.state !== "nothing"}
  <div class="rule"><span class="lbl">Service</span></div>
  <div role="status">
    {#if trying}
      <p class="note pulse">Asking its service, as Glance does…</p>
    {:else if tried?.state === "answered"}
      <p class="note row" style="gap: 6px; align-items: flex-start"><span style="color: var(--accent); flex: none; margin-top: 2px"><Icon name="check" size={18} /></span>The service answered: Glance shows this widget without an error.</p>
    {:else if tried?.state === "failed"}
      <p class="errtxt row" style="gap: 6px; align-items: flex-start; margin: 0"><span style="flex: none; margin-top: 1px"><Icon name="alert" size={18} /></span>{glanceErrorReason(tried.error) ?? "Glance shows an error for this widget."}</p>
      <p class="help" style="margin: 6px 0 0; overflow-wrap: anywhere">Glance says: <span class="mono">{tried.error}</span></p>
    {:else if tried?.state === "not-tried"}
      <p class="note">Not tried: {tried.reason}</p>
    {/if}
  </div>
  <button type="button" class="btn" style="align-self: flex-start; margin-top: 8px" disabled={trying} onclick={tryIt}>Try again</button>
{/if}
