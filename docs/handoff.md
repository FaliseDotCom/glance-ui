# Handoff

The single place to see where the project stands. Updated at the end of every work session and every PR.
Last updated: 2026-10-13 (design pass 1 received and reconciled).

## Current state
- **Phase:** 1 merged (PR #3). Design pass 1 reconciled (PR #4 open). Plan v2 **approved**; Phase 2 starts with the ADR-0015 spike.
- **Phase plan:** approved 2026-10-13.
- **Pinned Glance:** v0.8.6, by digest (`/glance.version`).
- **Dev environment:** dev Glance on :18180 and the editor container on :18190, on the dev machine (`docs/dev-environment.md`).
- **Feature code:** data model, rules, generator, validation against the pinned binary; editor container (no UI) running in the dev environment on :18190.

## Needs user decision
Nothing below may be built on until you decide. ★ = affects user experience.

_No UX decisions open._ ADR-0015 (how D-38 is built, non-UX) is accepted with the PR that implements it, after the Phase 2a spike.

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
| Repo / identity | Public GitHub repo. PRs from your gh login, so branch protection has 0 required approvals |

## Findings you should know about
- Glance v0.8.6 **exits with code 0** on an invalid startup config (the docs say "exits with an error").
- With a **single-file bind mount**, Glance does not see atomic saves. A directory mount works. Our stack uses a directory mount; your current Glance (file mount) is unaffected because it gets replaced.
- `config:validate` / `config:print` behave well (validate exits 1 on errors; print keeps placeholders literal).
- The docker label-vs-map precedence is still **untested** (the source suggests the map wins).
- Dev Glance confirmed reachable from another LAN device (by you, 2026-10-13).
- Correction: the Phase 0 docs called the dev machine's Docker "rootless". It is rootful. Fixed in lessons and ADR-0009.

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
1. You: review and merge PR #4.
2. Claude: Phase 2a spike (ADR-0015), then report before building 2b.

## Session log
- 2026-10-13: Plan v2, D-56, D-61 and D-62 decided by the PM (all as recommended).
- 2026-10-13: Design pass 1 received (zip). Archived; conflicts resolved with the PM; §1 verified against v0.8.6; research done (D-29, D-56, D-61/62); plan v2 proposed.
- 2026-10-13: PR #2 (license) merged. PR #3 rebased onto it.
- 2026-10-13: Phase 1 implemented; PR opened.
- 2026-10-13: PR #1 merged (as a merge commit; the squash-only repo setting isn't applied yet). License PR #2 opened.
- 2026-10-13: Phase 0 built. Then your decisions were applied, the repo was created, the PR opened, and the dev Glance deployed on the dev machine.
