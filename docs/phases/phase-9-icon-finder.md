# Phase 9: Icon finder (current phase)

**Status:** implemented on branch `phase-9/icon-finder`. PR open; merged by Claude once CI is green (PM, 2026-10-14).
**Design:** design pass 1 (ADR-0016): flow 4 step 3, D-21, D-54, D-55, D-56 (decided 2026-10-13: Iconify + Openverse,
Wikimedia Commons as fallback), design 03 "No search results".
**Architecture:** ADR-0020 (non-UX; accepted on merge).

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| Tabs: Suggested, All libraries, si/sh/di/mdi, Web, URL (D-21, D-54) | ✅ | `test/e2e/icons.spec.ts`, desktop and 390 px. Every result shows its value and library |
| Name lists cached on the server | ✅ | `packages/server/test/icons.test.ts`: a week on disk; a list that can't be refreshed is still used |
| Site icon and web image downloaded into `/assets/icons/`, licence and credit stored (D-55) | ✅ | e2e: the file and `<file>.license.json` in the assets folder; the real Glance serves the file |
| Web tab: Iconify and Openverse, Wikimedia Commons as fallback (D-56) | ✅ | Server tests with stand-ins; `icons-live.test.ts` against the real services (2026-10-14) |
| Icon search for bookmark and monitor fields | ✅ | e2e: a bookmark link (flow 4 step 3) and a monitor site use the same finder |
| No third-party URLs in glance.yml from the Web tab | ✅ | e2e: after Save every `icon:` is a library value or `/assets/…`; picking downloads first |

## Error and empty states (design 03 and this phase)
| State | Where it is tested |
| ----- | ------------------ |
| No search results: "No icon with that name. Try another word, or search the web." | e2e |
| Site icon unavailable for a `${VAR}` URL (D-54) | e2e |
| No assets folder: web and site icons can't be picked, and the finder says why; libraries and URL still work | e2e "without an assets folder" |
| A name list can't be loaded | server test (shown as "Couldn't load the … list: …") |
| A web source fails | server test (shown as "Not available: …") |
| A download is refused (too large, not an image, an SVG with scripts) | server test |

## What was built
- **Shared** (`packages/editing/src/icons.ts`): `iconUrl`, the URL Glance loads for any icon value, tested against
  the binary; library names; `siteOf` (no site icon for a placeholder URL).
- **Server** (`packages/server/src/icons.ts`, `/api/icons/*`): name lists, search and suggestions, web search, the
  site icon, downloads with licence files. `/assets/…` served read-only from `ASSETS_DIR`.
- **UI** (`IconFinder.svelte`): opened by **Find** next to every icon field (bookmark links, and generated forms, so
  monitor sites and any future icon field). Picking sets the field and closes the finder; Remove icon clears it.
- **Dev environment:** an assets folder at `/app/assets` in both Glances and `ASSETS_DIR` for the editor.

## Differences from the prototype, and why
- **Web results come in two groups,** "Icons · from Iconify" and "Images · from Openverse" (or Wikimedia Commons),
  each result with its licence. The prototype had placeholders, since the service wasn't chosen yet.
- **The site icon is previewed before it is saved:** the editor fetches it when the finder opens and saves it only
  when picked. The prototype named a file at once.
- **Library tabs show at most 60 results,** with "Showing the first 60 of N. Type more of the name to narrow it down."
- **The tabs wrap onto two lines** in the dialog (eight tabs don't fit one line at 390 px or beside the title).

## Wording not in the design (for PM review)
"Looking for matches…", "Looking for the site’s own icon…", "Site icon from <domain>", "Downloaded to Glance’s assets
folder when you pick it", "No site icon: …", "Icons · from Iconify", "Images · from Openverse", "Nothing found on the
web for “…”.", "Picking a web result needs Glance's assets folder. …", "Check that you may use an image before picking
it. Its licence and credit are saved next to it in the assets folder.", "Loading the icon lists…", "Showing the first
60 of N. …", "Couldn't load the … list: …", "Not available: …".

## Open
- **A config without `server.assets-path` can't use web or site icons** (Glance wouldn't serve the file). The editor
  has no screen for the `server` section. Backgrounds (Phase 10) need the folder too, so Phase 10 proposes how the
  folder gets set.
