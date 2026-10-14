# 0020. The icon finder: name lists, web sources, downloads into Glance's assets folder

- **Status:** accepted (non-UX; by merging the Phase 9 PR, #12, 2026-10-14)
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** no. The screens and the sources are the design's and the PM's (D-21, D-54 to D-56; D-56 decided
  2026-10-13: Iconify + Openverse, Wikimedia Commons as fallback). This ADR is about how the editor gets, caches and
  stores icons.

## Context
- Glance v0.8.6 reads `si:`, `sh:`, `di:`, `mdi:` icons from jsDelivr: simple-icons and @mdi/svg at `@latest`,
  selfh.st at `@main`, dashboard-icons from its default branch. `sh:` and `di:` take a `.png`/`.webp` suffix; anything
  else is used as a URL or path (`config-fields.go` newCustomIconField, source read 2026-10-14; tested by
  `packages/glance/test/icons.test.ts`). `/assets/…` icons don't get `server.base-url` (reconciliation #12).
- Glance serves `server.assets-path` at `/assets/` (`glance.go` 494-497) and refuses to start, and `config:validate`
  fails, when that folder doesn't exist (`config.go` 480; tested 2026-10-14). The editor already validates with a
  temporary folder in its place (Phase 1).
- Each library publishes a name list next to its icons (read 2026-10-14, live):
  - simple-icons `data/simple-icons.json`: `slug`, `title`, `aliases.aka`. 3,466 icons.
  - selfh.st `index.json`: `Reference`, `Name`, `SVG`/`PNG`/`WebP` "Yes"/"No". 2,967 icons, 465 without an SVG.
  - dashboard-icons `tree.json` (files per format) and `metadata.json` (aliases). 2,799 icons, 544 without an SVG.
  - @mdi/svg `meta.json`: `name`, `aliases`, `deprecated`. 7,447 icons, 259 deprecated.
- Web sources (live responses read 2026-10-14):
  - Iconify `GET /search?query=` returns `prefix:name` and per-collection licence and author. Every word must match an
    icon name, so "jellyfin logo" finds nothing.
  - Openverse `GET /v1/images/?q=` returns `url`, `thumbnail`, `license`, `license_version`, `license_url`, `creator`,
    `attribution`, `foreign_landing_url`, without a key.
  - Wikimedia Commons `action=query&generator=search&prop=imageinfo` with `extmetadata` returns the licence and
    artist. Its API policy asks for an identifying User-Agent.

## Decision
- **Name lists:** fetched by the server from the same jsDelivr paths Glance uses, turned into the values Glance
  reads (an icon without an SVG gets `.png`, so Glance doesn't ask for a missing file), and cached in the editor's
  data folder for a week. A list that can't be refreshed is still used; one that was never fetched is reported.
  Search and suggestions run on the server.
- **Previews:** the browser loads each library icon from the URL Glance would load (`iconUrl`, tested against the
  binary). What you pick is what Glance shows.
- **Web search:** Iconify (with words such as "logo" and "icon" dropped) and Openverse at once; Wikimedia Commons when
  Openverse fails or finds nothing. Results carry their licence; the finder shows it.
- **Downloads:** the browser names a result the server offered (an id), never a URL, so the editor fetches only what
  it offered. Limits: 5 MB, 10 s, images only (PNG, JPEG, GIF, WebP, SVG, ICO, recognised by their bytes); an SVG with
  scripts, event handlers or outside links is refused. The file goes to `<assets>/icons/<name>.<ext>` (the same image
  again is reused, a different one gets a number), with `<file>.license.json` next to it: source, title, licence,
  creator, landing page, download URL and time, SHA-256. The value written is `/assets/icons/<file>`.
- **Site icon (D-54):** the server reads the link's page for `apple-touch-icon` or `icon` links (falling back to
  `/favicon.ico`), fetches the best one and holds it; the finder previews it through the editor. It is written only
  when picked. Not offered when the URL is a placeholder (never resolved).
- **Assets folder:** `ASSETS_DIR` is Glance's assets folder as the editor sees it. Downloads need it to be writable,
  and need the draft to set `server.assets-path` (otherwise Glance serves no `/assets/`). Without either, the finder
  says so and the library tabs and URL still work.
- **`/assets/` in the editor:** the editor serves `ASSETS_DIR` read-only at `/assets/`, so `/assets/…` icons show in
  the preview frame (they get no `/preview` prefix) and in the finder. Paths outside the folder answer 404, and files
  are sent with `nosniff` and a sandboxing CSP.
- **Outbound requests:** jsDelivr, api.iconify.design, api.openverse.org, commons.wikimedia.org, the image hosts their
  results point at, and the sites of your links. User-Agent `Glance-Editor/1 (self-hosted dashboard editor)`.

## Consequences
- Deployment (Phase 11) gives the editor outbound HTTPS and mounts Glance's assets folder into it (and into the
  preview Glance at the path `server.assets-path` names).
- A config without `server.assets-path` can't use web or site icons until it sets one. The editor has no screen for
  the `server` section; whether the editor should set it is a question for Phase 10 (backgrounds need the folder too).
- The site-icon lookup fetches any http(s) URL a link names, LAN addresses included (that is how self-hosted services'
  icons are found). Anyone who can use the editor can make it fetch a page; ADR-0004 already accepts LAN-only use.
- `@latest` and `@main` move: a name that disappears upstream disappears from Glance too. The week-old list can
  offer an icon that was just removed (rare).

## Verified vs assumed
- Verified: `packages/glance/test/icons.test.ts` (URLs equal Glance's rendering for every kind of value);
  `packages/server/test/icons.test.ts` (stand-ins: lists, ranking, cache, fallback, download limits and checks, site
  icons); `packages/server/test/icons-live.test.ts` run on 2026-10-14 against the real services (all four lists, every
  preview answered, Iconify + Openverse + download with licence, the Wikimedia fallback, a real site icon);
  `test/e2e/icons.spec.ts` (the finder end to end; Glance serves the downloaded file).
- Not verified: rate limits under heavy use (Openverse anonymous limits, Wikimedia); every site's icon markup.

## Decision record
Accepted 2026-10-14 by merging PR #12 (merged by Claude with the PM's standing permission).
