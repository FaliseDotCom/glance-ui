<!-- ADR-0029, ADR-0030: one value for a ${NAME}, kept in .env. A secret is hidden until the eye is pressed (the PM chose
     to allow showing stored values). A value already set loads into the field when shown; `text` is what's typed; null or
     undefined while untouched (no default: Svelte 5 refuses a fallback with bind to an undefined entry). With a community
     widget's field: a choice or yes/no is a list, an address is tidied when the field is left (http:// added, say).
     ADR-0032: where the field says so, a page's address is cut back to the server, or the value is taken out of a pasted
     address, and a line under the field says what changed. -->
<script lang="ts">
  import { tidyField } from "@glance-editor/editing";
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

  let tidied = $state<string | null>(null);
  function tidy(el: HTMLInputElement) {
    tidied = null;
    if (!field || !(field.kind === "url" || field.kind === "host" || field.extract)) return;
    const t = tidyField(field, el.value);
    if (t.value !== el.value) {
      text = t.value;
      el.value = t.value;
    }
    tidied = t.note ?? null;
  }
  const described = $derived([describedby, tidied ? `${id}-tidied` : ""].filter(Boolean).join(" ") || undefined);
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
      autocomplete="off" spellcheck="false" aria-describedby={described}
      value={text ?? ""} {placeholder}
      oninput={(e) => { text = e.currentTarget.value; tidied = null; }}
      onchange={(e) => tidy(e.currentTarget)} />
    {#if info.hidden}
      <button type="button" class="ib" aria-label={shown ? `Hide ${field?.label ?? info.name}` : `Show ${field?.label ?? info.name}`} aria-pressed={shown} onclick={() => (shown = !shown)}>
        <Icon name={shown ? "eyeoff" : "eye"} size={20} />
      </button>
    {/if}
  </div>
  <div role="status">{#if tidied}<p class="help" id={`${id}-tidied`} style="margin: 4px 0 0">{tidied}</p>{/if}</div>
{/if}
