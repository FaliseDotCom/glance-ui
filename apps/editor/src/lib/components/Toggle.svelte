<!-- On/off switch (design: .tog) with a visible label. -->
<script lang="ts">
  let { on, label, id, ontoggle }: { on: boolean; label: string; id: string; ontoggle: () => void } = $props();
</script>

<div class="row">
  <button type="button" class="tog" class:on aria-pressed={on} aria-labelledby={id} onclick={ontoggle}><span class="track"><span class="knob"></span></span></button>
  <span {id}>{label}</span>
</div>
