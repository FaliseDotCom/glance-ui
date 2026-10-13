# Handoff

The single place to see where the project stands. Updated at the end of every work session and every PR.
Last updated: 2026-10-13 (Phase 5 PR opened).

## Current state
- **Phase:** 5 (UI 1: first screens) **PR open**, waiting for your review. Phase 4 merged (PR #7).
- **Phase plan:** approved 2026-10-13.
- **Pinned Glance:** v0.8.6, by digest (`/glance.version`).
- **Dev environment:** dev Glance on :18180 and the editor container on :18190, on the dev machine (`docs/dev-environment.md`).
- **Feature code:**
  - Phase 1: model, rules, generator, validation.
  - Phase 2: import and edit-in-place writer.
  - Phase 3: server core and JSON API.
  - Phase 4: schemas for every widget type, checked against Glance; built-in themes.
  - Phase 5: the first screens. First run (import with checks, Start empty), pages and column layout, Save with
    Review/Problems/Go to, History with Restore, Discard, undo toasts; desktop and phone.
  - The dev editor on :18190 runs this UI against the dev Glance.

## Needs user decision
Nothing below may be built on until you decide. ★ = affects user experience.

_No decisions open._

## Decided on 2026-10-13 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0001](adr/0001-language-and-framework.md) | TypeScript + **SvelteKit** (TS pinned to 6.x for SvelteKit 3) |
| [0002](adr/0002-data-store.md) / [0003](adr/0003-data-model-migrations.md) / [0007](adr/0007-versioning-and-release-notes.md) | Accepted as written |
| [0004](adr/0004-authentication.md) | **No auth, LAN only**: accepted risk, recorded in the ADR |
| [0005](adr/0005-docker-socket-access.md) | Socket proxy for the editor only. Live Glance keeps its socket |
| [0008](adr/0008-backup-and-rollback.md) / [0010](adr/0010-out-of-band-config-edits.md) | Accepted: history screen, `.prev`, drift detection |
| [0011](adr/0011-import-of-existing-config.md) | One flattened `glance.yml` |
| [0012](adr/0012-design-handoff.md) | Designs via "Handoff to Claude Code", archived in `design/handoffs/`. Mechanism to verify with a sample |
| [0009](adr/0009-glance-behaviour-baseline.md) | Accepted: explicit Save, validate before write, our Glance mounts the config folder |
| [0006](adr/0006-glance-version-pinning.md) | Pin v0.8.6 in **our** stack. The current Unraid Glance is untouched |
| Project scope | The new stack (Glance + editor) **replaces** the current Unraid Glance at cutover. The current one is never modified |
| [0013](adr/0013-license.md) | License: GPL-3.0 |
| Design pass 1 ([ADR-0016](adr/0016-design-pass-1-adopted.md)) | UX source of truth; design wins on UX differences; **proxy overrides D-25**; **D-38 keeps comments** (ADR-0015); archived with the design system's name redacted |
| Plan v2, D-56, D-61, D-62 | Plan v2 approved. Icon Web tab: Iconify + Openverse (Wikimedia fallback). Pixabay: local pool, refreshed only on request; 1280 px accepted |
| [0018](adr/0018-fields-glance-does-not-require.md) | Fields the docs call required but Glance accepts empty: **warn on Review, don't block** |
| Repo / identity | Public GitHub repo. PRs from your gh login, so branch protection has 0 required approvals |

## Findings you should know about
- Glance v0.8.6 **exits with code 0** on an invalid startup config (the docs say "exits with an error").
- With a **single-file bind mount**, Glance does not see atomic saves. A directory mount works. Our stack uses a directory mount; your current Glance (file mount) is unaffected because it gets replaced.
- `config:validate` / `config:print` behave well (validate exits 1 on errors; print keeps placeholders literal).
- The docker label-vs-map precedence is still **untested** (the source suggests the map wins).
- Dev Glance confirmed reachable from another LAN device (by you, 2026-10-13).
- Correction: the Phase 0 docs called the dev machine's Docker "rootless". It is rootful. Fixed in lessons and ADR-0009.

## Phase 5 findings
- Try it: the dev editor at :18190 (`docs/dev-environment.md`). It edits the dev Glance's config only.
- A page named "Login" (or slug `login`/`logout`) passes Glance's validator, but Glance then refuses to load the config.
  The editor now blocks it with a clear message.
- Glance's validation errors name only the widget type. The editor works out which widget it is, so Go to can point at it.
- A file changed by hand is now recorded as soon as the editor is opened (design 03), not only at the next save.
- If glance.yml can't be written, nothing is recorded: no version appears in History (design: "Nothing changed").
- Two saves within the same second can't be told apart by Glance's reload signal ("reload not confirmed"). Rare in use.

## Phase 4 findings
- All 29 widget type names (28 widgets plus `stocks`, an old name for `markets`) now have a schema checked against the real
  Glance binary: required fields, enum values, and that every key is one Glance reads.
- Glance's docs and v0.8.6 differ in places:
  - 17 "required" fields aren't checked (ADR-0018).
  - DNS stats needs a service even though the docs give a default.
  - An iframe without a height is 50 px tall, not 300.
- Refresh (D-58), from the source: Weather and Calendar (legacy) update on the hour. The new Calendar, Clock, Search,
  Bookmarks, To-do, iframe, HTML, Group and Split column fetch nothing. The rest have a default interval that `cache` overrides.
- The 14 built-in themes (11 dark, 3 light) are extracted from Glance's docs at the pinned version, ready for the theme screen.

## Phase 3 findings
- The save pipeline is complete and tested against real Glance, including "reloaded" vs "not confirmed".
- Drafts need two references: the text to splice into, and the live text to measure changes against (found by the restore test).
- SvelteKit 3: `$lib` became `#lib`, and its built-in CSRF check misfires on body-less POSTs. Mutations now must be JSON, which is also a stronger CSRF defence (ADR-0004 note).

## Phase 2 findings
- "Keep your file" works: no-edit saves are byte-identical; random edits keep comments and pass Glance (6 fixes along the way, see lessons).
- One value pattern can't be kept exactly (an escape directly followed by two chained placeholders). It's blocked with a clear message rather than risking silent changes.
- Glance details: `config:print` adds one trailing newline; `$include` swallows the line's `- `; nested include paths are relative to the including file.

## Design verification (Glance v0.8.6, tested)
- The `containers` map beats a `glance.hide` label. Your D-23 choice (read-only "Label") stands as decided.
- There are no framing headers, so in-editor preview is possible (D-48).
- `/assets/` is cached for 2 h, so swapped images can show stale for up to 2 h (D-62).
- Reload signal found (D-29): `manifest.json?v=<time>` changes only on a successful reload.
- In v0.8.6 the new `calendar` widget is static; only `calendar-legacy` and `weather` are hourly (D-58 wording).

## Phase 1 findings
- Glance ignores unknown YAML keys silently, so the model is strict and warns about anything it keeps in `extra`.
- Glance substitutes placeholders as raw text before parsing (comments included). Edge cases are verified and covered by tests.
- The real-binary tests caught a validator bug that my own model-based tests missed. Both kinds of test are kept.

## Next steps
1. You: review and merge the Phase 5 PR. Try the screens on the dev editor (:18190), on desktop and phone.
2. Claude: Phase 6 (UI 2): widget cards with grips and drag, the inspector (Settings and YAML tabs) generated from the
   Phase 4 schemas, Add widget, the Bookmarks section, the Theme screen.

## Session log
- 2026-10-13: Phase 5 implemented (first screens, UI tests at two widths); PR opened. ADR-0018 accepted (option B).
- 2026-10-13: PR #7 (Phase 4) merged.
- 2026-10-13: Phase 4 implemented (widget schemas for every type, schema v2, themes); PR opened. ADR-0018 proposed.
- 2026-10-13: PR #6 (Phase 3) merged.
- 2026-10-13: Phase 3 implemented (server core, API, dev editor wired to dev Glance); PR opened.
- 2026-10-13: Phase 2 implemented (import, writer, report, CLI); PR opened.
- 2026-10-13: Plan v2, D-56, D-61 and D-62 decided by the PM (all as recommended).
- 2026-10-13: Design pass 1 received (zip). Archived; conflicts resolved with the PM; §1 verified against v0.8.6; research done (D-29, D-56, D-61/62); plan v2 proposed.
- 2026-10-13: PR #2 (license) merged. PR #3 rebased onto it.
- 2026-10-13: Phase 1 implemented; PR opened.
- 2026-10-13: PR #1 merged (as a merge commit; the squash-only repo setting isn't applied yet). License PR #2 opened.
- 2026-10-13: Phase 0 built. Then your decisions were applied, the repo was created, the PR opened, and the dev Glance deployed on the dev machine.
