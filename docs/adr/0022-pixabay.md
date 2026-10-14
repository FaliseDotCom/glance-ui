# 0022. Pixabay: key on the server, cached search, downloaded picks, a local rotating set

- **Status:** proposed (non-UX; accepted when the Phase 10b PR is merged, per the ADR README)
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** the screens follow D-61 and D-62 as decided on 2026-10-13. One reading of D-62 is noted under
  Consequences for the PM to confirm.

## Context
- Pixabay API (docs read 2026-10-14, pixabay.com/api/docs; unchanged since the 2026-10-13 reading in the
  reconciliation):
  - `GET https://pixabay.com/api/?key=…`, one `category` per request from a fixed list of 20;
  - 100 requests per 60 s per key; requests must be cached for 24 h;
  - no permanent hotlinking: download first; show where search results come from;
  - `largeImageURL` is at most 1280 px without full API access.
- Tested 2026-10-14: an invalid key answers `400` with `[ERROR 400] Invalid or missing API key`. The docs say the rate
  limit answers `429`.
- D-62 as decided: "the rotating set rotates through a local pool. 'Get new images' downloads the pool only when you
  press it; the daily/weekly/monthly schedule only swaps between local files (no automatic downloading)."

## Decision
- **Key:** checked with one small request, then stored in the editor's settings table (SQLite in the data folder,
  including its daily backups). The browser only ever gets "is there a key" and its last 4 characters. glance.yml never
  holds it. **Change key** forgets it.
- **Chips → requests:** Nature → `nature`, Animals → `animals`, City → `buildings`; Landscape, Mountains, Sea, Forest,
  Sky, Space and Abstract → `category=backgrounds` with that word. One request per chip, results interleaved; always
  `image_type=photo`, `orientation=horizontal`, `safesearch=true`. Responses are cached on disk for 24 h, keyed
  without the key.
- **Pick images myself:** results show Pixabay's preview images (allowed for showing results), with "Images from
  Pixabay" linked. Picks are downloaded by result id (the browser never names a URL) into
  `glance-editor/backgrounds/`, with the photographer's name and page in `<file>.license.json`.
- **Keep a rotating set:** a background entry `pixabay: set-xxxxxx` with its categories, count (10/20/40) and switch
  period. Pressing **Use this set**, or **Get new images** on its row, downloads `count` images into
  `glance-editor/pixabay/<set>/01.jpg … NN.jpg` (fixed names, so what the dashboard links keeps working; each press
  takes the next page of results, so the images are new) with `credits.json`, and copies `01.jpg` to `current.jpg`.
  Nothing else ever downloads.
- **The schedule:** hourly, the editor reads the **live** glance.yml and, for each set whose period has passed, copies
  the pool's next image over `current.jpg`. Files only; glance.yml doesn't change (D-62).
- **What shows:** Image mode shows the set's `current.jpg`; in a slideshow every pool image is a slide.

## Consequences
- **For the PM to confirm (D-62 reading):** in a slideshow the schedule does nothing, since every image in the set is
  already a slide; it matters when the background is a single image. The alternative would be a slideshow showing
  only part of the pool and swapping which part. Say if you want that instead.
- A swapped `current.jpg` can show late in a browser that has it cached (Glance caches `/assets/` for 2 h).
- With 10 chips and "Pick images myself", a search is 10 requests; the 24 h cache keeps repeated searches free.
- Deployment (Phase 11): the editor needs outbound HTTPS to pixabay.com and its image hosts.

## Verified vs assumed
- Verified: `packages/server/test/pixabay.test.ts` (stand-in: key check, rejected and rate-limited answers, request
  parameters, 24 h cache, downloads with credits, the pool and its next page, the schedule, no requests when swapping);
  `test/e2e/pixabay.spec.ts` (the UI end to end; no response to the browser and no line of glance.yml contains the
  key). The invalid-key answer against the real API.
- Not verified: the real API with a valid key (none available to Claude; the PM can try it on the dev editor).

## Decision record
_Accepted when the Phase 10b PR is merged (non-UX)._
