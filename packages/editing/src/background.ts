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

/** ADR-0026: the Edit link in the dashboard's menu, a script that reads the editor's address from its tag. */
export function editLinkTag(editor: string, baseUrl = ""): string {
  const attr = editor.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<script src="${baseUrl.replace(/\/+$/, "")}/assets/glance-editor/edit-link.js" data-editor="${attr}" defer></script>`;
}
const EDIT_TAG = /\s*<script src="[^"]*\/assets\/glance-editor\/edit-link\.js" data-editor="[^"]*" defer><\/script>/g;

export const BACKGROUND_DEFAULTS = {
  interval: "15m", order: "in-order", transition: "fade", fit: "fill", around: "colour", align: "center", dim: 30, blur: 0, surfaces: "solid",
} as const satisfies Partial<BackgroundT>;

export const background = (d: DashboardT): BackgroundT | undefined => d["glance-editor"]?.background;

/** Does the dashboard need the editor's CSS file (a background, or a look setting: hidden lines, compact widgets)? */
export const needsEditorCss = (d: DashboardT): boolean =>
  !!background(d) || d["glance-editor"]?.["hide-lines"] === true || d["glance-editor"]?.["compact-widgets"] === true;

/** The user's own custom CSS file, which the editor's file imports. Older files keep it under `background`. */
export const importedCss = (d: DashboardT): string | undefined => d["glance-editor"]?.["import-css"] ?? background(d)?.["import-css"];

/**
 * Bring `theme.custom-css-file` and `document.head` in line with the editor's settings (background D-52, D-53; lines
 * and the Edit link, ADR-0026). A custom CSS file of the user's own is kept as `import-css` (the editor's file imports
 * it) and put back when nothing needs the editor's file any more.
 */
export function syncBackground(d: DashboardT): void {
  const base = typeof d.server?.["base-url"] === "string" ? d.server["base-url"] : "";
  const css = d.theme?.["custom-css-file"];
  const bg = background(d);
  // Older files keep import-css under background; it moves up, where it doesn't depend on the background.
  if (bg?.["import-css"] !== undefined) {
    const own = bg["import-css"];
    delete bg["import-css"];
    if (d["glance-editor"]!["import-css"] === undefined) d["glance-editor"]!["import-css"] = own;
  }
  if (needsEditorCss(d)) {
    if (css !== undefined && css !== BACKGROUND_CSS && importedCss(d) === undefined) d["glance-editor"] = { ...d["glance-editor"], "import-css": css };
    d.theme = { ...d.theme, "custom-css-file": BACKGROUND_CSS };
  } else if (css === BACKGROUND_CSS) {
    const own = importedCss(d);
    if (own !== undefined) d.theme = { ...d.theme, "custom-css-file": own };
    else {
      const { "custom-css-file": _gone, ...rest } = d.theme!;
      d.theme = rest;
      if (!Object.keys(d.theme).length) delete d.theme;
    }
    if (d["glance-editor"]) delete d["glance-editor"]["import-css"];
  }
  const ed = d["glance-editor"];
  if (ed && !Object.keys(ed).some((k) => ed[k as keyof typeof ed] !== undefined)) delete d["glance-editor"];

  const head = (d.document?.head ?? "").replace(TAG, "").replace(EDIT_TAG, "");
  const tags = [
    ...(bg?.mode === "slideshow" && bg.order === "shuffle" ? [slideshowTag(base)] : []),
    ...(d["glance-editor"]?.["edit-link"] ? [editLinkTag(d["glance-editor"]["edit-link"], base)] : []),
  ];
  const next = [head, ...tags].filter(Boolean).join("\n");
  if (next) d.document = { ...d.document, head: next };
  else if (d.document) {
    delete d.document.head;
    if (!Object.keys(d.document).some((k) => d.document![k as keyof typeof d.document] !== undefined)) delete d.document;
  }
}

/** D-52: Colour only (null), Image or Slideshow. Colour only removes the background's settings. */
export function setBackgroundMode(d: DashboardT, mode: BackgroundT["mode"] | null): void {
  const bg = background(d);
  if (mode === null) {
    if (!bg) return;
    const ed = d["glance-editor"]!;
    if (bg["import-css"] !== undefined && ed["import-css"] === undefined) ed["import-css"] = bg["import-css"];
    delete ed.background;
  } else {
    d["glance-editor"] = { ...d["glance-editor"], background: { ...(bg ?? {}), mode } };
  }
  syncBackground(d);
}

/** ADR-0026, ADR-0034: the editor's look and menu settings, kept in step with its CSS file and scripts. */
export function setEditorOption(d: DashboardT, key: "hide-lines" | "compact-widgets" | "edit-link", value: boolean | string | undefined): void {
  const ed = { ...d["glance-editor"] } as Record<string, unknown>;
  if (value === undefined || value === false || value === "") delete ed[key];
  else ed[key] = value;
  d["glance-editor"] = ed as NonNullable<DashboardT["glance-editor"]>;
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
