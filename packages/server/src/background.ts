// The background's files (design D-52, D-53, D-59, D-60; ADR-0021): images stored in Glance's assets folder, server
// folders mounted into the editor, and the CSS (and Shuffle script) written on Save and on Preview.
//
// How the CSS draws (Glance v0.8.6 main.css/site.css, read 2026-10-14): `html` has no background, so `body`'s colour
// is painted on the canvas, and fixed `body::before` (image) and `body::after` (dim) at z-index -1 sit between the
// canvas and the page. Widgets are painted with `--color-widget-background`; see-through surfaces give it an alpha.
// URLs in the CSS are relative to the CSS file, so they work under any base URL (the preview's `/preview` too).
import { createHash } from "node:crypto";
import { access, constants, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, posix, sep } from "node:path";
import type { BackgroundT, EditorSectionT } from "@glance-editor/model";
import { BACKGROUND_DEFAULTS, BACKGROUNDS, EDITOR_ASSETS, intervalSeconds } from "@glance-editor/editing";
import { sniff } from "./icons.ts";

export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_FOLDER_IMAGES = 200;

export type Problemish = { code: string; message: string };

/** `glance-editor/backgrounds/x.jpg` → `backgrounds/x.jpg`: a URL relative to the CSS file in `glance-editor/`. */
export const cssUrl = (file: string) => posix.relative(EDITOR_ASSETS, file);

const q = (s: string) => `"${s.replace(/["\\\n]/g, (c) => (c === "\n" ? "" : `\\${c}`))}"`;

/** The editor's CSS for a background with these image files (paths inside the assets folder). Pure. */
export function backgroundCss(bg: BackgroundT, files: readonly string[]): string {
  const o = { ...BACKGROUND_DEFAULTS, ...bg };
  // Image mode: `files` holds the one chosen image (resolveImages); a slideshow, every slide.
  const slides = bg.mode === "slideshow" ? files : files.slice(0, 1);
  const urls = slides.map((f) => `url(${q(cssUrl(f))})`);
  const lines: string[] = [];
  const whole = o.fit === "whole";
  const size = whole ? "contain" : "cover";
  const position = whole && o.align === "top" ? "center top" : "center";
  const blurred = whole && o.around === "blurred";
  const blur = o.blur ?? 0;
  const n = urls.length;
  const shuffle = bg.mode === "slideshow" && o.order === "shuffle";
  const animated = bg.mode === "slideshow" && n > 1 && !shuffle;
  // ADR-0026: as tall as the window ever gets (lvh). On a phone the window's height changes while the address bar
  // slides in and out; a layer sized to it moved or re-scaled the image as you scrolled. vh first, for older browsers.
  const layer = (out: number) => [
    '  content: "";',
    "  position: fixed;",
    `  top: ${out ? `-${out}px` : "0"};`,
    `  left: ${out ? `-${out}px` : "0"};`,
    `  right: ${out ? `-${out}px` : "0"};`,
    `  height: calc(100vh + ${2 * out}px);`,
    `  height: calc(100lvh + ${2 * out}px);`,
    "  z-index: -1;",
    "  pointer-events: none;",
  ];
  const animation = () => {
    const t = intervalSeconds(o.interval);
    return [`  animation: glance-editor-slides ${n * t}s infinite${o.transition === "cut" ? " step-end" : " linear"};`];
  };
  if (blurred) {
    // ADR-0026: behind a whole image, a blurred copy of it fills the window. html::before is painted before (under) body::before.
    lines.push("html::before {", ...layer(60), `  background: ${urls[0] ?? "none"} center / cover no-repeat;`, "  filter: blur(30px);",
      ...(animated ? animation() : []), "}");
  }
  lines.push(
    "body::before {",
    ...layer(blur * 2),
    `  background: ${urls[0] ?? "none"} ${position} / ${size} no-repeat${blurred ? "" : ", var(--color-background)"};`,
    ...(blur ? [`  filter: blur(${blur}px);`] : []),
  );
  // In order, CSS alone (D-53): one keyframe set over the whole cycle. Each image holds for its interval; with Fade the
  // last 2 s (or a quarter of the interval) cross-fade where the browser interpolates background-image (Chromium);
  // elsewhere it cuts.
  if (animated) lines.push(...animation());
  lines.push("}");
  if (animated) {
    const t = intervalSeconds(o.interval);
    const fade = o.transition === "cut" ? 0 : Math.min(2, t / 4) / (n * t);
    const pct = (x: number) => `${+(x * 100).toFixed(4)}%`;
    lines.push("@keyframes glance-editor-slides {");
    urls.forEach((u, i) => {
      const from = i / n, to = (i + 1) / n - fade;
      lines.push(`  ${pct(from)}, ${pct(to)} { background-image: ${u}; }`);
    });
    lines.push(`  100% { background-image: ${urls[0]}; }`, "}");
  }
  if (shuffle) {
    // Shuffle: the script (slideshow.js) reads these and cross-fades two layers above body::before.
    lines.push(":root {", `  --glance-editor-slides: ${q(slides.map(cssUrl).join("|"))};`, `  --glance-editor-interval: ${intervalSeconds(o.interval)};`,
      `  --glance-editor-fade: ${o.transition === "cut" ? 0 : 1};`, `  --glance-editor-fit: ${size};`, `  --glance-editor-blur: ${blur}px;`,
      `  --glance-editor-position: ${position};`, `  --glance-editor-around: ${blurred ? "blurred" : "colour"};`, "}");
  }
  if (o.dim) {
    lines.push("body::after {", ...layer(0), `  background: rgba(0, 0, 0, ${(o.dim / 100).toFixed(2)});`, "}");
  }
  if (o.surfaces === "see-through") {
    lines.push(":root {", "  --color-widget-background: hsla(var(--color-widget-background-hsl-values), 0.72);", "}");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * ADR-0026: no lines between list items (Docker containers, Monitor, Bookmarks, Markets) or between bookmark groups.
 * The selectors are Glance's own (v0.8.6 utils.css 102-106, 130-134, 273-276, read 2026-10-14); the spacing stays.
 */
export const NO_LINES_CSS = `.list.list-with-separator > *:not(:first-child),
.dynamic-columns.list-with-separator > *:not(:first-child) {
  border-top: none;
}
.dynamic-columns > * {
  border-left: none;
}
`;

/**
 * ADR-0034: compact widgets. A widget's title goes inside the top of its box, so stacked boxes are --widget-gap apart,
 * as columns are. Only widgets with a box: Glance draws no box for frameless ones (search, videos, cards, iframe, split
 * column, group), whose titles stay above. Glance's markup and variables: v0.8.6 widget-base.html, widgets.css 57-75
 * (read 2026-10-28). Glance pads a title 1 px more than its box's text, for the box's border; inside, it needs no more.
 * A browser without :has() keeps Glance's look.
 */
export const COMPACT_CSS = `@supports selector(:has(*)) {
  .widget-header:has(+ .widget-content:not(.widget-content-frameless)) {
    margin-bottom: 0;
    padding: var(--widget-content-vertical-padding) var(--widget-content-horizontal-padding) 0.4rem;
    background: var(--color-widget-background);
    border: 1px solid var(--color-widget-content-border);
    border-bottom: none;
    border-radius: var(--border-radius) var(--border-radius) 0 0;
  }
  .widget-header + .widget-content:not(.widget-content-frameless) {
    padding-top: 0.4rem;
    border-top: none;
    border-radius: 0 0 var(--border-radius) var(--border-radius);
  }
}
`;

/** Does a look setting need the editor's CSS file (hidden lines, compact widgets)? */
const lookNeedsCss = (ed: EditorSectionT): boolean => !!ed["hide-lines"] || !!ed["compact-widgets"];

/** The editor's whole CSS file: the user's own file first, then the background, then the look settings. Pure. */
export function editorCss(ed: EditorSectionT, files: readonly string[]): string {
  const parts = ["/* Written by Glance Editor (design D-52, ADR-0026). It is rewritten on every save: change it on the Theme screen. */\n"];
  const own = ed["import-css"] ?? ed.background?.["import-css"];
  if (own) parts.push(`@import url(${q(own)});\n`);
  if (ed.background) parts.push(backgroundCss(ed.background, files));
  if (ed["hide-lines"]) parts.push(NO_LINES_CSS);
  if (ed["compact-widgets"]) parts.push(COMPACT_CSS);
  return parts.join("");
}

/** D-53 Shuffle: a random order, cross-faded with two layers. Static: the slides come from the CSS. */
export const SLIDESHOW_JS = `// Written by Glance Editor (design D-53): the background slideshow in random order. The images are listed in the
// editor's CSS file (--glance-editor-slides).
(() => {
  const css = getComputedStyle(document.documentElement);
  const get = (n) => css.getPropertyValue(n).trim().replace(/^"|"$/g, "");
  const list = get("--glance-editor-slides").split("|").filter(Boolean);
  const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href.includes("/glance-editor/"));
  if (list.length < 2 || !link) return;
  const urls = list.map((u) => new URL(u, link.href).href);
  for (let i = urls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [urls[i], urls[j]] = [urls[j], urls[i]]; }
  const seconds = Number(get("--glance-editor-interval")) || 900;
  const fade = get("--glance-editor-fade") === "1";
  const blur = get("--glance-editor-blur");
  const blurred = get("--glance-editor-around") === "blurred";
  // As tall as the window ever gets (ADR-0026), so a phone's address bar doesn't move the image.
  const fixed = (out) => ({ position: "fixed", top: -out + "px", left: -out + "px", right: -out + "px", height: "calc(100lvh + " + 2 * out + "px)",
    pointerEvents: "none", backgroundRepeat: "no-repeat" });
  const layers = [0, 1].map(() => {
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.className = "glance-editor-slide";
    Object.assign(el.style, { position: "fixed", inset: "0", zIndex: "-1", pointerEvents: "none", opacity: "0", transition: fade ? "opacity 2s" : "none" });
    const parts = [];
    if (blurred) {
      const back = document.createElement("div");
      Object.assign(back.style, fixed(60), { backgroundPosition: "center", backgroundSize: "cover", filter: "blur(30px)" });
      parts.push(back);
    }
    const front = document.createElement("div");
    Object.assign(front.style, fixed(blur === "0px" ? 0 : 40), { backgroundPosition: get("--glance-editor-position") || "center",
      backgroundSize: get("--glance-editor-fit") || "cover", filter: blur === "0px" ? "" : "blur(" + blur + ")" });
    parts.push(front);
    el.append(...parts);
    document.body.prepend(el);
    return { el, parts };
  });
  let i = 0, top = 0;
  const show = () => {
    const next = layers[1 - top];
    for (const p of next.parts) p.style.backgroundImage = 'url("' + urls[i % urls.length] + '")';
    next.el.style.opacity = "1";
    layers[top].el.style.opacity = "0";
    top = 1 - top;
    i++;
  };
  show();
  setInterval(show, seconds * 1000);
})();
`;

/**
 * ADR-0026: an Edit link in the dashboard's menu, to the editor's address in this script's data-editor attribute, on
 * the page being shown. Glance v0.8.6 has no setting for menu links; this uses its header (page.html 18-56: the theme
 * picker in .header) and phone menu (.mobile-navigation-actions, 70-90). If they aren't there, it adds nothing.
 */
export const EDIT_LINK_JS = `// Written by Glance Editor (ADR-0026): the Edit link in the dashboard's menu.
(() => {
  const me = document.currentScript || document.querySelector('script[src*="/glance-editor/edit-link.js"]');
  const editor = me && me.dataset.editor;
  if (!editor) return;
  const current = document.querySelector(".nav-item-current");
  const slug = current ? decodeURIComponent((current.getAttribute("href") || "").split("/").pop() || "") : "";
  let href;
  try { href = new URL(slug ? "?page=" + encodeURIComponent(slug) : "", editor.replace(/\\/*$/, "/")).href; } catch { return; }
  const pencil = '<svg class="ui-icon" stroke="var(--color-text-subdue)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>';
  const header = document.querySelector(".header-container .header");
  if (header) {
    const a = document.createElement("a");
    a.className = "glance-editor-edit block self-center";
    a.href = href;
    a.title = "Edit this dashboard";
    a.setAttribute("aria-label", "Edit this dashboard");
    a.style.cssText = "display:flex;align-items:center;justify-content:center;width:3.2rem;height:3.2rem;margin-left:1rem";
    a.innerHTML = pencil;
    header.append(a);
  }
  const actions = document.querySelector(".mobile-navigation-actions");
  if (actions) {
    const a = document.createElement("a");
    a.className = "glance-editor-edit flex justify-between items-center";
    a.href = href;
    a.innerHTML = '<div class="size-h3">Edit dashboard</div>' + pencil;
    actions.append(a);
  }
})();
`;

/** Store image bytes as `glance-editor/backgrounds/<sha256-12>.<ext>` (the same image is stored once). */
export async function storeImage(assetsDir: string, data: Buffer): Promise<{ file: string } | { error: string }> {
  if (data.length > MAX_IMAGE_BYTES) return { error: "The image is larger than 30 MB." };
  const kind = sniff(data);
  if (!kind || kind === "svg" || kind === "ico") return { error: "That file isn't a JPEG, PNG, WebP or GIF image." };
  const name = `${createHash("sha256").update(data).digest("hex").slice(0, 16)}.${kind}`;
  const dir = join(assetsDir, BACKGROUNDS);
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  try {
    await access(path);
  } catch {
    await writeFile(`${path}.tmp`, data);
    await rename(`${path}.tmp`, path);
  }
  return { file: `${BACKGROUNDS}/${name}` };
}

// ---- server folders (D-59, D-60) ------------------------------------------------------------------------------------

export interface FolderEntry {
  name: string;
  path: string;
  dir: boolean;
  /** Folders: images directly inside. Files: bytes. */
  images?: number;
  size?: number;
}

/** A path inside one of the mounted roots, resolved (symlinks too), or null. */
export async function insideRoots(roots: readonly string[], path: string): Promise<string | null> {
  try {
    const real = await realpath(path);
    for (const r of roots) {
      const root = await realpath(r).catch(() => null);
      if (root && (real === root || real.startsWith(root + sep))) return real;
    }
  } catch { /* missing */ }
  return null;
}

const isImage = (name: string) => IMAGE_EXTS.has(extname(name).toLowerCase()) && !name.startsWith(".");

export async function listFolder(roots: readonly string[], path: string): Promise<FolderEntry[] | null> {
  const real = await insideRoots(roots, path);
  if (!real) return null;
  const out: FolderEntry[] = [];
  for (const e of await readdir(real, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(path, e.name);
    if (e.isDirectory()) {
      const n = await readdir(join(real, e.name)).then((xs) => xs.filter(isImage).length, () => 0);
      out.push({ name: e.name, path: p, dir: true, images: n });
    } else if (e.isFile() && isImage(e.name)) {
      out.push({ name: e.name, path: p, dir: false, size: (await stat(join(real, e.name))).size });
    }
  }
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

/** Copy server images into the assets folder. */
export async function copyImages(roots: readonly string[], assetsDir: string, paths: readonly string[]): Promise<{ file: string; name: string }[] | { error: string }> {
  const out: { file: string; name: string }[] = [];
  for (const p of paths) {
    const real = await insideRoots(roots, p);
    if (!real || !isImage(real)) return { error: `${p} isn't an image in a folder mounted into the editor.` };
    const r = await storeImage(assetsDir, await readFile(real));
    if ("error" in r) return { error: `${basename(p)}: ${r.error}` };
    out.push({ file: r.file, name: basename(p) });
  }
  return out;
}

// ---- building on Save and Preview -----------------------------------------------------------------------------------

export interface BuildEnv {
  assetsDir: string | undefined;
  roots: readonly string[];
  /** A Pixabay set's pool files (D-62), in order. */
  poolFiles?: (set: string) => Promise<string[]>;
}

/** D-60: the images a background uses now: its files, and every image in its folders (copied into assets). */
export async function resolveImages(bg: BackgroundT, env: BuildEnv, copy: boolean): Promise<{ files: string[]; problems: Problemish[] }> {
  const files: string[] = [];
  const problems: Problemish[] = [];
  // Image mode shows one image: the chosen entry (a folder gives its first image, a Pixabay set its current one).
  const entries = bg.mode === "image" ? (bg.images ?? []).slice(bg.use ?? 0, (bg.use ?? 0) + 1) : (bg.images ?? []);
  for (const im of entries) {
    if (im.pixabay) {
      const pool = (await env.poolFiles?.(im.pixabay)) ?? [];
      if (!pool.length) problems.push({ code: "background.pixabay-empty", message: "The Pixabay set has no images yet. Open Add images → Pixabay and press Get new images." });
      else files.push(...(bg.mode === "image" ? [`glance-editor/pixabay/${im.pixabay}/current.jpg`] : pool));
      continue;
    }
    if (im.file) {
      if (!env.assetsDir) continue;
      const ok = await stat(join(env.assetsDir, im.file)).then((s) => s.isFile(), () => false);
      if (ok) files.push(im.file);
      else problems.push({ code: "background.missing-file", message: `The background image ${im.name ?? im.file} isn't in Glance's assets folder any more. Remove it, or add it again.` });
    } else if (im.folder) {
      const list = await listFolder(env.roots, im.folder);
      if (!list) {
        problems.push({ code: "background.folder-missing", message: `The folder ${im.folder} isn't mounted into the editor.` });
        continue;
      }
      const images = list.filter((e) => !e.dir).slice(0, bg.mode === "image" ? 1 : MAX_FOLDER_IMAGES);
      if (!images.length) problems.push({ code: "background.folder-empty", message: `The folder ${im.folder} has no images.` });
      if (copy && env.assetsDir) {
        const r = await copyImages(env.roots, env.assetsDir, images.map((e) => e.path));
        if ("error" in r) problems.push({ code: "background.copy", message: r.error });
        else files.push(...r.map((x) => x.file));
      } else files.push(...images.map((e) => `folder:${e.path}`));
    }
  }
  if (bg.mode === "slideshow" && !problems.length && files.length < 2) problems.push({ code: "background.slideshow-short", message: "A slideshow needs at least 2 images." });
  if (bg.mode === "image" && !problems.length && !files.length) problems.push({ code: "background.no-image", message: "Upload an image, or set the background back to Colour only." });
  return { files, problems };
}

/** Can the editor write the background's files? */
export async function assetsWritable(assetsDir: string | undefined): Promise<Problemish | null> {
  if (!assetsDir) return { code: "background.assets", message: "Couldn't store the background: the editor has no access to Glance's assets folder (ASSETS_DIR isn't set)." };
  try {
    await access(assetsDir, constants.W_OK);
    return null;
  } catch {
    return { code: "background.assets", message: "Couldn't store the background: Glance's assets folder isn't writable by the editor." };
  }
}

/**
 * Write the editor's files for a target: the CSS ("background.css" on Save, "preview.css" on Preview) when a background
 * or a look setting needs it, the Shuffle script and the Edit link script (ADR-0021, ADR-0026).
 */
export async function writeEditorFiles(ed: EditorSectionT, env: BuildEnv, cssName: "background.css" | "preview.css"): Promise<Problemish[]> {
  const w = await assetsWritable(env.assetsDir);
  if (w) return [w];
  const bg = ed.background;
  const { files, problems } = bg ? await resolveImages(bg, env, true) : { files: [], problems: [] };
  if (problems.length) return problems;
  const dir = join(env.assetsDir!, EDITOR_ASSETS);
  await mkdir(dir, { recursive: true });
  const put = async (name: string, text: string) => {
    await writeFile(join(dir, `.${name}.tmp`), text);
    await rename(join(dir, `.${name}.tmp`), join(dir, name));
  };
  if (bg || lookNeedsCss(ed)) await put(cssName, editorCss(ed, files));
  if (bg?.mode === "slideshow" && bg.order === "shuffle") await put("slideshow.js", SLIDESHOW_JS);
  if (ed["edit-link"]) await put("edit-link.js", EDIT_LINK_JS);
  return [];
}
