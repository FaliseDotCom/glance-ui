<!-- The colour picker (design D-20): H/S/L sliders, a hex box and the system colour picker. "Use and add to my colours"
     also saves it as a round swatch available everywhere (D-51). Glance stores HSL, so that is what is written. -->
<script lang="ts">
  import { hexToHsl, hslCss, hslText, hslToHex, type Hsl } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";

  let { app, onuse }: { app: App; onuse: (value: string, save: boolean) => void } = $props();

  const pk = $derived(app.picker!);
  const p = $derived<Hsl>([pk.h, pk.s, pk.l]);
  const id = $derived(`pk-${pk.target.replace(/[^A-Za-z0-9_-]/g, "_")}`);
  const set = (i: 0 | 1 | 2, v: number) => {
    const next = [...p] as Hsl;
    next[i] = v;
    app.picker = { ...pk, h: next[0], s: next[1], l: next[2], hex: null };
  };
  const fromHex = (v: string) => {
    const q = hexToHsl(v);
    app.picker = q ? { ...pk, h: q[0], s: q[1], l: q[2], hex: v } : { ...pk, hex: v };
  };
  const done = (save: boolean) => {
    const v = hslText(p);
    app.picker = null;
    onuse(v, save);
  };
</script>

<div class="picker">
  <div class="row">
    <span class="swatch" style="width: 48px; height: 48px" style:background={hslCss(p)}></span>
    <span class="grow"><span class="mono" style="display: block; color: var(--ink)">{hslText(p)}</span><span class="help" style="margin: 0">HSL, as Glance stores it</span></span>
    <label class="syspick" title="System colour picker"><span class="sr">System colour picker</span>
      <input type="color" value={hslToHex(p)} oninput={(e) => fromHex(e.currentTarget.value)} /></label>
  </div>
  <label class="sl">H<input type="range" min="0" max="360" value={pk.h} aria-label="Hue" oninput={(e) => set(0, Number(e.currentTarget.value))} /><span>{pk.h}</span></label>
  <label class="sl">S<input type="range" min="0" max="100" value={pk.s} aria-label="Saturation" oninput={(e) => set(1, Number(e.currentTarget.value))} /><span>{pk.s}</span></label>
  <label class="sl">L<input type="range" min="0" max="100" value={pk.l} aria-label="Lightness" oninput={(e) => set(2, Number(e.currentTarget.value))} /><span>{pk.l}</span></label>
  <div>
    <label class="flabel" for={`${id}-hex`} style="font-size: 14px">Or paste a hex colour</label>
    <input id={`${id}-hex`} class="input mono" placeholder="#7ed6bc" value={pk.hex ?? hslToHex(p)} aria-invalid={pk.hex !== null && !hexToHsl(pk.hex)}
      oninput={(e) => fromHex(e.currentTarget.value)} />
    {#if pk.hex !== null && !hexToHsl(pk.hex)}<p class="errtxt">A hex colour has six digits, e.g. #7ed6bc.</p>{/if}
  </div>
  <div class="row wrap">
    <button type="button" class="btn pri" onclick={() => done(true)}>Use and add to my colours</button>
    <button type="button" class="btn" onclick={() => done(false)}>Use once</button>
    <button type="button" class="btn ghost" onclick={() => (app.picker = null)}>Cancel</button>
  </div>
</div>
