# 0021. Background: the editor's own section in glance.yml, and its CSS file in Glance's assets folder

- **Status:** proposed (non-UX; accepted when the Phase 10 PR is merged, per the ADR README)
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** no new decision. The screens are the design's (D-52, D-53, D-59, D-60). This ADR is about where the
  settings live and how the files are written. One small addition is listed under Consequences.

## Context
- Glance v0.8.6 has no background setting. It links `theme.custom-css-file` as
  `<link rel="stylesheet" href="<file>?v=<time Glance loaded the config>">`, with the base URL in front of `/assets/`
  paths, and inserts `document.head` as written (`document.html` 27-29, `glance.go` 272-278; source read 2026-10-14).
  So a new CSS file is fetched after every reload, while `/assets/` files themselves are cached for 2 hours.
- `html` has no background in Glance's CSS, so `body`'s colour is painted on the canvas; widgets use
  `--color-widget-background` (`site.css`, `widgets.css`, `main.css`).
- Glance ignores an unknown top-level key: `config:validate` passes and the server starts with `glance-editor:` in
  the file (tested 2026-10-14).
- Background settings (images, interval, dim…) have no Glance key. If they lived only in the editor's database,
  History's Restore (which reloads a version's text) and a fresh import would lose them.
- Preview and live share Glance's assets folder.

## Decision
- **Settings** live in glance.yml under an editor-owned top-level key, `glance-editor:` → `background:` (mode,
  images, use, interval, order, transition, fit, dim, blur, surfaces, import-css). They travel with every version.
  The model reads and writes the section like any other; rules check it ("Background incomplete", design 03).
- **The CSS file:** `<assets>/glance-editor/background.css`, written on **Save**, before glance.yml, so the reloaded
  page never links a file that isn't there yet. `theme.custom-css-file` points at `/assets/glance-editor/background.css`.
  A custom CSS file the user already had is kept as `import-css`, imported at the top of the editor's file, and put
  back when the background is set to Colour only (D-52).
- **Preview** writes `<assets>/glance-editor/preview.css` and builds the preview with that file, so Preview never
  changes what the live dashboard links.
- **Drawing:** a fixed `body::before` at z-index -1 with the image (cover or contain, optional blur), a fixed
  `body::after` for dim, and an alpha on `--color-widget-background` for see-through surfaces. URLs in the CSS are
  relative to the file, so any base URL works (the preview's `/preview` too).
- **Slideshow, in order:** CSS only (D-53): one `@keyframes` over the whole cycle, switching `background-image`;
  with Fade the last 2 s of each slide cross-fade where the browser interpolates `background-image` (Chromium), and
  cut elsewhere. **Shuffle:** a static script, `<assets>/glance-editor/slideshow.js`, added to `document.head` only
  while Shuffle is chosen; it reads the image list from the CSS and cross-fades two layers.
- **Images:** stored as `<assets>/glance-editor/backgrounds/<sha256-16>.<ext>`, named by content. A changed image gets
  a new name, so the 2-hour cache never shows an old one. JPEG, PNG, WebP or GIF, recognised by their bytes, up to 30 MB.
  - **This device:** uploaded as `application/octet-stream` to `/api/backgrounds/upload`. This is the only
    non-JSON request the editor accepts; it is same-origin only, like JSON (ADR-0004). The Node server's body limit is
    raised to 32 MB (`BODY_SIZE_LIMIT`, adapter-node 6.0.0).
  - **Server folder (D-59, D-60):** folders mounted into the editor and listed in `SERVER_FOLDERS`, read only.
    Paths are resolved (symlinks too) and must stay inside a listed folder. Picked images are copied at once; a
    whole folder is copied on every Save and Preview, so new images in it appear on the next save.
- **Glance's assets folder:** `ASSETS_DIR` (as the editor sees it) and `GLANCE_ASSETS_PATH` (as Glance sees it).
  When the draft has no `server.assets-path`, the Background section and the icon finder offer "Use Glance's assets
  folder", which sets it in the draft. Review lists it like any change.

## Consequences
- glance.yml gains a `glance-editor:` section when a background is set. Glance ignores it; a hand edit is read back.
- The "Use Glance's assets folder" button is new (no design for it). It only sets a value the user then reviews and
  saves.
- Old images and CSS files are never deleted (a restored version may need them). Clearing them is a later task.
- If a future Glance rejects unknown keys, the section needs to move; a test (`packages/document/test/editor-section`)
  checks the pinned Glance accepts it.
- Deployment (Phase 11) mounts the assets folder into Glance, the preview Glance and the editor, sets
  `GLANCE_ASSETS_PATH`, and mounts any photo folders read-only into the editor with `SERVER_FOLDERS`.

## Verified vs assumed
- Verified, against the real Glance in a browser (`test/e2e/background.spec.ts`, Chromium, desktop and 390 px): the image shows around
  the widgets (pixel read from a screenshot); the in-order slideshow shows both images (animation clock moved); Shuffle's
  script shows an image; Preview shows the background from `preview.css` while `background.css` doesn't exist.
- Verified by unit tests: the CSS, the stored image names, the folder confinement, the problems.
- Not verified: Firefox and Safari (whether Fade cross-fades or cuts); very large folders; HEIC photos (not accepted).

## Decision record
_Accepted when the Phase 10 PR is merged (non-UX)._
