# 0002. Data store

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** no directly. It enables the revision history that ADR-0008 proposes.

## Context
- The editor owns the whole Glance config. The model is small (one person's dashboards: tens of KB).
- Every Save must be recoverable (ADR-0008). Writes are rare and from one user.
- It runs in one container with one volume. No separate database server is wanted in a homelab.

## Options
### A. SQLite file on the editor's volume (recommended)
- Transactions: a Save writes the new revision and the "current" pointer together, or not at all.
- One file. Online backups with `VACUUM INTO`.
- Driver: `better-sqlite3` 13.0.3 (npm, 2026-10-13), or Node's built-in `node:sqlite` (its stability in Node 24 is **not verified**).
- Cons: binary diffs, so you can't read history with `git diff`.

### B. JSON files on disk (one current file + a revisions directory)
- Human-readable and easy to diff and back up.
- Cons: atomicity across several files has to be hand-rolled, and concurrent tabs can race.

### C. Postgres
- Cons: an extra container and operational overhead. Nothing here needs it.

## Recommendation
**A. SQLite**, schema-light:
- `meta(key, value)`: includes `schema_version` (ADR-0003).
- `revisions(id, created_at, schema_version, model_json, generated_yaml, glance_version, validation_output, applied_at, note)`.
- `state(current_revision_id, last_written_sha256)`. `last_written_sha256` supports drift detection (ADR-0010).

The model is stored as one validated JSON document per revision. That keeps migrations (ADR-0003) as pure
functions on JSON, rather than SQL DDL migrations.
Plus: **export/import of the model as a JSON file** for portability and manual backup.

## Consequences
- Driver choice (`better-sqlite3` vs `node:sqlite`) is settled in Phase 1 after checking `node:sqlite` status for the pinned Node.
- The volume holding the SQLite file must not be on a network filesystem. SQLite locking over NFS/SMB is unreliable (general knowledge, not verified for this host).

## Verified vs assumed
- Verified: `better-sqlite3` latest version (npm registry, 2026-10-13).
- Not verified: `node:sqlite` stability; the live host's storage type.

## Decision record
**Accepted 2026-10-13 by the PM (via chat)**, as written. The driver choice is still settled in Phase 1.
