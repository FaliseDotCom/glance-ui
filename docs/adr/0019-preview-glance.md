# 0019. The preview Glance: a second container, served by the editor under /preview

- **Status:** proposed (non-UX; accepted when the Phase 7 PR is merged, per the ADR README)
- **Date:** 2026-10-14
- **Decider:** PM
- **UX impact:** no. The screens are the design's (design 04, D-39, D-47 to D-49). This ADR is about how the preview
  Glance runs and how the browser reaches it.

## Context
- Design 04 and handoff §4b: Preview builds the draft on a separate preview Glance at the pinned version, "different
  port, not exposed beyond the editor", shown framed inside the editor (D-48), with the same environment and Docker
  socket as live. The design's cost note accepts one extra container.
- Glance v0.8.6 (source at the pinned commit, read 2026-10-14):
  - `server.base-url` is put in front of every link and script path Glance writes: page links in `page.html`, static
    assets (`StaticAssetPath`), `manifest.json`, `/assets/` paths, and the `pageData.baseURL` that its scripts use for
    `/api/pages/{page}/content/` and `/api/set-theme/{key}` (`glance.go` 196, 274, 437-443; `page.js` 9, 674).
  - Its own routes don't include the base URL (`glance.go` `server()`), so a proxy that strips the prefix fits it.
  - It sends no `X-Frame-Options` or CSP headers (tested 2026-10-13, reconciliation #17).
  - An unset environment variable in a placeholder fails the config load (`config.go` 197-218), so the preview Glance
    needs the same environment as live to render a config that uses them.

## Options
### A. A second container, reached only through the editor at `/preview` (chosen)
The editor writes the preview's own `glance.yml` in a directory shared with the preview container, and forwards
`/preview/*` to it. Same origin as the editor, so framing always works and no extra port is published.
Cons: one more container to deploy (accepted in design 04).

### B. A second container on its own published port, framed cross-origin
Simpler proxying, but another LAN port, and framing depends on whatever proxy sits in front of it.

### C. The editor runs the bundled glance binary as a child process
No extra container, and the editor could stop it when idle and capture Glance's error text. But the editor would need
live's environment and socket, and it departs from the design's stated architecture. Kept as a possible later change.

## Decision
Option A:
- **Config:** `PREVIEW_CONFIG` (the preview's `glance.yml`, never `glance.yml` itself) and `PREVIEW_GLANCE_URL` (the
  preview Glance as the editor sees it). Without both, there is no Preview button.
- **Build** (`Editor.preview`): the same steps 1-3 as Save (D-47), then the same rendered text, with one change: the
  `server` section gets `base-url: /preview`, the port from `PREVIEW_GLANCE_URL`, and a host only for a loopback URL
  (the test harness), and a closing comment with the build time: Glance reloads only when the file's bytes change
  (`config.go` 367), so without it a Refresh of an unchanged draft would never load. Written atomically, without a `.prev`. Then the editor waits for the preview's reload stamp to
  change (D-29), first waiting out the stamp's 1 s resolution so two quick builds are told apart.
- **Seed:** the preview Glance exits on a missing config, so the editor writes a one-page seed at start if the file is
  missing (the dev scripts write the same seed before starting the container).
- **Proxy:** every method under `/preview` is forwarded, trailing slashes kept (Glance's routes depend on them).
  Hop-by-hop headers are dropped. Non-GET requests must carry this host's `Origin` (the theme picker posts with no
  body, so the JSON rule of ADR-0004 doesn't apply here).
- **CSRF:** SvelteKit's built-in form check refused the same-origin, body-less POST (it compares with an origin
  adapter-node doesn't know, lessons Phase 3), so it is turned off (`csrf.trustedOrigins: ["*"]`). The editor's hook
  already checks `Origin` against `Host` on every non-GET request, and still requires JSON outside `/preview`.

## Consequences
- The framed page runs Glance's scripts, and the config's own `document.head`/HTML widgets, with the editor's origin.
  That is the user's own config, and ADR-0004 already accepts that anyone on the LAN can use the editor's API.
- Deployment (Phase 11) has to give the preview container the same environment file, assets folder (at the same path,
  if `server.assets-path` is set) and Docker access as live. Docker access follows ADR-0005 then; the dev environment
  mirrors the dev Glance (read-only socket).
- Every Refresh makes the preview Glance fetch widget data afresh (accepted in design 04). The frame stays loaded while
  hidden, so going back to editing and returning doesn't refetch.

## Verified vs assumed
- Verified (tests, real binary v0.8.6): `packages/server/test/preview.test.ts` (build, base-url links, placeholders
  substituted only by the preview Glance, two builds within a second, refused drafts write nothing, a preview Glance
  that doesn't answer, seed accepted by `config:validate`); `test/e2e/preview.spec.ts` (flow 8 through the proxy,
  Origin checks); the dev environment (container image at the pinned digest) built a preview through the editor.
- Not verified: a reverse proxy in front of the editor (it would see `/preview` as part of the editor); a preview
  Glance with an assets folder or auth users.

## Decision record
_Filled in by the PM._
