# Phase plan v2: approved by the PM, 2026-10-13

v1 (approved 2026-10-13, in git history) covered Phases 0–7. v2 (2026-10-13) folds in design pass 1 (ADR-0016) and the
PM's resolutions (`docs/design/reconciliation.md`). Phases 0 and 1 are done. **Approved by the PM via chat on 2026-10-13**, together with D-56, D-61 and D-62 (see reconciliation §3).

Every phase ends with an open PR (never merged by Claude), CI green, `handoff.md` updated, and a status report split into
tested / concluded / not checked. **Nothing writes to the live Glance before the go-live phase.**
"Flow" means a flow in `design/handoffs/2026-10-13-first-pass/package/docs/02-key-flows.md`, played end to end against a real
Glance v0.8.6, on desktop and at 390 px.

| Phase | Name | Design decisions | Status |
| ----- | ---- | ---------------- | ------ |
| 0 | Setup | none | ✅ merged (#1, #2) |
| 1 | Data model and generator | none | ✅ merged (#3) |
| 2 | Import + document-preserving writer (no UI) | D-14, D-34–D-38 | next |
| 3 | Server core: drafts, versions, save pipeline, API (no UI) | D-26–D-33, D-46, D-29 | |
| 4 | Widget schema for all 27 types | D-11, D-58, handoff §3 | |
| 5 | UI 1: shell, pages and columns, Save/Review/Problems, History, first run | D-01–D-10, D-17, D-26–D-35 (UI), D-40–D-44 | |
| 6 | UI 2: widgets, inspector and forms, YAML override, bookmarks, theme | D-11–D-20, D-50, D-51, D-57, D-63 | |
| 7 | Preview Glance | D-39, D-47–D-49 | |
| 8 | Docker containers section (via the proxy) | D-22–D-24, ADR-0005 | |
| 9 | Icon finder | D-21, D-54–D-56 | D-56 decided: Iconify + Openverse |
| 10 | Backgrounds, server folders, Pixabay | D-52, D-53, D-59–D-62 | D-61/D-62 decided (1280 px; local pool) |
| 11 | Packaging, Unraid deployment, cutover, v1.0.0 | ADR-0006/0007/0008, deployment ADR | |

---

## Phase 2: Import + document-preserving writer
**Scope:**
- 2a: a feasibility spike for ADR-0015 (splicing edits into the base text).
- 2b: the import pipeline: `config:print` → model view plus `passthrough` for unmanaged sections → import report (includes, placeholders, comments, unknown keys, raw widgets), with includes merged per D-36.
- 2b: the writer that applies model edits to the base text.
- Start empty uses the Phase 1 generator.

No UI; the entry point is a CLI.
**Acceptance:**
- [ ] No-edit round trip is **byte-identical** to `config:print` output for every fixture and for Glance's upstream example (handoff §8).
- [ ] Random edit sequences (property test): the result passes `config:validate`, its Glance view equals the model, untouched lines are unchanged, comments stay with their values, and placeholders are never resolved (test asserts no env access).
- [ ] Unknown widget types and unknown keys survive edits to neighbouring items.
- [ ] Spliced output renders correctly in a real Glance server (Phase 1 render tests reused).

## Phase 3: Server core (no UI)
**Scope:**
- SQLite store (ADR-0002) and migrations framework (ADR-0003).
- One server-side draft (D-46).
- Numbered full-snapshot versions with source editor / import / outside editor; version 0 on the first write over an existing file (D-30, D-35); outside-editor detection at start and on Save (D-32).
- The save pipeline (handoff §4): schema check → `config:validate` → drift check → store version → atomic write plus `.prev` → reload signal (`?v=`, D-29).
- Restore into the draft (D-31), Discard (D-33).
- Problems with locations (D-28).
- HTTP API. `Origin` check on mutating requests (ADR-0004).

Writes go only to the test and dev Glance.
**Acceptance:**
- [ ] Every save-pipeline branch has a test, including "validator can't run → nothing written".
- [ ] An invalid draft never touches the file.
- [ ] "Reloaded" vs "not confirmed" is detected against a real Glance.
- [ ] Restore never writes. Drift offers keep or load, and the outside version is stored first.

## Phase 4: Widget schema for all 27 types
**Scope:**
- `WidgetSchema` (handoff §3) for every type Glance v0.8.6 accepts, generated from source and docs and checked in.
- Cache visibility from the v0.8.6 table (D-58; reconciliation §2 item 2).
- Extend the typed model or derive it from the schema (decided in the phase; non-UX).

**Acceptance:**
- [ ] A test fails if any Glance type lacks a schema entry.
- [ ] Each schema's required fields and enums match Glance (validated against the binary).
- [ ] Theme swatches regenerated from v0.8.6 `docs/themes.md`.

## Phase 5: UI 1
**Scope:**
- Design tokens and self-hosted fonts.
- Layout shell (container query at 760 px).
- Global Save bar, Review, Checking, Problems (Go to), Saved sheets.
- Pages rail/select, page editor, columns with rules enforced by disabling (D-07–D-10).
- History and version detail with Restore as draft.
- First run (Import / Start empty).
- Undo toasts.

**Acceptance:** flows "Create a dashboard from scratch", "Edit a page layout", "Save → validation error → fix" and "Roll back" pass at desktop width and at 390 px. Every listed error/empty state can be produced. Keyboard and 44 px targets. axe check in CI. Before/after screenshots in the PR.

## Phase 6: UI 2
**Scope:**
- Widget cards with grips (D-15), inspector with Settings/YAML tabs (D-12), generated forms, Children (D-05).
- Add widget (D-18).
- Bookmarks section (D-13, D-19, D-57).
- Theme screen: gallery, swatches and picker, My colours (D-20, D-50, D-51, D-63).

**Acceptance:** flows "Add and configure a widget" and "Edit bookmarks" pass, with the icon field still free text until Phase 9. A YAML override round-trips unknown keys.

## Phase 7: Preview Glance
**Scope:**
- A second Glance at the pinned version, internal only.
- Preview pipeline (handoff §4b): framed full screen at desktop or phone width (framing verified possible), "Out of date", Refresh, Save and go live.

**Acceptance:** Preview refuses an invalid draft and shows the same Problems list. It never touches glance.yml.

## Phase 8: Docker containers section
**Scope:**
- Socket proxy (ADR-0005).
- Container list, eye toggles writing the `containers` map (D-22, D-24).
- Label-hidden containers shown read-only (D-23).

**Acceptance:** flow "Hide a container". A `POST` through the proxy is refused.

## Phase 9: Icon finder
**Scope:**
- Tabs: Suggested, All libraries, si/sh/di/mdi, Web, URL (D-21, D-54).
- Name indexes cached on the server.
- Site icon fetch and web image download into `/assets/icons/`, with license and attribution stored (D-55).
- Web tab: Iconify search API and Openverse, with Wikimedia Commons as fallback (D-56, decided 2026-10-13).

**Acceptance:** icon search for bookmark and monitor fields. No third-party URLs end up in glance.yml from the Web tab.

## Phase 10: Backgrounds, server folders, Pixabay
**Scope:**
- Editor-owned CSS in assets referenced by `theme.custom-css-file` (D-52); slideshow, with the shuffle script via `document.head` only when Shuffle is chosen (D-53).
- Image sources: device, server folder (D-59, D-60), Pixabay (D-61, D-62 as decided: "Get new images" downloads a pool only when
  you press it; the schedule only rotates through local files; API results cached 24 h; largeImageURL (≤1280 px); the picker
  credits Pixabay when showing results).

**Acceptance:** background and slideshow render in Preview and live (dev Glance). API keys never reach the browser or glance.yml.

## Phase 11: Packaging, Unraid deployment, cutover
**Scope:**
- A deployment ADR first (Unraid templates vs compose plugin; volumes for glance.yml dir, assets, server photo folders, editor data; proxy; preview Glance; outbound network).
- Release image with Glance's license and source pointer (ADR-0013).
- Runbooks.
- The new stack runs side by side with the current Glance; import; compare; cutover (the current Glance is never modified).

**Acceptance:**
- [ ] You follow the install runbook yourself.
- [ ] Side-by-side comparison signed off.
- [ ] Cutover and fallback rehearsed.
- [ ] v1.0.0 release notes approved.
