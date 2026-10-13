# 0008. Backup and rollback (generated configs and editor data)

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** **yes**. It decides the Save flow, a history/restore screen, and what you see when a save is rejected.

## Context
- The editor is the only source of truth. Losing its data means losing the dashboards.
- Glance keeps running on the old config if a new one is invalid, but exits on an invalid config at startup
  (with exit code 0; ADR-0009). So a bad file left on disk is a time bomb for the next restart.
- Atomic replace works only with a directory mount (ADR-0009).

## Proposal

### Save pipeline (every explicit Save)
1. Validate the model (zod) and the layout rules from ADR-0009, and show errors in the UI.
2. Generate YAML. Run the pinned `glance config:validate` against it in a temp dir, with **no env vars or secrets
   present**. Placeholder references are expected to fail validation without them, so validation runs with dummy
   values injected for each referenced placeholder. Feasibility to be proven in Phase 1.
3. Store a new revision (model, YAML, Glance version, validation output) in one transaction (ADR-0002).
4. **Drift check** (ADR-0010): if the live file's sha256 is not the last one written, stop and ask.
5. Copy the live file to `glance.yml.prev` in the same directory, then atomic-write the new file (temp + fsync + rename).
6. Record `applied_at` and the new sha256.
7. Optional: poll the Glance URL (if configured and reachable) to confirm it is up. See "post-save confirmation" below.

### Rollback of the generated config
- **History screen**: a list of revisions (time, note, summary of changes). "Preview diff" and "Restore" make
  a *new* revision with the old content and run it through the same pipeline. History is never rewritten.
- **Emergency path without the editor:** `glance.yml.prev` is always next to the live file, so you can restore
  it by hand with `cp` even if the editor is down. Documented in the runbook.

### Backup of editor data
- An automatic snapshot (`VACUUM INTO`) before every migration and once a day. Keep 14 days plus the last 5 pre-migration snapshots (numbers to confirm).
- "Export everything" (model JSON plus revision YAMLs) as a download, and "Import from export".
- **Off-host backup of the editor volume is your job** (todo-user), because the editor can't reach your backup target.

### Post-save confirmation (open question)
Glance gives no way to read which config it loaded (`/api/healthz` only reports up/down; source v0.8.6). Options:
(a) check that the rendered page contains the new page names (breaks if Glance `auth` is on),
(b) read Glance's logs through the socket proxy (needs log access, a broader permission),
(c) don't confirm, and rely on pre-validation. **Recommendation: (c) for now, (a) as an opt-in.**

## Verified vs assumed
- Verified: atomic replace with a directory mount reloads Glance; invalid config keeps the old one (tests, ADR-0009).
- Verified in Phase 1: validation with dummy placeholder values (ADR-0014; real binary, typed dummies, escapes left to Glance).
- Not verified: SQLite `VACUUM INTO` under the chosen driver; retention numbers.

## Decision record
**Accepted 2026-10-13 by the PM (via chat)**, as written, including the history/restore screen and retention of 14 daily plus 5 pre-migration snapshots. Post-save confirmation: option (c) now, (a) opt-in later.
