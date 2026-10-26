<!-- ADR-0030: a value's label, its ${NAME}, a line of help and its field, as Add widget, the widget's settings panel and
     the Values screen show it. A name no community widget describes shows as itself. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ValueInfo } from "../client/api.ts";
  import ValueField from "./ValueField.svelte";

  let { info, id, text = $bindable(), note, children }: { info: ValueInfo; id: string; text?: string | null | undefined; note?: string; children?: Snippet } = $props();
  const f = $derived(info.field);
</script>

<div class="field" style="margin: 0">
  <div class="row between wrap" style="gap: 2px 8px">
    <label class="flabel" class:mono={!f} for={id} style="margin: 0">{f?.label ?? info.name}</label>
    {#if f || note}<span class="help" style="margin: 0">{#if f}<span class="mono">{`\${${info.name}}`}</span>{/if}{f && note ? " · " : ""}{note ?? ""}</span>{/if}
  </div>
  {#if f?.help}<p class="help" id={`${id}-help`} style="margin: 0 0 4px">{f.help}</p>{/if}
  <ValueField {info} {id} bind:text describedby={f?.help ? `${id}-help` : undefined} />
  {@render children?.()}
</div>
