<!-- ADR-0029, ADR-0030: one value for a ${NAME}, kept in .env. A secret is hidden until the eye is pressed (the PM chose
     to allow showing stored values). A value already set loads into the field when shown; `text` is what's typed; null or
     undefined while untouched (no default: Svelte 5 refuses a fallback with bind to an undefined entry). With a community
     widget's field: a choice or yes/no is a list, an address is tidied when the field is left (http:// added, say). -->
<script lang="ts">
  import { tidyValue } from "@glance-editor/editing";
  import { api, type ValueInfo } from "../client/api.ts";
  import Icon from "./Icon.svelte";

  let { info, text = $bindable(), id, describedby }: { info: ValueInfo; text?: string | null | undefined; id: string; describedby?: string } = $props();
  const field = $derived(info.field);
  // svelte-ignore state_referenced_locally
  let shown = $state(!info.hidden);
  let loading = $state(false);

  async function load() {
    if (!info.set || text != null) return;
    loading = true;
    const r = await api.value(info.name).catch(() => ({ value: null }));
    loading = false;
    if (text == null && r.value !== null) text = r.value;
  }
  $effect(() => { if (shown || field?.kind === "choice" || field?.kind === "boolean") void load(); });

  const placeholder = $derived(loading ? "Loading…" : info.set ? (info.hidden ? "Set (hidden). Type to replace it." : "Set") : field?.example ? `Like ${field.example}` : "Not set");
  const choices = $derived(field?.kind === "boolean" ? ["true", "false"] : field?.kind === "choice" ? (field.choices ?? []) : null);
  const choiceLabel = (c: string) => (field?.kind === "boolean" ? (c === "true" ? "Yes" : "No") : c);
</script>

{#if choices}
  <select {id} class="input" aria-describedby={describedby} value={text ?? ""} onchange={(e) => (text = e.currentTarget.value)}>
    {#if text == null || text === ""}<option value="" disabled>{loading ? "Loading…" : info.set ? "Set" : "Choose…"}</option>{/if}
    {#if text && !choices.includes(text)}<option value={text}>{text}</option>{/if}
    {#each choices as c (c)}<option value={c}>{choiceLabel(c)}</option>{/each}
  </select>
{:else}
  <div class="row" style="gap: 6px">
    <input {id} class="input grow" class:mono={!field || field.kind !== "text"} type={!shown ? "password" : field?.kind === "date" ? "date" : "text"}
      inputmode={field?.kind === "number" ? "decimal" : field?.kind === "url" || field?.kind === "host" ? "url" : undefined}
      autocomplete="off" spellcheck="false" aria-describedby={describedby}
      value={text ?? ""} {placeholder}
      oninput={(e) => (text = e.currentTarget.value)}
      onchange={(e) => { if (field?.kind === "url" || field?.kind === "host") { const t = tidyValue(field.kind, e.currentTarget.value); if (t !== e.currentTarget.value) { text = t; e.currentTarget.value = t; } } }} />
    {#if info.hidden}
      <button type="button" class="ib" aria-label={shown ? `Hide ${field?.label ?? info.name}` : `Show ${field?.label ?? info.name}`} aria-pressed={shown} onclick={() => (shown = !shown)}>
        <Icon name={shown ? "eyeoff" : "eye"} size={20} />
      </button>
    {/if}
  </div>
{/if}
