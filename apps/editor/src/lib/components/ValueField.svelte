<!-- ADR-0029: one value for a ${NAME}, kept in .env. A secret-looking name (token, key, password…) is hidden until the
     eye is pressed (the PM chose to allow showing stored values). A value already set loads into the field when shown;
     `text` is what's typed; null or undefined while untouched (no default: Svelte 5 refuses a fallback with bind to an
     undefined entry). -->
<script lang="ts">
  import { api, type ValueInfo } from "../client/api.ts";
  import Icon from "./Icon.svelte";

  let { info, text = $bindable(), id }: { info: ValueInfo; text?: string | null | undefined; id: string } = $props();
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
  $effect(() => { if (shown) void load(); });
</script>

<div class="row" style="gap: 6px">
  <input {id} class="input mono grow" type={shown ? "text" : "password"} autocomplete="off" spellcheck="false"
    value={text ?? ""} placeholder={loading ? "Loading…" : info.set ? "Set (hidden). Type to replace it." : "Not set"}
    oninput={(e) => (text = e.currentTarget.value)} />
  {#if info.hidden}
    <button type="button" class="ib" aria-label={shown ? `Hide ${info.name}` : `Show ${info.name}`} aria-pressed={shown} onclick={() => (shown = !shown)}>
      <Icon name={shown ? "eyeoff" : "eye"} size={20} />
    </button>
  {/if}
</div>
