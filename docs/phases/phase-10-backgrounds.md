# Phase 10: Backgrounds, server folders, Pixabay

**Status:** in two PRs. **10a** (background image and slideshow, this device, server folders): merged (PR #13).
**10b** (Pixabay, plus two fixes to 10a): merged (PR #14).
**Design:** design pass 1 (ADR-0016): flow 9 step 4, D-52, D-53, D-59, D-60 (10a); D-61, D-62 (10b, decided
2026-10-13: 1280 px; a local pool, downloaded only when you press "Get new images"); design 03 "Background
incomplete", "Server folder empty or not mounted", "Image upload fails", "Pixabay key rejected or limit reached".
**Architecture:** ADR-0021 (accepted, PR #13), ADR-0022 (Pixabay; accepted, PR #14).

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| Editor-owned CSS in assets, referenced by `theme.custom-css-file` (D-52) | ✅ 10a | `test/e2e/background.spec.ts`: glance.yml and `background.css` after Save; a user's own CSS file is imported (unit test) |
| Slideshow; the shuffle script via `document.head` only when Shuffle is chosen (D-53) | ✅ 10a | e2e "shuffle…": the script in head and in assets, two layers in Glance's page; gone again with In order |
| Image sources: device, server folder (D-59, D-60) | ✅ 10a | e2e: upload from this device; a server folder used whole, its images copied on Save |
| Background and slideshow render in Preview and live | ✅ | e2e reads pixels from screenshots: the image around the widgets (live), both slideshow images (live), the image in the Preview frame. **Dev Glance** (2026-10-14): an image set through the dev editor showed in Preview and on the dev Glance (pixel check); the dev dashboard was then restored to version 2 (byte-identical, saved as version 4) |
| Pixabay (D-61, D-62); API keys never reach the browser or glance.yml | ✅ 10b | `test/e2e/pixabay.spec.ts`: no response to the browser and no line of glance.yml contains the key; `packages/server/test/pixabay.test.ts` |

## Error and empty states (design 03)
| State | Where it is tested |
| ----- | ------------------ |
| Background incomplete: Image with no image ("Upload an image, or set the background back to Colour only."), slideshow with fewer than 2 | e2e (Save → Problems → Go to opens Theme); rules |
| Server folder not mounted: "No folders are mounted into the editor." with the setting to add | e2e "design 03 states" |
| Image upload fails: "Couldn't store the image: …" (no assets folder, not writable, not an image) | e2e; unit tests |
| A folder that is gone or empty, an image missing from assets, a Pixabay set not downloaded | unit tests (Save and Preview list it as a problem) |
| Pixabay key rejected ("Pixabay rejected this key. Check it and try again.") or limit reached ("Pixabay is refusing requests for now. Try again later.") | e2e (rejected); server test (both) |

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

## What was built (10b)
- **Server** (`packages/server/src/pixabay.ts`, `/api/pixabay/*`): the key (checked, stored in settings, masked),
  search (one request per chip, cached 24 h), picks downloaded with credits, the rotating set's pool and its hourly
  schedule (ADR-0022).
- **UI:** the Pixabay tab in Add images: category chips, the key, Keep a rotating set (count, switch period, Use this
  set), Pick images myself (words, results, Add); a set's row in the Background section with Get new images.
- **Fixes to 10a:** a change to the background alone (Dim, say) was not counted as a change, so Save had nothing to do
  (found while checking the dev Glance); in Image mode a folder entry could put the wrong image in use.

## Differences from the prototype, and why
- **"Use Glance's assets folder"** appears when glance.yml has no `server: assets-path` and the editor knows where the
  folder is. It sets the value in the draft; Review lists it. The design assumed the folder was set.
- **Images are named by their content** (`glance-editor/backgrounds/<hash>.png`), and the row shows the original name.
- **Thumbnails show the real image** (the prototype used striped placeholders).
- **Rotating set wording follows the decided D-62:** "Switch to the next image" (Daily/Weekly/Monthly/Never) instead of
  "Swap for new images", and the note says nothing is downloaded until you press Get new images.
- **"Images from Pixabay" is a full-size link** below the results (D-44's 44 px targets).
- **Get new images** sits on its own line under the set's row (on a phone the row had no room for it).

## Wording not in the design (for PM review)
"Your own CSS file (…) is still used: the editor's file imports it.", "Stored in Glance's assets folder", "Server folder
· new images in it are picked up on the next save", "Use Glance's assets folder (…)", "glance.yml doesn't set server:
assets-path, so Glance wouldn't serve a stored file.", "Uploading 1 of 3…", "Copying 2 images…", "Mount a folder into
the editor's container (read only is enough) and list it in its SERVER_FOLDERS setting…", "This folder has no images or
folders.", "The background image … isn't in Glance's assets folder any more. …", "The folder … isn't mounted into the
editor.", "The folder … has no images."

Pixabay wording not in the design: "Switch to the next image", "The editor downloads a set of images … when you press
the button below …", "Downloading 20 images…", "Added a Pixabay set of 20 images", "Rotating set · 20 images · switches
weekly", "Get new images", "Pixabay found no photos for these categories and words.", "Those results have expired.
Search again.", "The Pixabay set has no images yet. Open Add images → Pixabay and press Get new images."

## Open
- **For you to confirm (D-62):** in a slideshow every image of a Pixabay set is a slide, so the switch schedule only
  matters for a single background image (ADR-0022). Say if a slideshow should show part of the set and swap instead.
- Not tried with a real Pixabay key (Claude has none). On the dev editor: Theme → Background → Add images → Pixabay.
- Old background images and CSS files are never deleted (a restored version may still use them).
