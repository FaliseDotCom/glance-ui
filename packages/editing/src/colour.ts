// Colours for the Theme screen and bookmark groups (design D-20, D-50, D-51, D-57, D-63). Glance stores colours as
// "H S L" (config-fields.go hslColorField); the editor writes whole numbers in that form.
//
// Glance's defaults, from v0.8.6 internal/glance/static/css/main.css lines 13-30 (read 2026-10-14): background
// 240 8 9, primary 43 50 70, positive = primary, negative 0 70 70, contrast and text saturation multipliers 1.
// The gallery's themes are the ones in Glance v0.8.6 docs/themes.md (GLANCE_THEMES, extracted in Phase 4).

import { GLANCE_THEMES, type DashboardT } from "@glance-editor/model";
import { newId } from "./layout.ts";

export type Hsl = [number, number, number];

/** "240 8 9" (also "hsl(240, 8%, 9%)", as Glance accepts) → [240, 8, 9], or null if it isn't a colour in range. */
export function hslParts(v: unknown): Hsl | null {
  if (typeof v !== "string") return null;
  const m = /^(?:hsla?\()?([\d.]+)(?: |,)+([\d.]+)%?(?: |,)+([\d.]+)%?\)?$/.exec(v.trim());
  if (!m) return null;
  const p = [Number(m[1]), Number(m[2]), Number(m[3])] as Hsl;
  return p[0] <= 360 && p[1] <= 100 && p[2] <= 100 ? p : null;
}

/** The editor's spelling of a colour: "H S L" with whole numbers. */
export const hslText = (p: Hsl) => p.map((x) => Math.round(x)).join(" ");
/** Same colour, same spelling (for comparing swatches). */
export const normHsl = (v: unknown): string | null => {
  const p = hslParts(v);
  return p ? hslText(p) : null;
};
export const hslCss = (p: Hsl) => `hsl(${p[0]} ${p[1]}% ${p[2]}%)`;

export function hslToHex([h, s, l]: Hsl): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

// ---- the theme's colours ------------------------------------------------------------------------------------------

export type ColourKey = "background-color" | "primary-color" | "positive-color" | "negative-color";
export type ThemeKey = ColourKey | "light" | "contrast-multiplier" | "text-saturation-multiplier";
export const THEME_KEYS: ThemeKey[] = ["light", "background-color", "primary-color", "positive-color", "negative-color", "contrast-multiplier", "text-saturation-multiplier"];

/** Glance v0.8.6's own values when a key is unset (main.css, see the header). Positive follows primary. */
export const GLANCE_DEFAULTS: Record<ColourKey, string | null> = {
  "background-color": "240 8 9",
  "primary-color": "43 50 70",
  "positive-color": null,
  "negative-color": "0 70 70",
};

export interface ThemeColour {
  key: ColourKey;
  label: string;
  /** "Used for: …" (D-20: each colour says what it is used for). Copy from the design prototype. */
  usedFor: string;
}

export const THEME_COLOURS: ThemeColour[] = [
  { key: "background-color", label: "Background", usedFor: "the page and the widgets on it." },
  { key: "primary-color", label: "Primary", usedFor: "accents across the page, mostly unvisited links. Also the default for Positive and for bookmark group colours." },
  { key: "positive-color", label: "Positive", usedFor: "good news: a stock price up, a Twitch channel live, a monitored site online." },
  { key: "negative-color", label: "Negative", usedFor: "the opposite of Positive, for example a monitored site offline, and server-stats bars when they turn red." },
];

/** Labels for every theme key the Theme screen edits (the Problems list names fields by these). */
export const THEME_LABELS: Record<ThemeKey, string> = {
  light: "Light theme",
  "background-color": "Background",
  "primary-color": "Primary",
  "positive-color": "Positive",
  "negative-color": "Negative",
  "contrast-multiplier": "Contrast multiplier",
  "text-saturation-multiplier": "Text saturation multiplier",
};

export interface GalleryTheme {
  name: string;
  light: boolean;
  properties: Readonly<Record<string, string | number | boolean>>;
}

/** D-50: "Glance default" (no theme keys), then the themes in Glance's docs. */
export const GALLERY: GalleryTheme[] = [{ name: "Glance default", light: false, properties: {} }, ...GLANCE_THEMES];

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
const themeValue = (t: GalleryTheme, k: ColourKey) => normHsl(t.properties[k] ?? (k === "positive-color" ? undefined : GLANCE_DEFAULTS[k]));

/** D-20: per role, the values the published themes use (Glance's default first). */
export const PALETTES: Record<ColourKey, string[]> = {
  "background-color": uniq(GALLERY.map((t) => themeValue(t, "background-color"))),
  "primary-color": uniq(GALLERY.map((t) => themeValue(t, "primary-color"))),
  "positive-color": uniq(GALLERY.map((t) => themeValue(t, "positive-color"))),
  "negative-color": uniq(GALLERY.map((t) => themeValue(t, "negative-color"))),
};

type Theme = NonNullable<DashboardT["theme"]>;

/** The colour in effect for a key: the theme's value, else Glance's default (positive falls back to primary). */
export function effective(theme: Theme | undefined, key: ColourKey): string {
  const v = normHsl(theme?.[key]);
  if (v) return v;
  if (key === "positive-color") return effective(theme, "primary-color");
  return GLANCE_DEFAULTS[key]!;
}

/** Is the draft's theme exactly this gallery theme (every key the gallery sets, and nothing else)? */
export function isGalleryTheme(theme: Theme | undefined, t: GalleryTheme): boolean {
  return THEME_KEYS.every((k) => {
    const mine = theme?.[k];
    const theirs = t.properties[k];
    if (k === "light") return (mine === true) === (theirs === true);
    if (k.endsWith("-color")) return normHsl(mine) === normHsl(theirs);
    return (mine === undefined ? undefined : Number(mine)) === (theirs === undefined ? undefined : Number(theirs));
  });
}

// ---- themes in the dashboard's menu (ADR-0026) ------------------------------------------------------------------------
// Glance's theme picker lists "default-dark" (when your theme differs from Glance's default), "default-light" and every
// `theme: presets:` entry (v0.8.6 glance.go 104-128, read 2026-10-14). Ticking a theme of Glance's docs writes it as a
// preset under its name in lower case with dashes; presets of your own are kept as written.

/** The preset key a docs theme is written under ("Catppuccin Frappe" → "catppuccin-frappe"). */
export const presetKey = (t: GalleryTheme) => t.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The docs themes that can be offered in the menu (all 14; "Glance default" is always there already). */
export const MENU_THEMES: readonly GalleryTheme[] = GLANCE_THEMES;

export const inMenu = (d: DashboardT | null | undefined, t: GalleryTheme) => !!d?.theme?.presets?.some((p) => p.key === presetKey(t));

/** Add a docs theme to the menu (as a preset) or take it out. Other presets stay as they are. */
export function setInMenu(d: DashboardT, t: GalleryTheme, on: boolean): void {
  const key = presetKey(t);
  const presets = (d.theme?.presets ?? []).filter((p) => p.key !== key);
  if (on) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t.properties)) props[k] = k.endsWith("-color") ? normHsl(v) ?? v : v;
    // In the docs' order among the docs themes already ticked; after presets of your own.
    const order = (k: string) => MENU_THEMES.findIndex((x) => presetKey(x) === k);
    const at = presets.findIndex((p) => order(p.key) > order(key));
    presets.splice(at < 0 ? presets.length : at, 0, { _id: newId("preset"), key, ...props } as (typeof presets)[number]);
  }
  const theme = { ...(d.theme ?? {}) };
  if (presets.length) theme.presets = presets;
  else delete theme.presets;
  if (Object.keys(theme).length) d.theme = theme;
  else delete d.theme;
}

/** D-50: applying a gallery theme sets all its keys and removes the theme keys it doesn't set. Other keys stay. */
export function applyGalleryTheme(d: DashboardT, t: GalleryTheme) {
  const theme: Theme = { ...(d.theme ?? {}) };
  for (const k of THEME_KEYS) {
    const v = t.properties[k];
    if (v === undefined || (k === "light" && v !== true)) delete theme[k];
    else (theme as Record<string, unknown>)[k] = k.endsWith("-color") ? normHsl(v) ?? v : v;
  }
  if (Object.keys(theme).length) d.theme = theme;
  else delete d.theme;
}

/** Set (or with null, remove) one theme key; an empty theme section is removed. */
export function setThemeKey(d: DashboardT, key: ThemeKey, value: string | number | boolean | null) {
  const theme: Theme = { ...(d.theme ?? {}) };
  if (value === null) delete theme[key];
  else (theme as Record<string, unknown>)[key] = value;
  if (Object.keys(theme).length) d.theme = theme;
  else delete d.theme;
}

// ---- swatches ---------------------------------------------------------------------------------------------------

export interface Swatch {
  value: string;
  /** One of the user's saved colours (D-51), drawn round. */
  mine: boolean;
}

/**
 * A swatch row: the palette, then the user's colours that aren't in it (D-51). A current value that is in neither is
 * shown first, so the current choice stays visible (D-57).
 */
export function swatches(palette: string[], mine: string[], current?: unknown): Swatch[] {
  const cur = normHsl(current);
  const extra = mine.filter((c) => !palette.includes(c));
  const out: Swatch[] = [...palette.map((value) => ({ value, mine: false })), ...extra.map((value) => ({ value, mine: true }))];
  if (cur && !out.some((s) => s.value === cur)) out.unshift({ value: cur, mine: false });
  return out;
}

/**
 * D-57: bookmark group swatches follow the active theme: its positive and negative (negative falls back to Glance's
 * default), then six hues rotated from the primary at a saturation and lightness kept readable on the theme's background.
 * The rotation is the editor's own (the design prototype's groupPalette), not from Glance's docs.
 */
export function groupPalette(theme: Theme | undefined): string[] {
  const out: string[] = [];
  const p = hslParts(effective(theme, "primary-color"))!;
  const pos = normHsl(theme?.["positive-color"]);
  if (pos) out.push(pos);
  out.push(effective(theme, "negative-color"));
  const sat = Math.max(p[1], 40);
  const light = theme?.light === true;
  const lig = light ? Math.min(Math.max(p[2], 25), 50) : Math.min(Math.max(p[2], 55), 80);
  for (const d of [45, 90, 150, 200, 250, 300]) {
    const v = hslText([(p[0] + d) % 360, sat, lig]);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}
