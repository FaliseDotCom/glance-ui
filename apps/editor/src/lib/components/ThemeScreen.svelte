<!-- Theme (design D-20, D-50, D-51, D-63; flow 9 steps 1-3): start from a theme in Glance's docs, then adjust each colour
     from swatches or the picker. Each colour says what it is used for. No colour sample (D-63): Preview is the way to see
     the result. The background (image, slideshow, D-52, D-53) is its own component; the dashboard's look and menu
     (ADR-0026: lines, themes in the menu as presets, the Edit link) too. -->
<script lang="ts">
  import {
    GALLERY, GLANCE_DEFAULTS, PALETTES, THEME_COLOURS, applyGalleryTheme, effective, hslCss, hslParts, isGalleryTheme, normHsl,
    parseMultiplier, setThemeKey, type ColourKey, type GalleryTheme,
  } from "@glance-editor/editing";
  import type { App } from "../client/app.svelte.ts";
  import Background from "./Background.svelte";
  import MenuAndLook from "./MenuAndLook.svelte";
  import Swatches from "./Swatches.svelte";
  import Toggle from "./Toggle.svelte";

  let { app }: { app: App } = $props();

  const theme = $derived(app.draft?.theme);
  const cardCss = (t: GalleryTheme, k: ColourKey) =>
    hslCss(hslParts(t.properties[k] ?? (k === "positive-color" ? t.properties["primary-color"] ?? GLANCE_DEFAULTS["primary-color"] : GLANCE_DEFAULTS[k]))!);

  function apply(t: GalleryTheme) {
    app.picker = null;
    app.mutate((d) => applyGalleryTheme(d, t), { toast: `Colours from ${t.name}`, undo: true });
  }
  const setColour = (k: ColourKey, v: string | null) => app.mutate((d) => setThemeKey(d, k, v));

  const multipliers = [
    { key: "contrast-multiplier", label: "Contrast multiplier", help: "Raises or lowers how visible text is." },
    { key: "text-saturation-multiplier", label: "Text saturation multiplier", help: "Raises or lowers how colourful text is." },
  ] as const;
  function setMultiplier(k: (typeof multipliers)[number]["key"], label: string, text: string) {
    const r = parseMultiplier(text);
    const key = `theme|${k}`;
    if (!r.ok) {
      app.setInputError(key, { text, message: r.message, label, location: { field: `theme.${k}` } });
      return;
    }
    app.setInputError(key, null);
    app.mutate((d) => setThemeKey(d, k, r.value ?? null));
  }
</script>

<h1 class="h1">Theme</h1>
<p class="note">Pick colours from the swatches, or add your own with the picker. Glance stores colours as HSL numbers; the editor writes them for you.</p>
<div class="themegrid">
  <div class="stack" style="gap: 14px">
    <div class="rule"><span class="lbl">Start from a theme</span></div>
    <p class="help" style="margin: 0">The themes published in Glance's docs. Applying one fills in every colour below; change anything afterwards.</p>
    <div class="thgal">
      {#each GALLERY as t (t.name)}
        {@const on = isGalleryTheme(theme, t)}
        <button type="button" class="thcard" class:on aria-pressed={on} style:background={cardCss(t, "background-color")} onclick={() => apply(t)}>
          <span class="row" style="gap: 4px" aria-hidden="true">
            <span class="dotc" style:background={cardCss(t, "primary-color")}></span>
            <span class="dotc" style:background={cardCss(t, "positive-color")}></span>
            <span class="dotc" style:background={cardCss(t, "negative-color")}></span>
          </span>
          <span style="font-weight: 600; font-size: 13px" style:color={t.light ? "#1b2228" : "#e9eef2"}>{t.name}</span>
        </button>
      {/each}
    </div>

    <div class="rule"><span class="lbl">Colours</span></div>
    <Toggle id="llight" label="Light theme (text colours are inverted for a light background)" on={theme?.light === true}
      ontoggle={() => app.mutate((d) => setThemeKey(d, "light", d.theme?.light === true ? null : true))} />
    {#each THEME_COLOURS as c (c.key)}
      {@const raw = theme?.[c.key]}
      {@const follow = c.key === "positive-color" && raw === undefined}
      {@const eff = effective(theme, c.key)}
      {@const mine = !follow && app.colours.includes(eff) && !PALETTES[c.key].includes(eff)}
      <div class="panel" style="gap: 10px" data-colour={c.key}>
        <div class="row between wrap">
          <span class="flabel" style="margin: 0" id={`lc-${c.key}`}>{c.label}</span>
          <span class="row">
            <span class="swatch" style:background={hslCss(hslParts(eff)!)}></span>
            <span class="mono">{follow ? "same as primary" : raw === undefined ? `${eff} (Glance's default)` : (normHsl(raw) ?? String(raw))}</span>
            <button type="button" class="btn ghost" disabled={raw === undefined} onclick={() => setColour(c.key, null)}>Reset</button>
          </span>
        </div>
        <p class="help" style="margin: 0">Used for: {c.usedFor}</p>
        {#if raw !== undefined && !normHsl(raw)}<p class="errtxt" style="margin: 0">This value isn't a colour the editor can show ({String(raw)}). Pick a swatch to replace it.</p>{/if}
        <Swatches {app} label={`${c.label} colours`} palette={PALETTES[c.key]} current={raw} target={`theme:${c.key}`} start={eff}
          follow={c.key === "positive-color" ? { label: "Same as primary", on: follow, pick: () => setColour(c.key, null) } : undefined}
          onpick={(v) => setColour(c.key, v)} />
        {#if mine}
          <button type="button" class="btn ghost" style="align-self: flex-start" onclick={() => app.setColours(app.colours.filter((x) => x !== eff))}>Remove this colour from my colours</button>
        {/if}
      </div>
    {/each}

    <div class="row wrap" style="gap: 14px; align-items: flex-start">
      {#each multipliers as m (m.key)}
        {@const key = `theme|${m.key}`}
        {@const typed = app.inputErrors[key]}
        <div class="field" style="flex: 1 1 200px; margin: 0">
          <label class="flabel" for={`tm-${m.key}`}>{m.label}</label>
          <input id={`tm-${m.key}`} class="input mono" inputmode="decimal" placeholder="1" value={typed?.text ?? (theme?.[m.key] === undefined ? "" : String(theme?.[m.key]))}
            aria-invalid={!!typed} aria-describedby={typed ? `tm-${m.key}-e` : undefined} oninput={(e) => setMultiplier(m.key, m.label, e.currentTarget.value)} />
          <p class="help">{m.help}</p>
          {#if typed}<p class="errtxt" id={`tm-${m.key}-e`}>{typed.message}</p>{/if}
        </div>
      {/each}
    </div>

    <Background {app} />
    <MenuAndLook {app} />
  </div>
</div>
