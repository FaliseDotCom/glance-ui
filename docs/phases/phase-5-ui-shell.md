# Phase 5: UI 1 (current phase)

**Status:** implemented on branch `phase-5/ui-shell`. PR open, awaiting PM review.
**Design:** design pass 1 (ADR-0016): IA, flows 1, 2, 6, 7, error and empty states, decisions D-01 to D-10, D-17, D-26 to D-35,
D-41 to D-46. ADR-0018 (accepted) for warnings on Review.

## Acceptance criteria (plan v2)
| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| Flow "Create a dashboard from scratch" at desktop and 390 px | ✅ (Phase 5 part) | `test/e2e/flows.spec.ts` Flow 1. Add widget and the inspector (its steps 3–4) are Phase 6 |
| Flow "Edit a page layout" | ✅ | Flow 2: every step of the design's flow, saved with Glance's reload confirmed |
| Flow "Save → validation error → fix" | ✅ (Phase 5 part) | Flow 6: an editor problem (page name) with Go to, banner and fix; a Glance-only problem with Glance's text and the Fix badge on the widget. Editing the widget itself (YAML tab) is Phase 6 |
| Flow "Roll back" | ✅ | Flow 7: outside edit recorded, line diff, Restore as draft, save makes it the newest version, file equals version 1 |
| Every listed error/empty state can be produced | ✅ for this phase's screens | table below; `test/e2e/states.spec.ts` |
| Keyboard | ✅ | `test/e2e/keyboard.spec.ts`: Start empty → Save → Done by keyboard; dialogs take, keep and return focus; Escape closes; visible focus ring |
| 44 px targets | ✅ | `expectTargets` on every screen the tests visit (all buttons, inputs, selects) |
| axe check in CI | ✅ | `expectAccessible` (WCAG 2.1 A/AA) on every screen the tests visit; runs in `scripts/test.sh` (CI "Tests") |
| Before/after screenshots in the PR | ✅ | `docs/screenshots/phase-5/` (desktop and phone), captured by the tests |

## Error and empty states (design 03)
| State | Here? | Where it is tested |
| ----- | ----- | ------------------ |
| Import: YAML doesn't parse (line, lines around it, Fix here, Start empty, Back) | ✅ | states: "YAML doesn't parse" (fixes it in place and imports; the file stays untouched) |
| Import: parses, Glance rejects | ✅ | states: "Glance rejects" (message verbatim, no Import, Fix offered) |
| Field invalid while typing | ✅ page name | flows: Flow 6 (outline plus a one-line rule; blocks Save, not editing). Widget fields: Phase 6 |
| Save blocked by schema | ✅ | flows: Flow 6 |
| Save blocked by Glance | ✅ | flows: Flow 6, second test (Go to opens the page and marks the widget; its YAML tab is Phase 6) |
| File changed outside the editor (on open; at save: keep draft / load file) | ✅ | flows: Flow 7 (on open); states: both save-time choices |
| Can't write the file | ✅ | states: read-only config dir. Nothing changes, no version is stored, the draft stays |
| Glance not responding | ✅ | states: amber dot, banner, Check again, "reload is not confirmed" after save |
| Validator unavailable | ✅ | states: Save stops before writing, no "save anyway" |
| First run, file found / no file | ✅ | states / Flow 1 |
| No pages (guarded: last page can't be deleted) | ✅ | states |
| Empty column / head | ✅ | states, Flow 1 |
| No history | ✅ | states |
| Background, Pixabay, server folder, image upload | Phase 10 | backgrounds |
| Preview can't build / out of date | Phase 7 | preview |
| No bookmark groups or links, no widget-type search results | Phase 6 | Bookmarks section, Add widget |
| Docker socket unreachable | Phase 8 | containers section |
| No icon search results | Phase 9 | icon finder |

## What was built
- `apps/editor`: the first screens.
  - Global bar: status dot, change count, Discard, Save.
  - Banners: Glance not responding; problems to fix.
  - First run: Welcome, Import with its checks and "Fix the YAML here", Start empty with the six layouts.
  - Pages rail and phone page select.
  - Page editor: name, slug (placeholder shows Glance's own slug), width, toggles, page order, delete.
  - Layout schematic: columns with size, remove and move, each rule enforced by disabling with the reason shown.
    Widget cards are read-only until Phase 6.
  - History: list, detail with change list and a line diff against the live version, Restore as draft.
  - Sheets: Review (with ADR-0018 warnings), Checking, Problems with Go to, Saved, the outside-change choice, Discard,
    Delete page. Undo toasts.
  - Styles: the design's tokens and the prototype's components (`src/lib/styles/app.css`), container query at 760 px.
    Self-hosted fonts.
- `packages/editing`: page and column operations, layout rules, wording helpers, line diff. No DOM, tested in Node,
  including a property test: 2,000 random sequences of enabled operations never produce a layout Glance rejects.
- Server additions: import check and import of corrected text; Glance status; `liveVersion`; version counts; outside
  changes recorded on open; Glance's widget errors located for Go to; a failed write leaves no version.
- Rules: `field.recommended` (ADR-0018), `page.no-name`, `page.reserved-slug` (Glance refuses `login`/`logout`),
  `page.duplicate-slug` (warning). All checked against the real binary or server.
- The importer accepts a column without `widgets:` (valid in Glance; it failed before).

## Differences from the prototype, and why
- Controls are at least 44 × 44 px (D-44), including the segmented buttons (40 px in the prototype), small icon buttons
  (36 px wide) and grips (32 px wide).
- After a save whose reload isn't confirmed, the heading says "Version N is written" instead of "is live", following D-29
  (don't claim the new config is live without a signal).
- Theme, Add widget and widget actions (Phase 6) and Preview (Phase 7) aren't shown yet, rather than shown disabled.
- Version 0 is the imported file (D-35); the prototype numbered the import as version 1.

## Open
None needing a decision.
