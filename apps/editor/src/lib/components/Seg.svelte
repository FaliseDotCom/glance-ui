<!-- Segmented control (design: .seg). Options can be disabled; their reason is shown by the caller (D-07). -->
<script lang="ts" generics="T">
  import type { Option } from "@glance-editor/editing";
  let { options, value, label, onpick }: { options: Option<T>[]; value: T; label: string; onpick: (v: T) => void } = $props();
</script>

<div class="seg" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" class:on={o.value === value} aria-pressed={o.value === value} disabled={o.disabled} title={o.why || undefined}
      onclick={() => o.value !== value && onpick(o.value)}>{o.label}</button>
  {/each}
</div>
