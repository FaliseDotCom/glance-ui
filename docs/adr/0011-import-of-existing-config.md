# 0011. One-time import of the existing glance.yml

- **Status:** accepted; item 4 superseded by ADR-0015/0016 (design D-38)
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** **yes**. It decides what the generated file looks like compared to your current one, and how unsupported settings are shown.

## Context
- Your existing config may use `$include` (supported anywhere, on its own line; docs v0.8.6), placeholders, comments,
  and widgets or options the editor's first versions won't have forms for.
- Glance's `config:print` prints the config with includes resolved (docs v0.8.6). Using the pinned binary for
  include resolution avoids re-implementing it. **Tested 2026-10-13 on v0.8.6:** `config:print` inlines `$include`d
  files but leaves `${VAR}`, `${secret:…}`, `${readFileFromEnv:…}`, `\${…}` and comments **literal**. It also
  succeeds (exit 0) when the referenced env vars are absent. So it can be the first import step.

## Proposal
1. **Flatten `$include`**: the editor writes a single `glance.yml`. The old include files are left untouched on disk and
   listed in the import report. (Alternative: keep one file per page. Your call.)
2. **Placeholders stay literal**, including `\${…}` escapes. The importer never resolves anything.
3. **Unsupported widgets and options are kept, not dropped**: stored as a raw-YAML block attached to the widget
   or page. They are shown in the UI as "Advanced (not editable here)" with a read-only YAML view, and written back
   unchanged.
4. **Comments are lost.** The generated file is output only. The import report lists how many comments were dropped.
5. **Import report** before anything is written: pages, widgets and containers found, items kept as raw, comments
   dropped, placeholders found, and the YAML diff between your current file and the first generated file
   (semantic diff, ignoring formatting). You confirm, then the first Save happens.
6. **Assets:** the current Glance mounts an assets folder (`/app/assets`). The import report lists any config references to
   `/assets/…`. Carrying the folder over to the new stack is part of the Phase 7 runbook.
7. **Fixture-first:** your real config is never used in tests. The main import fixture is **Glance's own example config**
   (`docs/glance.yml` at the pinned commit), downloaded and checksum-checked by `test/upstream-example.sh` (PM decision, 2026-10-13).
   It is not committed (Glance is AGPL-3.0). Our own fixtures cover what it lacks: placeholders, `$include`, docker-containers, bookmarks.

## Verified vs assumed
- Verified: `$include` semantics and `config:print` exist (docs v0.8.6).
- Verified by test: `config:print` behaviour above (one fixture, one include, v0.8.6).
- Not verified: the size and features of your actual config; includes nested more than one level deep.

## Superseded in part (2026-10-13)
Item 4 ("comments are lost") is replaced by design D-38: comments are kept next to the values the editor preserves (ADR-0015). Item 1 (flatten includes) matches design D-36.

## Decision record
**Accepted 2026-10-13 by the PM (via chat)**: one flattened `glance.yml`. Unsupported parts are kept as read-only raw blocks. Comments are dropped and reported.
