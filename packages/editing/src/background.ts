// The background (design D-52, D-53; flow 9 step 4): image or slideshow, drawn by a CSS file the editor writes into
// Glance's assets folder on Save. Glance has no background setting; it links `theme.custom-css-file` (with
// `?v=<load time>`, so a new file shows after every reload) and inserts `document.head` as written (v0.8.6
// document.html, read 2026-10-14). These operations keep both in step with the settings in `glance-editor:`.
import type { BackgroundT, DashboardT } from "@glance-editor/model";

/** The editor's CSS file, as Glance links it. Preview builds use their own file, so Preview never changes live. */
export const BACKGROUND_CSS = "/assets/glance-editor/background.css";
export const PREVIEW_CSS = "/assets/glance-editor/preview.css";
/** Folder inside the assets folder that the editor owns. */
export const EDITOR_ASSETS = "glance-editor";
export const BACKGROUNDS = "glance-editor/backgrounds";

/** D-53: Shuffle needs a script, added through `document.head` only while Shuffle is chosen. */
export function slideshowTag(baseUrl = ""): string {
  return `<script src="${baseUrl.replace(/\/+$/, "")}/assets/glance-editor/slideshow.js" defer></script>`;
}
const TAG = /\s*<script src="[^"]*\/assets\/glance-editor\/slideshow\.js" defer><\/script>/g;

export const BACKGROUND_DEFAULTS = {
  interval: "15m", order: "in-order", transition: "fade", fit: "fill", dim: 30, blur: 0, surfaces: "solid",
} as const satisfies Partial<BackgroundT>;

export const background = (d: DashboardT): BackgroundT | undefined => d["glance-editor"]?.background;

/**
 * Bring `theme.custom-css-file` and `document.head` in line with the background settings. A custom CSS file of the
 * user's own is kept as `import-css` (the editor's file imports it, D-52) and put back when the background goes.
 */
export function syncBackground(d: DashboardT): void {
  const bg = background(d);
  const base = typeof d.server?.["base-url"] === "string" ? d.server["base-url"] : "";
  const css = d.theme?.["custom-css-file"];
  if (bg) {
    if (css !== undefined && css !== BACKGROUND_CSS && bg["import-css"] === undefined) bg["import-css"] = css;
    d.theme = { ...d.theme, "custom-css-file": BACKGROUND_CSS };
  }
  const head = (d.document?.head ?? "").replace(TAG, "");
  const want = bg?.mode === "slideshow" && bg.order === "shuffle";
  const next = want ? `${head}${head ? "\n" : ""}${slideshowTag(base)}` : head;
  if (next) d.document = { ...d.document, head: next };
  else if (d.document) {
    delete d.document.head;
    if (!Object.keys(d.document).some((k) => d.document![k as keyof typeof d.document] !== undefined)) delete d.document;
  }
}

/** D-52: Colour only (null), Image or Slideshow. Colour only removes the editor's file and settings. */
export function setBackgroundMode(d: DashboardT, mode: BackgroundT["mode"] | null): void {
  const bg = background(d);
  if (mode === null) {
    if (!bg) return;
    const own = bg["import-css"];
    if (d.theme?.["custom-css-file"] === BACKGROUND_CSS) {
      if (own !== undefined) d.theme = { ...d.theme, "custom-css-file": own };
      else {
        const { "custom-css-file": _gone, ...rest } = d.theme;
        d.theme = rest;
        if (!Object.keys(d.theme).length) delete d.theme;
      }
    }
    const ed = d["glance-editor"]!;
    delete ed.background;
    if (!Object.keys(ed).some((k) => ed[k as keyof typeof ed] !== undefined)) delete d["glance-editor"];
  } else {
    d["glance-editor"] = { ...d["glance-editor"], background: { ...(bg ?? {}), mode } };
  }
  syncBackground(d);
}

/** Change background settings in place, then keep the CSS file and the script in step. */
export function editBackground(d: DashboardT, fn: (bg: BackgroundT) => void): void {
  const bg = background(d);
  if (!bg) return;
  fn(bg);
  syncBackground(d);
}

/** Seconds per slide. */
export const intervalSeconds = (i: BackgroundT["interval"]) => ({ "1m": 60, "5m": 300, "15m": 900, "1h": 3600 })[i ?? BACKGROUND_DEFAULTS.interval];
