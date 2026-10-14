# Phase 10: Backgrounds, server folders, Pixabay (current phase)

**Status:** in two PRs. **10a** (background image and slideshow, this device, server folders): implemented on branch
`phase-10/backgrounds`, PR open, merged by Claude once CI is green (PM, 2026-10-14). **10b** (Pixabay) is next.
**Design:** design pass 1 (ADR-0016): flow 9 step 4, D-52, D-53, D-59, D-60 (10a); D-61, D-62 (10b, decided
2026-10-13: 1280 px; a local pool, downloaded only when you press "Get new images"); design 03 "Background
incomplete", "Server folder empty or not mounted", "Image upload fails", "Pixabay key rejected or limit reached".
**Architecture:** ADR-0021 (non-UX; accepted on merge).

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| Editor-owned CSS in assets, referenced by `theme.custom-css-file` (D-52) | ✅ 10a | `test/e2e/background.spec.ts`: glance.yml and `background.css` after Save; a user's own CSS file is imported (unit test) |
| Slideshow; the shuffle script via `document.head` only when Shuffle is chosen (D-53) | ✅ 10a | e2e "shuffle…": the script in head and in assets, two layers in Glance's page; gone again with In order |
| Image sources: device, server folder (D-59, D-60) | ✅ 10a | e2e: upload from this device; a server folder used whole, its images copied on Save |
| Background and slideshow render in Preview and live | ✅ 10a (test Glance) | e2e reads pixels from screenshots: the image around the widgets (live), both slideshow images (live), the image in the Preview frame. The dev Glance is checked with 10b |
| Pixabay (D-61, D-62); API keys never reach the browser or glance.yml | 10b | |

## Error and empty states (design 03)
| State | Where it is tested |
| ----- | ------------------ |
| Background incomplete: Image with no image ("Upload an image, or set the background back to Colour only."), slideshow with fewer than 2 | e2e (Save → Problems → Go to opens Theme); rules |
| Server folder not mounted: "No folders are mounted into the editor." with the setting to add | e2e "design 03 states" |
| Image upload fails: "Couldn't store the image: …" (no assets folder, not writable, not an image) | e2e; unit tests |
| A folder that is gone or empty, an image missing from assets | unit tests (Save and Preview list it as a problem) |

## What was built (10a)
- **Model:** `glance-editor:` → `background:` in glance.yml (ADR-0021), with rules for an incomplete background.
- **Editing:** `setBackgroundMode`, `editBackground`, `syncBackground` keep `theme.custom-css-file` and the Shuffle
  script in `document.head` in step with the settings.
- **Server:** `packages/server/src/background.ts`: the CSS, the Shuffle script, stored images named by content, server
  folders confined to `SERVER_FOLDERS`. Save writes `background.css` before glance.yml; Preview writes `preview.css`.
  Routes: `/api/backgrounds/upload`, `/api/backgrounds/copy`, `/api/folders`, `/api/folders/image`.
- **UI:** the Background section on the Theme screen (Colour only / Image / Slideshow, images with thumbnails,
  interval, order, transition, fit, dim, blur, widget surfaces) and the Add images sheet (This device, Server folder).
- **Dev environment:** `GLANCE_ASSETS_PATH=/app/assets` for the editor.

## Differences from the prototype, and why
- **"Use Glance's assets folder"** appears when glance.yml has no `server: assets-path` and the editor knows where the
  folder is. It sets the value in the draft; Review lists it. The design assumed the folder was set.
- **Images are named by their content** (`glance-editor/backgrounds/<hash>.png`), and the row shows the original name.
- **Thumbnails show the real image** (the prototype used striped placeholders).
- **Pixabay** isn't a tab yet (10b).

## Wording not in the design (for PM review)
"Your own CSS file (…) is still used: the editor's file imports it.", "Stored in Glance's assets folder", "Server folder
· new images in it are picked up on the next save", "Use Glance's assets folder (…)", "glance.yml doesn't set server:
assets-path, so Glance wouldn't serve a stored file.", "Uploading 1 of 3…", "Copying 2 images…", "Mount a folder into
the editor's container (read only is enough) and list it in its SERVER_FOLDERS setting…", "This folder has no images or
folders.", "The background image … isn't in Glance's assets folder any more. …", "The folder … isn't mounted into the
editor.", "The folder … has no images."

## Open
- 10b: Pixabay.
- Old background images and CSS files are never deleted (a restored version may still use them).
