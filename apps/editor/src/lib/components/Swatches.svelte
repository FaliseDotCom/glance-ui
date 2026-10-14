<!-- A row of colour swatches (design D-20, D-51, D-57): the palette, then "My colours" (round), and + for the picker.
     A "follow" choice (Same as primary, Theme primary) comes first where the colour can be left unset. -->
<script lang="ts">
  import { hslCss, hslParts, normHsl, swatches } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import Icon from "./Icon.svelte";
  import Picker from "./Picker.svelte";

  let { app, label, palette, current, follow, target, start, onpick, disabled = false }: {
    app: App;
    label: string;
    palette: string[];
    /** The colour set now (unset when following). */
    current: unknown;
    follow?: { label: string; on: boolean; pick: () => void };
    /** Identifies this row's picker (one picker is open at a time). */
    target: string;
    /** Where the picker starts. */
    start: string;
    onpick: (value: string) => void;
    disabled?: boolean;
  } = $props();

  const cur = $derived(follow?.on ? null : normHsl(current));
  const list = $derived(swatches(palette, app.colours, follow?.on ? undefined : current));
  function openPicker() {
    const p = hslParts(start) ?? [200, 50, 60];
    app.picker = app.picker?.target === target ? null : { target, h: p[0], s: p[1], l: p[2], hex: null };
  }
</script>

<div class="swrow" role="group" aria-label={label}>
  {#if follow}
    <button type="button" class="swb follow" class:on={follow.on} aria-pressed={follow.on} {disabled} onclick={follow.pick}>{follow.label}</button>
  {/if}
  {#each list as sw (sw.value)}
    <button type="button" class="swb" class:on={cur === sw.value} class:mine={sw.mine} style:background={hslCss(hslParts(sw.value)!)}
      aria-pressed={cur === sw.value} aria-label={`${sw.mine ? "My colour " : ""}${sw.value}`} title={`${sw.mine ? "My colour " : ""}${sw.value}`} {disabled}
      onclick={() => onpick(sw.value)}></button>
  {/each}
  <button type="button" class="swb add" aria-label="Add a colour with the picker" aria-expanded={app.picker?.target === target} title="Add a colour" {disabled} onclick={openPicker}><Icon name="plus" /></button>
</div>
{#if app.picker?.target === target}
  <Picker {app} onuse={(v, save) => { onpick(v); if (save && !app.colours.includes(v)) { void app.setColours([...app.colours, v]); app.say("Added to my colours"); } }} />
{/if}
