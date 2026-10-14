# Phase 7: Preview Glance

**Status:** merged (PR #10, 2026-10-14).
**Design:** design pass 1 (ADR-0016): design 04 "Live preview", flow 8 "Preview before going live", handoff §4b,
design 03 "Preview can't build" and "Preview out of date"; decisions D-39, D-47, D-48, D-49.
**Architecture:** ADR-0019 (non-UX; accepted by the merge).

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| A second Glance at the pinned version, internal only | ✅ | Dev: container `glance-editor-dev-preview` from the pinned image, no published port. Tests: a second real binary per test. The editor serves it under `/preview` (ADR-0019) |
| Framed full screen at desktop or phone width | ✅ | `test/e2e/preview.spec.ts` flow 8: the frame shows the draft as Glance renders it, Desktop/Phone (390 px) switch |
| "Out of date", Refresh | ✅ | Flow 8 step 3: change after building → Preview shows "Out of date" until Refresh; Refresh keeps the page the frame was on |
| Save and go live | ✅ | Flow 8 step 4: opens the normal Review → Check and save → "Version 1 is live"; the preview closes |
| Refuses an invalid draft with the same Problems list | ✅ | Flow 8 step 5 (empty Weather location): "No preview was built …", Go to, fix, Preview builds. `packages/server/test/preview.test.ts`: the problems equal Save's, for an editor check and a Glance-only one |
| Never touches glance.yml | ✅ | Both test files compare glance.yml byte for byte after every preview; no version is added |

## Error and empty states added in this phase (design 03)
| State | Where it is tested |
| ----- | ------------------ |
| Preview can't build: draft invalid | preview.spec "5. a problem in the draft…"; server test (editor and Glance problems) |
| Preview can't build: preview Glance doesn't answer ("The preview Glance didn't start. Live Glance is unaffected.", Retry, Back to editing) | preview.spec "design 03: preview can't build"; server test |
| Preview out of date (amber, with an icon) | preview.spec flow 8 step 3 |
| No preview Glance set up: no Preview button, `/preview` answers 404 | preview.spec "no preview Glance set up"; server test |

## What was built
- **Server** (`Editor.checkForPreview`, `Editor.preview`): Save's checks 1-3 are now one shared function, so Preview and
  Save report the same problems (D-47). The preview text is Save's text with the `server` section pointed at the
  editor's `/preview` route. The editor waits for the preview Glance's reload stamp (D-29), first waiting out its 1 s
  resolution. It seeds a missing preview config at start.
- **Proxy** (`/preview/…`): forwards every method to the preview Glance; same origin, so framing always works (D-48).
- **UI:** a Preview button in the top bar (enabled with unsaved changes, D-49); "Checking the draft before building a
  preview"; the full-screen preview with its bar (Preview · not live, status, Desktop/Phone, Refresh, Back to editing,
  Save and go live); "Starting the preview" while the preview Glance loads; the failed state with Retry.
  Escape goes back to editing; the editor behind is inert while the preview is open; focus returns to Preview.
- **Dev environment:** `dev/up.sh` starts the preview Glance and gives the editor `PREVIEW_CONFIG` and `PREVIEW_GLANCE_URL`.

## Differences from the prototype, and why
- **Preview again after an edit shows the old build, marked out of date.** The prototype rebuilt at once. Flow 8 step 3
  and handoff §4b step 5 say the status shows "out of date until you press Refresh" and "only Refresh rebuilds".
- **The inspector stays open behind the preview.** The prototype closed it; here Back to editing returns to the same place.
- **The frame stays loaded while hidden.** Going back to editing and returning doesn't make the preview Glance fetch
  every widget's data again (design 04's rate-limit cost); Refresh does.
- **Refresh stays on the page the frame was showing** (if the draft still has it), not the page open in the editor.
- **No Preview button when no preview Glance is set up** (the prototype always had one). A real install always has it
  (Phase 11); the dev and test setups without one show no button rather than one that can't work.

## Open
None needing a decision.
